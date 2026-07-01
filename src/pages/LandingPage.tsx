import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, Building2, CheckCircle2, Sparkles, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import HeroSlider from '@/components/HeroSlider';
import ElegantCarousel from '@/components/ui/elegant-carousel';
import type { SlideData } from '@/components/ui/elegant-carousel';
import { ClickyButton } from '@/components/ui/clicky-button';
import logoYleon from '@/assets/logo-yleon.png';
import homeEssenza from '@/assets/home-essenza-abimad-optimized.jpg';
import homeApartamento from '@/assets/home-apartamento-rr.webp';
import homeCasacor from '@/assets/home-casacor-refugio.webp';
import homeLiving from '@/assets/home-living-premium.jpg';
import {
  getLocalHiddenBrandIds,
  getLocalHiddenProductIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

const homeImages = [homeEssenza, homeApartamento, homeCasacor, homeLiving];

const LANDING_CATEGORY_FIELDS = 'id, name';
const LANDING_FEATURED_PRODUCT_FIELDS = 'id, display_order, product:products(id, name, category, images, is_hidden, brand:brands(name, is_hidden))';
const LANDING_FEATURED_PRODUCT_FALLBACK_FIELDS = 'id, display_order, product:products(id, name, category, images, brand:brands(name))';

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

const architectBenefits = [
  'Catalogo filtrado por marcas, categorias, ambientes e estilos.',
  'Favoritos, comparacao e projetos proprios em uma unica area.',
  'Blocos 3D, fichas tecnicas e acabamentos liberados para especificacao.',
];

const storeBenefits = [
  'Rotina comercial, carteira de arquitetos e projetos por vendedor.',
  'Marcas visiveis ou ocultas sem apagar historico e produtos.',
  'Perfis de equipe preparados para gestao, CEO e financeiro.',
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [featuredProducts, setFeaturedProducts] = useState<FeaturedProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [cat] = await Promise.all([
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

      let brandsResult = await supabase
        .from('brands')
        .select('id, name, logo_url, is_hidden')
        .eq('is_hidden', false)
        .order('name');

      if (brandsResult.error && isHiddenColumnMissing(brandsResult.error)) {
        brandsResult = await supabase.from('brands').select('id, name, logo_url').order('name');
      }

      setCategories((cat.data as Category[]) || []);
      setBrands(
        mergeLocalHiddenState((brandsResult.data as Brand[]) || [], getLocalHiddenBrandIds())
          .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds())),
      );
      setFeaturedProducts(
        ((featuredResult.data as FeaturedProduct[]) || []).filter(item => !item.product || (
          isCatalogRecordVisible(item.product, getLocalHiddenProductIds())
          && item.product.brand?.is_hidden !== true
        )),
      );
    };

    void fetchData();
  }, []);

  const validProducts = featuredProducts.filter((fp) => fp.product);
  const categoryHighlights = useMemo(() => categories.slice(0, 6), [categories]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Helmet>
        <title>YLEON - Plataforma exclusiva para arquitetos</title>
        <meta name="description" content="Plataforma YLEON/SPECIFICA para catalogo, projetos, arquitetos e operacao comercial de loja premium." />
        <link rel="canonical" href="/" />
        <meta property="og:title" content="YLEON - Plataforma exclusiva para arquitetos" />
        <meta property="og:description" content="Catalogo, marcas e projetos em uma experiencia premium para arquitetos e lojistas." />
      </Helmet>

      <HeroSlider images={homeImages} />

      <section className="border-y border-border/50 bg-background py-5">
        <div className="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-6 md:px-12">
          {['Catalogo premium', 'Projetos', 'Favoritos', 'Blocos 3D', 'Acabamentos', 'Operacao comercial'].map(item => (
            <span key={item} className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="px-6 py-24 md:px-12 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="label-xs mb-5 text-accent">Plataforma YLEON/SPECIFICA</p>
            <h2 className="font-serif text-3xl leading-tight text-foreground md:text-5xl">
              Uma loja, uma colecao, uma operacao mais clara.
            </h2>
          </div>
          <div className="space-y-5 text-sm leading-7 text-muted-foreground">
            <p>
              A YLEON foi organizada para arquitetos cadastrados manualmente pelo Admin e para uma equipe comercial que precisa acompanhar especificacoes, clientes e projetos sem ruído.
            </p>
            <p>
              O foco da Home agora e apresentar a plataforma com menos blocos, imagens melhores e acesso direto ao catalogo e aos projetos.
            </p>
          </div>
        </div>

        <div className="mx-auto mt-14 grid max-w-7xl gap-4 md:grid-cols-3">
          {[
            { icon: Building2, label: `${brands.length || ' '} marcas`, text: 'Marcas visiveis no catalogo e controladas pelo Admin.' },
            { icon: Sparkles, label: 'Colecao', text: 'Produtos selecionados para especificacao premium.' },
            { icon: Users, label: 'Arquitetos', text: 'Acesso fechado para profissionais cadastrados pela loja.' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-border bg-card p-6">
                <Icon className="mb-5 h-5 w-5 text-accent" aria-hidden="true" />
                <h3 className="font-serif text-2xl text-foreground">{item.label}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {brands.length > 0 && (
        <section className="border-y border-border/50 bg-card px-6 py-20 md:px-12 lg:px-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="label-xs mb-3 text-accent">Marcas em destaque</p>
                <h2 className="font-serif text-3xl text-foreground md:text-4xl">Disponiveis no catalogo</h2>
              </div>
              <Link to="/catalog" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent/70">
                Ver catalogo <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {brands.slice(0, 12).map(brand => (
                <Link key={brand.id} to={`/brand/${brand.id}`} className="flex h-24 items-center justify-center rounded-lg border border-border bg-background p-4 transition-colors hover:border-accent/50">
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={brand.name} className="max-h-12 max-w-full object-contain" loading="lazy" />
                  ) : (
                    <span className="text-center font-serif text-sm text-foreground">{brand.name}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="px-6 py-24 md:px-12 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          {[
            { title: 'Para arquitetos', icon: BadgeCheck, items: architectBenefits },
            { title: 'Para lojistas e vendedores', icon: BriefcaseBusiness, items: storeBenefits },
          ].map(group => {
            const Icon = group.icon;
            return (
              <div key={group.title} className="rounded-lg border border-border bg-card p-8">
                <div className="mb-7 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/12 text-accent">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="font-serif text-2xl text-foreground">{group.title}</h2>
                </div>
                <div className="space-y-4">
                  {group.items.map(item => (
                    <div key={item} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {validProducts.length > 0 && (() => {
        const accentColors = ['#E0632C', '#8BA7B8', '#7A9E7E', '#D4A955'];
        const carouselSlides: SlideData[] = validProducts.map((fp, i) => ({
          title: fp.product!.name,
          subtitle: fp.product!.brand?.name || fp.product!.category,
          description: '',
          accent: accentColors[i % accentColors.length],
          imageUrl: fp.product!.images?.[0] || '/placeholder.svg',
          linkTo: `/product/${fp.product!.id}`,
        }));

        return (
          <section className="bg-card px-6 py-24 md:px-12 lg:px-16">
            <div className="mx-auto max-w-7xl">
              <div className="mb-12 flex items-end justify-between">
                <div>
                  <p className="label-xs mb-3 text-accent">Novidades</p>
                  <h2 className="font-serif text-3xl text-foreground md:text-5xl">Produtos em destaque</h2>
                </div>
                <Link to="/catalog">
                  <ClickyButton variant="outline" size="sm" className="hidden md:inline-flex">
                    Ver todos <ArrowUpRight className="h-3.5 w-3.5" />
                  </ClickyButton>
                </Link>
              </div>
              <ElegantCarousel slides={carouselSlides} onSlideClick={(index) => {
                const fp = validProducts[index];
                if (fp?.product) navigate(`/product/${fp.product.id}`);
              }} />
            </div>
          </section>
        );
      })()}

      <section className="px-6 py-24 md:px-12 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-xs mb-3 text-accent">Ambientes</p>
              <h2 className="font-serif text-3xl text-foreground md:text-5xl">Referencias para especificar</h2>
            </div>
            {categoryHighlights.length > 0 && (
              <div className="flex max-w-xl flex-wrap gap-2">
                {categoryHighlights.map(category => (
                  <span key={category.id} className="rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {category.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {homeImages.map((img, index) => (
              <div key={img} className={`overflow-hidden rounded-lg border border-border bg-card ${index === 0 ? 'col-span-2 row-span-2' : ''}`}>
                <img src={img} alt={`Ambiente YLEON ${index + 1}`} className="h-full min-h-56 w-full object-cover transition-transform duration-700 hover:scale-[1.03]" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#241a12] px-6 py-28 md:px-12">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <p className="label-xs mb-5 text-[#ff8a4c]">Comece agora</p>
          <h2 className="font-serif text-3xl leading-tight text-[#fff7ea] md:text-5xl">
            Acesse o catalogo e organize seu proximo projeto.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-[#fff7ea]/60">
            Acesso exclusivo para arquitetos, vendedores e equipe cadastrada pela YLEON.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/catalog">
              <ClickyButton variant="glass" size="lg" className="border-white/20 text-[#fff7ea] hover:bg-[#fff7ea] hover:text-[#241a12]">
                Ver catalogo
                <ArrowRight className="h-3.5 w-3.5" />
              </ClickyButton>
            </Link>
            <Link to="/projects">
              <ClickyButton variant="outline" size="lg" className="border-white/20 text-[#fff7ea] hover:bg-white/10">
                Meus projetos
              </ClickyButton>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 bg-background py-14">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-6">
          <img src={logoYleon} alt="YLEON" className="h-20 object-contain opacity-90" />
          <div className="flex flex-wrap justify-center gap-6 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Link to="/catalog" className="hover:text-accent">Catalogo</Link>
            <Link to="/favorites" className="hover:text-accent">Favoritos</Link>
            <Link to="/projects" className="hover:text-accent">Projetos</Link>
            <Link to="/privacidade" className="hover:text-accent">Privacidade</Link>
            <Link to="/termos" className="hover:text-accent">Termos</Link>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
            Plataforma exclusiva para arquitetos cadastrados
          </p>
        </div>
      </footer>
    </div>
  );
}
