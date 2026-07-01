import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface HeroSliderProps {
  images: string[];
}

const HERO_COPY = [
  {
    title: 'Especificacao premium para arquitetos',
    description: 'Catalogo, marcas, fichas tecnicas e projetos em um fluxo limpo para a loja e para o escritorio.',
  },
  {
    title: 'Colecao com ritmo comercial',
    description: 'A YLEON conecta arquitetos, vendedores e produtos em uma experiencia objetiva e elegante.',
  },
  {
    title: 'Ambientes que viram decisao',
    description: 'Uma plataforma visual para escolher marcas, comparar pecas e organizar cada projeto.',
  },
  {
    title: 'Da inspiracao ao atendimento',
    description: 'Projetos, favoritos e solicitacoes centralizados para acelerar a operacao da loja.',
  },
];

export default function HeroSlider({ images }: HeroSliderProps) {
  const slides = useMemo(
    () => images.filter(Boolean).map((media, index) => ({
      media,
      ...HERO_COPY[index % HERO_COPY.length],
    })),
    [images],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % slides.length);
    }, 6200);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const activeSlide = slides[activeIndex] ?? slides[0];
  if (!activeSlide) return null;

  return (
    <section className="relative min-h-[calc(100svh-var(--app-navbar-total-height))] overflow-hidden bg-[#1f1d1a]">
      <div className="absolute inset-0">
        {slides.map((slide, index) => (
          <img
            key={slide.media}
            src={slide.media}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-out ${
              index === activeIndex ? 'opacity-100' : 'opacity-0'
            }`}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'auto'}
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,16,14,0.76)_0%,rgba(18,16,14,0.42)_42%,rgba(18,16,14,0.18)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/50 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-var(--app-navbar-total-height))] max-w-7xl items-end px-6 pb-16 pt-20 md:px-12 md:pb-20 lg:px-16">
        <div className="max-w-3xl">
          <div className="mb-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.28em] text-[#f5ead9]/72">
            <span className="h-px w-10 bg-[#e0632c]" />
            YLEON / SPECIFICA
          </div>
          <h1 className="font-serif text-4xl leading-[0.96] text-[#fff7ea] md:text-6xl lg:text-7xl">
            {activeSlide.title}
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-7 text-[#fff7ea]/70 md:text-base">
            {activeSlide.description}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/catalog"
              className="inline-flex items-center justify-center gap-3 rounded-full bg-[#e0632c] px-7 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#241a12] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#ff8a4c]"
            >
              Acessar catalogo
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link
              to="/projects"
              className="inline-flex items-center justify-center gap-3 rounded-full border border-white/20 bg-white/10 px-7 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#fff7ea] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/16"
            >
              Ver projetos
            </Link>
          </div>
          <div className="mt-12 flex items-center gap-3">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  index === activeIndex ? 'w-10 bg-[#e0632c]' : 'w-4 bg-white/35 hover:bg-white/60'
                }`}
                aria-label={`Ver imagem ${index + 1}`}
                aria-pressed={index === activeIndex}
              />
            ))}
            <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
              {String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
