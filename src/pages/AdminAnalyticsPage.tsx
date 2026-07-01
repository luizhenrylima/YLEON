import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, TrendingUp, Users, Package, ArrowLeft, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ProductCount {
  product_id: string;
  product_name: string;
  brand_name: string;
  category: string;
  count: number;
  unique_projects: number;
}

interface ProductPair {
  product_a: string;
  product_b: string;
  name_a: string;
  name_b: string;
  brand_a: string;
  brand_b: string;
  count: number;
}

export default function AdminAnalyticsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [productCounts, setProductCounts] = useState<ProductCount[]>([]);
  const [productPairs, setProductPairs] = useState<ProductPair[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    loadAnalytics();
  }, [isAdmin]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch all project items with product and brand info
      const { data: items } = await supabase
        .from('project_items')
        .select('product_id, project_id');

      const { data: products } = await supabase
        .from('products')
        .select('id, name, category, brand_id');

      const { data: brands } = await supabase
        .from('brands')
        .select('id, name');

      const { data: projects } = await supabase
        .from('projects')
        .select('id');

      if (!items || !products || !brands) return;

      const brandMap = new Map(brands.map(b => [b.id, b.name]));
      const productMap = new Map(products.map(p => [p.id, p]));

      setTotalProjects(projects?.length ?? 0);
      setTotalItems(items.length);

      // Count product frequency
      const freqMap = new Map<string, { count: number; projects: Set<string> }>();
      for (const item of items) {
        const entry = freqMap.get(item.product_id) || { count: 0, projects: new Set<string>() };
        entry.count++;
        entry.projects.add(item.project_id);
        freqMap.set(item.product_id, entry);
      }

      const counts: ProductCount[] = [];
      freqMap.forEach((val, productId) => {
        const prod = productMap.get(productId);
        if (prod) {
          counts.push({
            product_id: productId,
            product_name: prod.name,
            brand_name: brandMap.get(prod.brand_id) || '—',
            category: prod.category,
            count: val.count,
            unique_projects: val.projects.size,
          });
        }
      });
      counts.sort((a, b) => b.count - a.count);
      setProductCounts(counts);

      // Product co-occurrence (pairs that appear in the same project)
      const projectItems = new Map<string, string[]>();
      for (const item of items) {
        const list = projectItems.get(item.project_id) || [];
        list.push(item.product_id);
        projectItems.set(item.project_id, list);
      }

      const pairCount = new Map<string, number>();
      projectItems.forEach((productIds) => {
        const unique = [...new Set(productIds)];
        for (let i = 0; i < unique.length; i++) {
          for (let j = i + 1; j < unique.length; j++) {
            const key = [unique[i], unique[j]].sort().join('|');
            pairCount.set(key, (pairCount.get(key) || 0) + 1);
          }
        }
      });

      const pairs: ProductPair[] = [];
      pairCount.forEach((count, key) => {
        if (count < 2) return;
        const [a, b] = key.split('|');
        const prodA = productMap.get(a);
        const prodB = productMap.get(b);
        if (prodA && prodB) {
          pairs.push({
            product_a: a,
            product_b: b,
            name_a: prodA.name,
            name_b: prodB.name,
            brand_a: brandMap.get(prodA.brand_id) || '—',
            brand_b: brandMap.get(prodB.brand_id) || '—',
            count,
          });
        }
      });
      pairs.sort((a, b) => b.count - a.count);
      setProductPairs(pairs);
    } finally {
      setLoading(false);
    }
  };

  const top15 = useMemo(() => productCounts.slice(0, 15), [productCounts]);
  const chartData = useMemo(() =>
    top15.map(p => ({
      name: p.product_name.length > 20 ? p.product_name.slice(0, 20) + '…' : p.product_name,
      fullName: p.product_name,
      brand: p.brand_name,
      especificações: p.count,
      projetos: p.unique_projects,
    })),
    [top15]
  );

  const CHART_COLORS = [
    'hsl(var(--accent))',
    'hsl(var(--primary))',
    'hsl(var(--muted-foreground))',
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => navigate('/admin')} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-light tracking-tight text-foreground">Performance & Curadoria</h1>
            <p className="text-sm text-muted-foreground mt-1">Insights sobre especificações e combinações de produtos nos projetos.</p>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Users size={18} className="text-accent" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{totalProjects}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Projetos Criados</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{totalItems}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Itens Especificados</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <TrendingUp size={18} className="text-accent" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{productCounts.length}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Produtos Únicos</p>
            </div>
          </div>
        </div>

        {/* Chart - Top Products */}
        {chartData.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-10">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 size={18} className="text-accent" />
              <h2 className="text-sm font-medium uppercase tracking-wider text-foreground">Top 15 — Produtos mais especificados</h2>
            </div>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [value, name === 'especificações' ? 'Especificações' : 'Projetos']}
                    labelFormatter={(label: string, payload: any[]) => {
                      const item = payload?.[0]?.payload;
                      return item ? `${item.fullName} — ${item.brand}` : label;
                    }}
                  />
                  <Bar dataKey="especificações" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? CHART_COLORS[0] : i < 3 ? CHART_COLORS[1] : CHART_COLORS[2]} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table - Full ranking */}
        <div className="bg-card border border-border rounded-xl p-6 mb-10">
          <div className="flex items-center gap-2 mb-6">
            <Package size={18} className="text-primary" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground">Ranking completo de especificações</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">#</th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Produto</th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Marca</th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Categoria</th>
                  <th className="text-center py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Especificações</th>
                  <th className="text-center py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Projetos</th>
                </tr>
              </thead>
              <tbody>
                {productCounts.slice(0, 50).map((p, i) => (
                  <tr key={p.product_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-3 px-2 text-foreground font-medium">{p.product_name}</td>
                    <td className="py-3 px-2 text-muted-foreground">{p.brand_name}</td>
                    <td className="py-3 px-2 text-muted-foreground">{p.category}</td>
                    <td className="py-3 px-2 text-center font-semibold text-foreground">{p.count}</td>
                    <td className="py-3 px-2 text-center text-muted-foreground">{p.unique_projects}</td>
                  </tr>
                ))}
                {productCounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">Nenhum produto especificado ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Product Combinations */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={18} className="text-accent" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-foreground">Combinações frequentes</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-6">Pares de produtos que aparecem juntos em 2 ou mais projetos.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Produto A</th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Marca</th>
                  <th className="text-center py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">+</th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Produto B</th>
                  <th className="text-left py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Marca</th>
                  <th className="text-center py-3 px-2 text-muted-foreground font-medium text-xs uppercase tracking-wider">Projetos</th>
                </tr>
              </thead>
              <tbody>
                {productPairs.slice(0, 30).map((pair, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2 text-foreground font-medium">{pair.name_a}</td>
                    <td className="py-3 px-2 text-muted-foreground">{pair.brand_a}</td>
                    <td className="py-3 px-2 text-center text-muted-foreground">↔</td>
                    <td className="py-3 px-2 text-foreground font-medium">{pair.name_b}</td>
                    <td className="py-3 px-2 text-muted-foreground">{pair.brand_b}</td>
                    <td className="py-3 px-2 text-center font-semibold text-accent">{pair.count}</td>
                  </tr>
                ))}
                {productPairs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma combinação recorrente encontrada ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
