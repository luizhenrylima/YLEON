import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { ClickyButton } from '@/components/ui/clicky-button';
import logoYleon from '@/assets/logo-yleon.png';
import HeroSlider from '@/components/HeroSlider';
import ElegantCarousel from '@/components/ui/elegant-carousel';
import type { SlideData } from '@/components/ui/elegant-carousel';
import { CircularTestimonials } from '@/components/ui/circular-testimonials';
import ShowroomExperienceSection from '@/components/ShowroomExperienceSection';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

import landing2 from '@/assets/landing-2.jpg';
import landing4 from '@/assets/landing-4.jpg';

const fallbackImages = [landing2, landing4];
const DOIMO_MATTERPORT_URL = 'https://my.matterport.com/show/?m=qFtSXog5cdT&play=1&brand=1&title=1&tourcta=1&vrcoll=0&dh=1&mt=1&ss=1&sr=.54,-1.38';
const DOIMO_SHOWROOM_DESCRIPTION = [
  'Localizado a apenas dois quarteirões da Avenida Paulista, o casarão eclético é um dos mais belos exemplares das antigas residências de luxo do bairro da Bela Vista.',
  'Nos fundos, uma grande edícula serviu de residência para funcionários da casa. Além dela, existe um terreno amplo com plantas e árvores, fazendo desta casa um verdadeiro oásis na selva de pedra próxima da Avenida Paulista.',
  'E se o imóvel é belo por fora, ele é ainda mais encantador por dentro, com vitrais coloridos, lareira de mármore, escadarias e armários trabalhados de madeira, além de amplos banheiros e decoração suntuosa.',
];
const DOIMO_SHOWROOM_INFO = [
  { label: 'Localização', value: 'Bela Vista · São Paulo' },
  { label: 'Coleção', value: 'Doimo' },
  { label: 'Experiência', value: 'Tour virtual 3D' },
];

const LANDING_DESIGNER_FIELDS = 'id, name, description, photo_url, display_order';
const LANDING_IMAGE_FIELDS = 'id, image_url, alt_text, display_order';
const LANDING_CATEGORY_FIELDS = 'id, name';
const LANDING_FEATURED_PRODUCT_FIELDS = 'id, display_order, product:products(id, name, category, images, is_hidden, brand:brands(name, is_hidden))';
const LANDING_FEATURED_PRODUCT_FALLBACK_FIELDS = 'id, display_order, product:products(id, name, category, images, brand:brands(name))';

interface Designer {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  display_order: number;
}

interface LandingImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  display_order: number;
}

interface FeaturedProduct {
  id: string;
  display_order: number;
  product: {
    id: string;
    name: string;
    category: string;
    images: string[] | null;
    is_hidden?: boolean | null;
    brand: { name: string; is_hidden?: boolean | null } | null;
  } | null;
}

interface Category {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  is_hidden?: boolean | null;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [landingImages, setLandingImages] = useState<LandingImage[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<FeaturedProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [designers, featuredProducts, categories]);

