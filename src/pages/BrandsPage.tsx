import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import {
  getLocalHiddenBrandIds,
  isCatalogRecordVisible,
  isHiddenColumnMissing,
  mergeLocalHiddenState,
} from '@/lib/catalogVisibility';

type Brand = Tables<'brands'> & { is_hidden?: boolean | null };
const BRANDS_PAGE_FIELDS = 'id, name, logo_url, segment, is_hidden';

const segmentLabels: Record<string, string> = {
  high: 'High-End',
  premium: 'Premium',
  essential: 'Essential',
};

export default function BrandsPage() {
  const { segment } = useParams<{ segment: string }>();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      let result = await supabase.from('brands').select(BRANDS_PAGE_FIELDS).eq('segment', segment!).eq('is_hidden', false);
      if (result.error && isHiddenColumnMissing(result.error)) {
        result = await supabase.from('brands').select('id, name, logo_url, segment').eq('segment', segment!);
      }
      setBrands(mergeLocalHiddenState((result.data as Brand[]) || [], getLocalHiddenBrandIds())
        .filter(brand => isCatalogRecordVisible(brand, getLocalHiddenBrandIds())));
      setLoading(false);
    };
    fetch();
  }, [segment]);

  return (
    <div className="min-h-screen bg-card py-20 px-8">
      <div className="max-w-6xl mx-auto">
        <Link to="/segments" className="inline-flex items-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-8 hover:text-foreground transition-colors">
          <ChevronLeft size={16} /> Voltar
        </Link>
        <h2 className="text-4xl font-serif mb-12 text-foreground">
          {segmentLabels[segment || ''] || 'Marcas'}
        </h2>

        {loading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
          </div>
        ) : brands.length === 0 ? (
          <div className="h-[40vh] flex items-center justify-center text-muted-foreground font-light italic">
            Nenhuma marca cadastrada neste segmento.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-12">
            {brands.map((brand) => (
              <Link
                key={brand.id}
                to={`/brand/${brand.id}`}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-full aspect-square bg-secondary flex items-center justify-center p-8 grayscale group-hover:grayscale-0 transition-all duration-500 border border-transparent group-hover:border-border rounded-lg">
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={brand.name} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-sm font-serif text-muted-foreground">{brand.name}</span>
                  )}
                </div>
                <span className="mt-4 text-[10px] uppercase tracking-[0.15em] font-medium opacity-0 group-hover:opacity-100 transition-opacity text-foreground">
                  {brand.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
