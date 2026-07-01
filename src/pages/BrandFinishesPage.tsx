import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Brand = Pick<Tables<'brands'>, 'id' | 'name' | 'logo_url'>;
const BRAND_FINISHES_BRAND_FIELDS = 'id, name, logo_url';
const BRAND_FINISH_CATEGORY_FIELDS = 'id, brand_id, name, display_order, finish_group';
const BRAND_FINISH_FIELDS = 'id, finish_category_id, name, image_url, display_order';

interface FinishCategory {
  id: string;
  brand_id: string;
  name: string;
  display_order: number;
  finish_group: string;
}

interface Finish {
  id: string;
  finish_category_id: string;
  name: string;
  image_url: string;
  display_order: number;
}

export default function BrandFinishesPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [finishCategories, setFinishCategories] = useState<FinishCategory[]>([]);
  const [finishes, setFinishes] = useState<Finish[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      const [brandRes, catsRes, finishesRes] = await Promise.all([
        supabase.from('brands').select(BRAND_FINISHES_BRAND_FIELDS).eq('id', brandId!).single(),
        supabase.from('finish_categories').select(BRAND_FINISH_CATEGORY_FIELDS).eq('brand_id', brandId!).order('display_order'),
        supabase.from('finishes').select(BRAND_FINISH_FIELDS).order('display_order'),
      ]);
      if (cancelled) return;
      setBrand(brandRes.data);
      setFinishCategories((catsRes.data as FinishCategory[]) || []);
      // Filter finishes to only those belonging to this brand's categories
      const catIds = new Set((catsRes.data || []).map((c: any) => c.id));
      setFinishes((finishesRes.data as Finish[] || []).filter(f => catIds.has(f.finish_category_id)));
      setLoading(false);
    };
    fetchData();
    return () => { cancelled = true; };
  }, [brandId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to={`/brand/${brandId}`}
              className="inline-flex items-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} /> Voltar
            </Link>
            <div className="h-6 w-px bg-border" />
            {brand?.logo_url ? (
              <img src={brand.logo_url} alt={brand.name} className="h-8 object-contain opacity-80" />
            ) : (
              <span className="text-lg font-serif text-foreground">{brand?.name}</span>
            )}
          </div>
          <h1 className="text-xl font-serif text-foreground">Acabamentos</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-12">
        {finishCategories.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground italic">Nenhum acabamento cadastrado para esta marca.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {(['Tecidos', 'Superfícies e Pinturas'] as const).map(groupName => {
              const groupCats = finishCategories.filter(c => c.finish_group === groupName);
              if (groupCats.length === 0) return null;
              const groupFinishes = finishes.filter(f => groupCats.some(c => c.id === f.finish_category_id));
              if (groupFinishes.length === 0) return null;
              return (
                <div key={groupName}>
                  <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground mb-6 pb-3 border-b border-border">
                    {groupName}
                  </h2>
                  {groupCats.map(cat => {
                    const catFinishes = finishes.filter(f => f.finish_category_id === cat.id);
                    if (catFinishes.length === 0) return null;
                    return (
                      <section key={cat.id} className="mb-8">
                        <h3 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-4 font-medium">
                          {cat.name} <span className="text-muted-foreground/50">({catFinishes.length})</span>
                        </h3>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
                          {catFinishes.map(finish => (
                            <button
                              key={finish.id}
                              onClick={() => setLightboxImage({ url: finish.image_url, name: finish.name })}
                              className="group text-center cursor-pointer"
                              aria-label={`Ver acabamento ${finish.name}`}
                            >
                              <div className="aspect-square rounded-lg overflow-hidden border border-border bg-secondary mb-2 group-hover:border-primary transition-colors">
                                <img
                                  src={finish.image_url}
                                  alt={finish.name}
                                  loading="lazy"
                                  width={100}
                                  height={100}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                                {finish.name}
                              </p>
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-label={`Acabamento ${lightboxImage.name}`}
        >
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X size={24} />
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="w-full rounded-lg"
            />
            <p className="text-center text-white mt-4 text-sm">{lightboxImage.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
