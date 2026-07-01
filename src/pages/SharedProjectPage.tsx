import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ProjectItem {
  id: string;
  product_id: string;
  notes: string | null;
  selected_finish_id: string | null;
  product?: { id: string; name: string; images: string[] | null; category: string; brand_id: string };
  finish?: { id: string; name: string; image_url: string } | null;
  brand?: { name: string } | null;
}

export default function SharedProjectPage() {
  const { token } = useParams<{ token: string }>();
  // Create a scoped Supabase client that passes the share token as a custom header
  const anonClient = useMemo(() => {
    if (!token) return null;
    return createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { 'x-share-token': token } },
    });
  }, [token]);

  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token || !anonClient) return;
    const fetchData = async () => {
      const { data: project } = await anonClient
        .from('projects')
        .select('id, name')
        .eq('share_token', token)
        .single();

      if (!project) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProjectName(project.name);

      const { data: projectItems } = await anonClient
        .from('project_items')
        .select('id, product_id, notes, selected_finish_id')
        .eq('project_id', project.id);

      if (!projectItems || projectItems.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const productIds = projectItems.map(i => i.product_id);
      const finishIds = projectItems.filter(i => i.selected_finish_id).map(i => i.selected_finish_id!);

      const [productsRes, finishesRes] = await Promise.all([
        anonClient.from('products').select('id, name, images, category, brand_id').in('id', productIds),
        finishIds.length > 0 ? anonClient.from('finishes').select('id, name, image_url').in('id', finishIds) : Promise.resolve({ data: [] }),
      ]);

      const products = (productsRes.data ?? []) as any[];
      const finishes = (finishesRes.data ?? []) as any[];

      const brandIds = [...new Set(products.map((p: any) => p.brand_id))];
      const { data: brands } = await anonClient.from('brands').select('id, name').in('id', brandIds);

      const prodMap = new Map(products.map(p => [p.id, p]));
      const finishMap = new Map(finishes.map(f => [f.id, f]));
      const brandMap = new Map((brands ?? []).map(b => [b.id, b]));

      const enriched: ProjectItem[] = projectItems.map(item => {
        const product = prodMap.get(item.product_id) as any;
        return {
          ...item,
          product,
          finish: item.selected_finish_id ? finishMap.get(item.selected_finish_id) : null,
          brand: product ? brandMap.get(product.brand_id) : null,
        };
      });

      setItems(enriched);
      setLoading(false);
    };
    fetchData();
  }, [token, anonClient]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="font-serif text-xl text-foreground mb-2">Projeto não encontrado</p>
          <p className="text-sm text-muted-foreground">Este link de compartilhamento é inválido ou expirou.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-12">
        <div className="flex items-center gap-3 mb-2">
          <FolderOpen size={20} className="text-accent" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-medium">Projeto Compartilhado</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-foreground mb-10">{projectName}</h1>

        {items.length === 0 ? (
          <p className="text-muted-foreground italic text-sm">Nenhum produto neste projeto.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {items.map(item => (
              <div key={item.id} className="bg-card rounded-xl border border-border overflow-hidden card-hover">
                <div className="aspect-[4/5] bg-muted/30 flex items-center justify-center p-4">
                  <img
                    src={item.product?.images?.[0] || '/placeholder.svg'}
                    alt={item.product?.name || 'Produto'}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-accent">{item.brand?.name}</p>
                  <h3 className="text-sm font-medium text-foreground">{item.product?.name}</h3>
                  <p className="text-[10px] text-muted-foreground capitalize">{item.product?.category}</p>

                  {item.finish && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border mt-2">
                      <div className="w-8 h-8 rounded border border-border overflow-hidden shrink-0">
                        <img src={item.finish.image_url} alt={item.finish.name} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Acabamento</p>
                        <p className="text-[11px] text-foreground">{item.finish.name}</p>
                      </div>
                    </div>
                  )}

                  {item.notes && (
                    <p className="text-xs text-muted-foreground italic pt-1 border-t border-border/50">
                      📝 {item.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