  const setSectionRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    []
  );

  useEffect(() => {
    const fetchData = async () => {
      const [d, li, cat] = await Promise.all([
        supabase.from('featured_designers').select(LANDING_DESIGNER_FIELDS).order('display_order'),
        supabase.from('landing_images').select(LANDING_IMAGE_FIELDS).order('display_order'),
        supabase.from('categories').select(LANDING_CATEGORY_FIELDS).order('name'),
      ]);
      let featuredResult = await supabase
        .from('featured_products')
        .select(LANDING_FEATURED_PRODUCT_FIELDS)
        .order('display_order');
      if (featuredResult.error && isHiddenColumnMissing(featuredResult.error)) {
        featuredResult = await supabase
          .from('featured_products')
          .select(LANDING_FEATURED_PRODUCT_FALLBACK_FIELDS)
          .order('display_order');
      }
      let brandsResult = await supabase.from('brands').select('id, name, logo_url, is_hidden').eq('is_hidden', false).order('name');
      if (brandsResult.error && isHiddenColumnMissing(brandsResult.error)) {
        brandsResult = await supabase.from('brands').select('id, name, logo_url').order('name');
      }
      setDesigners((d.data as Designer[]) || []);
      setLandingImages((li.data as LandingImage[]) || []);
      setFeaturedProducts(((featuredResult.data as FeaturedProduct[]) || [])
        .filter(item => !item.product || (
          isCatalogRecordVisible(item.product, getLocalHiddenProductIds())
          && item.product.brand?.is_hidden !== true
        )));
      setCategories((cat.data as Category[]) || []);
      setBrands(mergeLocalHiddenState((brandsResult.data as Brand[]) || [], getLocalHiddenBrandIds())
        .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds())));
    };
    fetchData();
  }, []);

  const images =
    landingImages.length > 0 ? landingImages.map((li) => li.image_url) : fallbackImages;

  // images used by hero slider and gallery

  const validProducts = featuredProducts.filter((fp) => fp.product);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Helmet>
        <title>YLEON — Mobiliário Brasileiro Contemporâneo</title>
        <meta name="description" content="Curadoria YLEON de mobiliário de luxo para arquitetos e designers. Marcas exclusivas, acabamentos e blocos 3D em um só lugar." />
        <link rel="canonical" href="/" />
        <meta property="og:title" content="YLEON — Mobiliário Brasileiro Contemporâneo" />
        <meta property="og:description" content="Curadoria de mobiliário de luxo para arquitetos e designers." />
        <meta property="og:url" content="/" />
      </Helmet>
      {/* ═══════════ HERO — WEBGL CINEMATIC ═══════════ */}
      <HeroSlider images={images} />

      {/* ═══════════ MARQUEE TICKER ═══════════ */}
      <div className="py-5 border-y border-border/50 overflow-hidden bg-background">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...Array(3)].map((_, rep) => (
            <div key={rep} className="flex items-center gap-8 mr-8">
              {['Mobiliário', 'Iluminação', 'Revestimentos', 'Metais', 'Louças', 'Tecidos'].map(
                (item) => (
                  <span
                    key={`${rep}-${item}`}
                    className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 flex items-center gap-3"
                  >
                    <span className="w-1 h-1 rounded-full bg-accent/40" />
                    {item}
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ CURADORIA — MANIFESTO ═══════════ */}
      <section
        id="curadoria"
        ref={setSectionRef('curadoria')}
        className={`py-32 px-8 md:px-16 lg:px-24 bg-background transition-all duration-1000 ${
          visibleSections.has('curadoria')
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-16'
        }`}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24 items-center">
            {/* Left — Editorial text */}
            <div>
              <p className="label-xs text-accent mb-6" style={{ letterSpacing: '0.35em' }}>
                Nossa Curadoria
              </p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-foreground leading-[1.1] mb-8">
                Selecionamos o que há de{' '}
                <span className="italic text-accent">melhor</span> para o seu projeto
              </h2>
              <div className="space-y-5 text-sm text-muted-foreground font-light leading-relaxed">
                <p>
                  A YLEON nasceu para ser a extensão do escritório do arquiteto.
                  Reunimos marcas nacionais e internacionais criteriosamente escolhidas,
                  com foco em design autoral, qualidade construtiva e exclusividade.
                </p>
                <p>
                  Cada produto em nosso catálogo passa por uma curadoria rigorosa — oferecemos
                  blocos 3D, fichas técnicas, acabamentos e suporte dedicado para que você
                  especifique com confiança e agilidade.
                </p>
              </div>
              <div className="mt-10">
                <Link to="/catalog">
                  <ClickyButton variant="accent" size="default">
                    Explorar o catálogo
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </ClickyButton>
                </Link>
              </div>
            </div>

            {/* Right — Stats / pillars */}
            <div className="grid grid-cols-2 gap-5">
              {[
                { number: '50+', label: 'Marcas selecionadas' },
                { number: '2000+', label: 'Produtos curados' },
                { number: '100%', label: 'Blocos 3D disponíveis' },
                { number: '∞', label: 'Suporte ao arquiteto' },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className="bg-secondary/40 rounded-2xl p-7 flex flex-col justify-between min-h-[140px] hover:bg-accent/5 transition-all duration-500"
                  style={{ transitionDelay: `${i * 80}ms` }}
                >
                  <span className="text-3xl md:text-4xl font-serif text-accent">{stat.number}</span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-3">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Brands logo marquee */}
          {brands.length > 0 && (
            <div className="mt-20 pt-16 border-t border-border/30">
              <p className="label-xs text-muted-foreground/50 text-center mb-10" style={{ letterSpacing: '0.3em' }}>
                Marcas que representamos
              </p>
              <div className="relative overflow-hidden">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
                <div className="flex animate-marquee-slow whitespace-nowrap">
                  {[...Array(3)].map((_, rep) => (
                    <div key={rep} className="flex items-center gap-14 mr-14 shrink-0">
                      {brands.map((brand) => (
                        <Link
                          key={`${rep}-${brand.id}`}
                          to={`/brand/${brand.id}`}
                          className="flex items-center justify-center h-12 w-28 shrink-0 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
                        >
                          {brand.logo_url ? (
                            <img
                              src={brand.logo_url}
                              alt={brand.name}
                              className="max-h-full max-w-full object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-xs font-serif text-muted-foreground whitespace-nowrap">
                              {brand.name}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════ FEATURED PRODUCTS — EDITORIAL LAYOUT ═══════════ */}
      {validProducts.length > 0 && (() => {
        const accentColors = ['#C4956A', '#8BA7B8', '#7A9E7E', '#D4A955'];
        const carouselSlides: SlideData[] = validProducts.map((fp, i) => ({
          title: fp.product!.name,
          subtitle: fp.product!.brand?.name || fp.product!.category,
          description: '',
          accent: accentColors[i % accentColors.length],
          imageUrl: fp.product!.images?.[0] || '/placeholder.svg',
          linkTo: `/product/${fp.product!.id}`,
        }));

        return (
          <section
            id="featured-products"
            ref={setSectionRef('featured-products')}
            className={`py-28 px-8 md:px-16 lg:px-24 bg-card relative transition-all duration-1000 ${
              visibleSections.has('featured-products')
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-16'
            }`}
          >
            <div className="absolute top-0 left-0 right-0 -translate-y-full pointer-events-none overflow-hidden h-16">
              <svg viewBox="0 0 1440 64" fill="none" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0 64H1440V0C1440 0 1080 48 720 48C360 48 0 0 0 0V64Z" fill="hsl(var(--card))" />
              </svg>
            </div>

            <div className="max-w-7xl mx-auto">
              <div className="flex items-end justify-between mb-12">
                <div>
                  <p className="label-xs text-accent mb-3">Novidades</p>
                  <h2 className="text-3xl md:text-5xl font-serif text-foreground">
                    Em <span className="italic text-accent">destaque</span>
                  </h2>
                </div>
                <Link to="/catalog">
                  <ClickyButton variant="outline" size="sm" className="hidden md:inline-flex">
                    Ver todos <ArrowUpRight className="w-3.5 h-3.5" />
                  </ClickyButton>
                </Link>
              </div>

              <ElegantCarousel
                slides={carouselSlides}
                onSlideClick={(index) => {
                  const fp = validProducts[index];
                  if (fp?.product) navigate(`/product/${fp.product.id}`);
                }}
              />

              <div className="text-center mt-12 md:hidden">
                <Link to="/catalog">
                  <ClickyButton variant="accent" size="sm">
                    Ver todos os produtos <ArrowRight className="w-3.5 h-3.5" />
                  </ClickyButton>
                </Link>
              </div>
            </div>
          </section>
        );
      })()}

      {/* ═══════════ DESIGNERS — EDITORIAL SPLIT ═══════════ */}
      {designers.length > 0 && (
        <section
          id="designers"
          ref={setSectionRef('designers')}
          className={`py-28 px-8 md:px-16 lg:px-24 bg-background transition-all duration-1000 ${
            visibleSections.has('designers')
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-16'
          }`}
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <p className="label-xs text-accent mb-3">Destaque</p>
              <h2 className="text-3xl md:text-5xl font-serif text-foreground mb-4">
                Designers em <span className="italic text-accent">Evidência</span>
              </h2>
              <div className="w-16 h-px bg-accent mx-auto" />
            </div>

            <CircularTestimonials
              testimonials={designers.map((d) => ({
                name: d.name,
                designation: 'Designer',
                quote: d.description || '',
                src: d.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&size=300&background=random`,
              }))}
              autoplay
            />
          </div>
        </section>
      )}

      {/* ═══════════ GALLERY GRID — EDITORIAL MOSAIC ═══════════ */}
      <ShowroomExperienceSection
        id="casarao-doimo"
        sectionRef={setSectionRef('casarao-doimo')}
        className={`transition-all duration-1000 ${
          visibleSections.has('casarao-doimo')
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-16'
        }`}
        eyebrow="SHOWROOM CASARÃO DOIMO"
        title="Conheça o"
        highlightedTitle="Casarão Doimo"
        description={DOIMO_SHOWROOM_DESCRIPTION}
        infoItems={DOIMO_SHOWROOM_INFO}
        tourUrl={DOIMO_MATTERPORT_URL}
        primaryCtaLabel="Abrir experiência"
        secondaryCtaLabel="Ver detalhes"
      />
      <section
        id="gallery"
        ref={setSectionRef('gallery')}
        className={`py-28 px-8 md:px-16 lg:px-24 bg-card relative transition-all duration-1000 ${
          visibleSections.has('gallery')
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-16'
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="label-xs text-accent mb-3">Galeria</p>
            <h2 className="text-3xl md:text-5xl font-serif text-foreground mb-4">
              Ambientes <span className="italic text-accent">Inspiradores</span>
            </h2>
            <div className="w-16 h-px bg-accent mx-auto" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {images.slice(0, 5).map((img, i) => (
              <div
                key={i}
                className={`overflow-hidden rounded-2xl card-hover ${
                  i === 0 ? 'col-span-2 row-span-2' : ''
                }`}
              >
                <img
                  src={img}
                  alt={`Ambiente ${i + 1}`}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 aspect-square"
                  loading="lazy"
                  width={600}
                  height={600}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA — CINEMATIC DARK ═══════════ */}
      <section className="relative py-32 px-8 overflow-hidden" style={{ background: 'hsl(var(--foreground))' }}>
        <div className="absolute inset-0 noise-overlay pointer-events-none opacity-30" />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="label-xs text-accent mb-5" style={{ letterSpacing: '0.35em' }}>
            Comece Agora
          </p>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-serif text-background mb-6 leading-tight">
            Seu próximo projeto
            <br />
            <span className="italic text-background/70">começa aqui</span>
          </h2>
          <p className="text-sm text-background/40 mb-12 font-light max-w-md mx-auto leading-relaxed">
            Acesse blocos 3D, fichas técnicas e acabamentos das marcas mais exclusivas do mercado.
          </p>
          <Link to="/catalog">
            <ClickyButton variant="glass" size="lg" className="text-background border-background/15 hover:bg-background hover:text-foreground">
              Ver Catálogo
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </ClickyButton>
          </Link>
        </div>
      </section>

      {/* ═══════════ FOOTER — MINIMAL ═══════════ */}
      <footer className="py-16 border-t border-border/50 bg-background">
        <div className="max-w-7xl mx-auto px-8 flex flex-col items-center gap-6">
          <img src={logoYleon} alt="YLEON" className="h-20 opacity-90 drop-shadow-[0_8px_22px_rgba(28,35,20,0.12)]" />
          <div className="flex gap-8 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <Link to="/catalog" className="hover:text-accent transition-colors">
              Catálogo
            </Link>
            <Link to="/favorites" className="hover:text-accent transition-colors">
              Favoritos
            </Link>
            <Link to="/projects" className="hover:text-accent transition-colors">
              Projetos
            </Link>
            <Link to="/privacidade" className="hover:text-accent transition-colors">
              Privacidade
            </Link>
            <Link to="/termos" className="hover:text-accent transition-colors">
              Termos de Uso
            </Link>
          </div>
          <div className="gold-divider w-48" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
            Plataforma Exclusiva para Arquitetos
          </p>
        </div>
      </footer>
    </div>
  );
}
