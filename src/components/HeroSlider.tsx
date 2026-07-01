import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

declare const gsap: any;
declare const THREE: any;

interface HeroSlide {
  title: string;
  description: string;
  media: string;
}

interface HeroSliderProps {
  images: string[];
}

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    title: 'Design que transforma',
    description: 'Uma curadoria exclusiva de mobiliário contemporâneo para projetos de alta estética.',
    media: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1920&q=80',
  },
  {
    title: 'Estética & Função',
    description: 'Blocos 3D, fichas técnicas e acabamentos em um só lugar.',
    media: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=1920&q=80',
  },
  {
    title: 'Curadoria Exclusiva',
    description: 'Marcas nacionais e internacionais criteriosamente escolhidas.',
    media: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1920&q=80',
  },
  {
    title: 'Projetos Únicos',
    description: 'Especifique com confiança e agilidade usando nossas ferramentas.',
    media: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1920&q=80',
  },
];

export default function HeroSlider({ images }: HeroSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [isWebglReady, setIsWebglReady] = useState(false);

  const fallbackMedia = useMemo(
    () => images.find(Boolean) || DEFAULT_SLIDES[0].media,
    [images]
  );

  const getSlides = useCallback((): HeroSlide[] => {
    if (images.length > 0) {
      return images.map((url, i) => ({
        ...DEFAULT_SLIDES[i % DEFAULT_SLIDES.length],
        media: url,
      }));
    }
    return DEFAULT_SLIDES;
  }, [images]);

  useEffect(() => {
    const loadScript = (src: string, globalName: string) =>
      new Promise<void>((res, rej) => {
        if ((window as any)[globalName]) { res(); return; }
        if (document.querySelector(`script[src="${src}"]`)) {
          const check = setInterval(() => {
            if ((window as any)[globalName]) { clearInterval(check); res(); }
          }, 50);
          setTimeout(() => { clearInterval(check); rej(new Error(`Timeout: ${globalName}`)); }, 10000);
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => setTimeout(() => res(), 100);
        s.onerror = () => rej(new Error(`Failed: ${src}`));
        document.head.appendChild(s);
      });

    let cancelled = false;

    const init = async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js', 'gsap');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'THREE');
      } catch (e) {
        console.error('Failed to load scripts:', e);
        containerRef.current?.classList.add('loaded');
        return;
      }
      if (cancelled) return;
      initSlider();
    };

    const initSlider = () => {
      setIsWebglReady(false);
      const slides = getSlides();
      let currentSlideIndex = 0;
      let isTransitioning = false;
      let shaderMaterial: any, renderer: any, scene: any, camera: any;
      let slideTextures: any[] = [];
      let texturesLoaded = false;
      let autoSlideTimer: any = null;
      let progressAnimation: any = null;
      let sliderEnabled = false;
      let animFrameId: number;

      const SLIDE_DURATION = 5000;
      const PROGRESS_INTERVAL = 50;
      const TRANSITION_DURATION = 2.5;

      const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
      const fragmentShader = `
        uniform sampler2D uTexture1, uTexture2;
        uniform float uProgress;
        uniform vec2 uResolution, uTexture1Size, uTexture2Size;
        varying vec2 vUv;
        vec2 getCoverUV(vec2 uv, vec2 texSize) {
          vec2 s = uResolution / texSize;
          float scale = max(s.x, s.y);
          vec2 scaled = texSize * scale;
          vec2 offset = (uResolution - scaled) * 0.5;
          return (uv * uResolution - offset) / scaled;
        }
        void main() {
          vec2 uv1 = getCoverUV(vUv, uTexture1Size);
          vec2 uv2 = getCoverUV(vUv, uTexture2Size);
          float maxR = length(uResolution) * 0.85;
          float br = uProgress * maxR;
          vec2 p = vUv * uResolution;
          vec2 c = uResolution * 0.5;
          float d = length(p - c);
          float nd = d / max(br, 0.001);
          float param = smoothstep(br + 3.0, br - 3.0, d);
          vec4 img;
          if (param > 0.0) {
            float ro = 0.08 * pow(smoothstep(0.3, 1.0, nd), 1.5);
            vec2 dir = (d > 0.0) ? (p - c) / d : vec2(0.0);
            vec2 distUV = uv2 - dir * ro;
            float ca = 0.02 * pow(smoothstep(0.3, 1.0, nd), 1.2);
            img = vec4(
              texture2D(uTexture2, distUV + dir * ca * 1.2).r,
              texture2D(uTexture2, distUV + dir * ca * 0.2).g,
              texture2D(uTexture2, distUV - dir * ca * 0.8).b,
              1.0
            );
            float rim = smoothstep(0.95, 1.0, nd) * (1.0 - smoothstep(1.0, 1.01, nd));
            img.rgb += rim * 0.08;
          } else {
            img = texture2D(uTexture2, uv2);
          }
          vec4 oldImg = texture2D(uTexture1, uv1);
          if (uProgress > 0.95) img = mix(img, texture2D(uTexture2, uv2), (uProgress - 0.95) / 0.05);
          gl_FragColor = mix(oldImg, img, param);
        }
      `;

      const renderSplitText = (element: HTMLElement, text: string) => {
        element.replaceChildren();
        for (const ch of text) {
          const span = document.createElement('span');
          span.style.display = 'inline-block';
          span.textContent = ch === ' ' ? '\u00a0' : ch;
          element.appendChild(span);
        }
      };

      const updateContent = (idx: number) => {
        const titleEl = document.getElementById('heroTitle');
        const descEl = document.getElementById('heroDesc');
        if (!titleEl || !descEl) return;

        gsap.to(titleEl.children, { y: -20, opacity: 0, duration: 0.5, stagger: 0.02, ease: 'power2.in' });
        gsap.to(descEl, { y: -10, opacity: 0, duration: 0.4, ease: 'power2.in' });

        setTimeout(() => {
          renderSplitText(titleEl, slides[idx].title);
          descEl.textContent = slides[idx].description;
          gsap.set(titleEl.children, { opacity: 0 });
          gsap.set(descEl, { y: 20, opacity: 0 });

          const children = titleEl.children;
          const anim = idx % 4;
          if (anim === 0) {
            gsap.set(children, { y: 20 });
            gsap.to(children, { y: 0, opacity: 1, duration: 0.8, stagger: 0.03, ease: 'power3.out' });
          } else if (anim === 1) {
            gsap.set(children, { y: -20 });
            gsap.to(children, { y: 0, opacity: 1, duration: 0.8, stagger: 0.03, ease: 'back.out(1.7)' });
          } else if (anim === 2) {
            gsap.set(children, { scale: 0, y: 0 });
            gsap.to(children, { scale: 1, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'back.out(1.5)' });
          } else {
            gsap.set(children, { x: 30, y: 0 });
            gsap.to(children, { x: 0, opacity: 1, duration: 0.8, stagger: 0.03, ease: 'power3.out' });
          }
          gsap.to(descEl, { y: 0, opacity: 1, duration: 0.8, delay: 0.2, ease: 'power3.out' });
        }, 500);
      };

      const stopTimer = () => {
        if (progressAnimation) clearInterval(progressAnimation);
        if (autoSlideTimer) clearTimeout(autoSlideTimer);
        progressAnimation = null;
        autoSlideTimer = null;
      };

      const updateProgress = (idx: number, prog: number) => {
        const el = document.querySelectorAll('.hero-nav-item')[idx]?.querySelector('.hero-progress-fill') as HTMLElement;
        if (el) { el.style.width = `${prog}%`; el.style.opacity = '1'; }
      };

      const resetProgress = (idx: number) => {
        const el = document.querySelectorAll('.hero-nav-item')[idx]?.querySelector('.hero-progress-fill') as HTMLElement;
        if (el) {
          el.style.transition = 'width 0.2s ease-out';
          el.style.width = '0%';
          setTimeout(() => (el.style.transition = 'width 0.1s ease, opacity 0.3s ease'), 200);
        }
      };

      const fadeProgress = (idx: number) => {
        const el = document.querySelectorAll('.hero-nav-item')[idx]?.querySelector('.hero-progress-fill') as HTMLElement;
        if (el) { el.style.opacity = '0'; setTimeout(() => (el.style.width = '0%'), 300); }
      };

      const updateNav = (idx: number) =>
        document.querySelectorAll('.hero-nav-item').forEach((el, i) => el.classList.toggle('active', i === idx));

      const updateCounter = (idx: number) => {
        const sn = document.getElementById('heroSlideNum');
        const st = document.getElementById('heroSlideTotal');
        if (sn) sn.textContent = String(idx + 1).padStart(2, '0');
        if (st) st.textContent = String(slides.length).padStart(2, '0');
      };

      const navigateToSlide = (target: number) => {
        if (isTransitioning || target === currentSlideIndex) return;
        stopTimer();
        resetProgress(currentSlideIndex);

        const cur = slideTextures[currentSlideIndex];
        const tgt = slideTextures[target];
        if (!cur || !tgt) return;

        isTransitioning = true;
        shaderMaterial.uniforms.uTexture1.value = cur;
        shaderMaterial.uniforms.uTexture2.value = tgt;
        shaderMaterial.uniforms.uTexture1Size.value = cur.userData.size;
        shaderMaterial.uniforms.uTexture2Size.value = tgt.userData.size;

        updateContent(target);
        currentSlideIndex = target;
        updateCounter(target);
        updateNav(target);

        gsap.fromTo(
          shaderMaterial.uniforms.uProgress,
          { value: 0 },
          {
            value: 1,
            duration: TRANSITION_DURATION,
            ease: 'power2.inOut',
            onComplete: () => {
              shaderMaterial.uniforms.uProgress.value = 0;
              shaderMaterial.uniforms.uTexture1.value = tgt;
              shaderMaterial.uniforms.uTexture1Size.value = tgt.userData.size;
              isTransitioning = false;
              safeStart(100);
            },
          }
        );
      };

      const handleNext = () => {
        if (isTransitioning || !texturesLoaded || !sliderEnabled) return;
        navigateToSlide((currentSlideIndex + 1) % slides.length);
      };

      const startTimer = () => {
        if (!texturesLoaded || !sliderEnabled) return;
        stopTimer();
        let progress = 0;
        const inc = (100 / SLIDE_DURATION) * PROGRESS_INTERVAL;
        progressAnimation = setInterval(() => {
          if (!sliderEnabled) { stopTimer(); return; }
          progress += inc;
          updateProgress(currentSlideIndex, progress);
          if (progress >= 100) {
            clearInterval(progressAnimation!);
            progressAnimation = null;
            fadeProgress(currentSlideIndex);
            if (!isTransitioning) handleNext();
          }
        }, PROGRESS_INTERVAL);
      };

      const safeStart = (delay = 0) => {
        stopTimer();
        if (sliderEnabled && texturesLoaded) {
          if (delay > 0) autoSlideTimer = setTimeout(startTimer, delay);
          else startTimer();
        }
      };

      // Build navigation
      const nav = document.getElementById('heroSlidesNav');
      if (nav) {
        nav.replaceChildren();
        slides.forEach((slide, i) => {
          const item = document.createElement('div');
          item.className = `hero-nav-item${i === 0 ? ' active' : ''}`;
          item.dataset.slideIndex = String(i);
          const progress = document.createElement('div');
          progress.className = 'hero-progress-bar';
          const progressFill = document.createElement('div');
          progressFill.className = 'hero-progress-fill';
          progress.appendChild(progressFill);
          const label = document.createElement('span');
          label.className = 'hero-nav-label';
          label.textContent = slide.title;
          item.append(progress, label);
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isTransitioning && i !== currentSlideIndex) {
              stopTimer();
              resetProgress(currentSlideIndex);
              navigateToSlide(i);
            }
          });
          nav.appendChild(item);
        });
      }

      updateCounter(0);

      // Init text
      const tEl = document.getElementById('heroTitle');
      const dEl = document.getElementById('heroDesc');
      if (tEl && dEl) {
        renderSplitText(tEl, slides[0].title);
        dEl.textContent = slides[0].description;
        gsap.fromTo(tEl.children, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.03, ease: 'power3.out', delay: 0.5 });
        gsap.fromTo(dEl, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.8 });
      }

      // Renderer
      const canvas = containerRef.current?.querySelector('.hero-webgl') as HTMLCanvasElement;
      if (!canvas) return;

      try {
        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
      } catch (error) {
        console.warn('Hero WebGL unavailable, using static image fallback.', error);
        containerRef.current?.classList.add('loaded');
        return;
      }
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      shaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTexture1: { value: null },
          uTexture2: { value: null },
          uProgress: { value: 0 },
          uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
          uTexture1Size: { value: new THREE.Vector2(1, 1) },
          uTexture2Size: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader,
        fragmentShader,
      });
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial));

      const loadTex = (src: string) =>
        new Promise<any>((resolve, reject) => {
          const loader = new THREE.TextureLoader();
          loader.setCrossOrigin?.('anonymous');
          loader.load(
            src,
            (t: any) => {
              t.minFilter = t.magFilter = THREE.LinearFilter;
              t.userData = { size: new THREE.Vector2(t.image.width, t.image.height) };
              resolve(t);
            },
            undefined,
            reject
          );
        });

      (async () => {
        for (const s of slides) {
          try { slideTextures.push(await loadTex(s.media)); } catch { console.warn('Failed texture'); }
        }
        if (cancelled || slideTextures.length < 1) {
          containerRef.current?.classList.add('loaded');
          return;
        }

        shaderMaterial.uniforms.uTexture1.value = slideTextures[0];
        shaderMaterial.uniforms.uTexture2.value = slideTextures[1] || slideTextures[0];
        shaderMaterial.uniforms.uTexture1Size.value = slideTextures[0].userData.size;
        shaderMaterial.uniforms.uTexture2Size.value = (slideTextures[1] || slideTextures[0]).userData.size;
        texturesLoaded = true;
        sliderEnabled = slideTextures.length > 1;

        containerRef.current?.classList.add('loaded');
        setIsWebglReady(true);
        if (sliderEnabled) safeStart(500);
      })();

      const render = () => {
        animFrameId = requestAnimationFrame(render);
        renderer.render(scene, camera);
      };
      render();

      const onVisChange = () => (document.hidden ? stopTimer() : !isTransitioning && safeStart());
      const onResize = () => {
        if (renderer) {
          renderer.setSize(window.innerWidth, window.innerHeight);
          shaderMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        }
      };

      document.addEventListener('visibilitychange', onVisChange);
      window.addEventListener('resize', onResize);

      cleanupRef.current = () => {
        stopTimer();
        cancelAnimationFrame(animFrameId);
        document.removeEventListener('visibilitychange', onVisChange);
        window.removeEventListener('resize', onResize);
        if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
        slideTextures.forEach((t) => t?.dispose?.());
      };
    };

    init();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [getSlides]);

  return (
    <section
      ref={containerRef}
      className="hero-slider-wrapper relative h-screen overflow-hidden bg-cover bg-center"
      style={{ backgroundImage: `url("${fallbackMedia}")` }}
    >
      <canvas
        className={`hero-webgl absolute inset-0 w-full h-full transition-opacity duration-700 ${
          isWebglReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/70 z-[1]" />
      <div className="absolute inset-0 noise-overlay pointer-events-none opacity-30 z-[2]" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-end pb-24 md:pb-32 px-8 md:px-16 lg:px-24">
        <div className="max-w-4xl">
          {/* Counter */}
          <div className="hero-counter flex items-center gap-2 mb-6">
            <span id="heroSlideNum" className="text-white/80 text-xs font-mono">01</span>
            <span className="w-8 h-px bg-white/30" />
            <span id="heroSlideTotal" className="text-white/40 text-xs font-mono">04</span>
          </div>

          <h1
            id="heroTitle"
            className="text-5xl md:text-7xl lg:text-[5.5rem] font-serif text-white leading-[0.95] mb-6"
          />
          <p
            id="heroDesc"
            className="text-sm md:text-base text-white/50 font-light max-w-lg mb-10 leading-relaxed"
          />

          <Link
            to="/catalog"
            className="group inline-flex items-center gap-3 bg-white/10 backdrop-blur-md text-white px-10 py-4 text-[10px] uppercase tracking-[0.3em] hover:bg-white hover:text-foreground transition-all duration-700 rounded-full border border-white/15"
          >
            Explorar Catálogo
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Slide navigation */}
      <div id="heroSlidesNav" className="hero-slides-nav absolute bottom-10 right-8 md:right-16 z-10 flex flex-col gap-2" />
    </section>
  );
}
