import { useCompare } from '@/contexts/CompareContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Check, FolderPlus, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { buildNewProjectPayload } from '@/lib/projectDefaults';
import type { Tables } from '@/integrations/supabase/types';

type Project = Tables<'projects'>;
const PROJECT_PICKER_FIELDS = 'id, name, user_id, seller_user_id, client_name, created_at';

export default function ComparePage() {
  const { items, removeItem } = useCompare();
  const navigate = useNavigate();
  const { user, isStaff } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');

  useEffect(() => {
    if (!user) return;
    const query = isStaff
      ? supabase.from('projects').select(PROJECT_PICKER_FIELDS)
      : supabase.from('projects').select(PROJECT_PICKER_FIELDS).eq('user_id', user.id);
    query.then(r => setProjects(r.data ?? []));
  }, [user, isStaff]);

  const addChosenToProject = useCallback(async (projId: string) => {
    if (!chosenId) return;
    await supabase.from('project_items').insert({ project_id: projId, product_id: chosenId });
    toast({ title: 'Produto adicionado!', description: 'O produto escolhido foi adicionado ao projeto.' });
    setShowProjectPicker(false);
  }, [chosenId]);

  const createAndAdd = useCallback(async () => {
    if (!user || !newProjectName.trim() || !newClientName.trim() || !chosenId) {
      toast({ title: 'Informe projeto e cliente', description: 'O nome do cliente final e obrigatorio.', variant: 'destructive' });
      return;
    }
    const projectName = newProjectName.trim();
    const { data, error } = await (supabase as any)
      .from('projects')
      .insert(buildNewProjectPayload(user.id, projectName, { clientName: newClientName.trim() }))
      .select(PROJECT_PICKER_FIELDS)
      .single();
    if (error) {
      toast({ title: 'Erro ao criar projeto', description: 'Confira os dados e suas permissoes.', variant: 'destructive' });
      return;
    }
    if (data) {
      await addChosenToProject(data.id);
      setProjects(prev => [...prev, data]);
    }
    setNewProjectName('');
    setNewClientName('');
  }, [user, newProjectName, newClientName, chosenId, addChosenToProject]);

  if (items.length < 2) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm">Selecione pelo menos 2 produtos para comparar.</p>
        <button
          onClick={() => navigate('/catalog')}
          className="text-accent text-xs uppercase tracking-wider hover:underline"
        >
          Ir para o Catálogo
        </button>
      </div>
    );
  }

  // Build spec rows
  const specRows: { label: string; values: (string | null)[] }[] = [
    { label: 'Categoria', values: items.map(i => i.product.category) },
    { label: 'Marca', values: items.map(i => i.brandName) },
    { label: 'Descrição', values: items.map(i => i.product.description || '—') },
    { label: 'Bloco 3D', values: items.map(i => i.product.file_3d ? 'Disponível' : '—') },
    { label: 'Bloco 2D', values: items.map(i => i.product.file_2d ? 'Disponível' : '—') },
    { label: 'Ficha Técnica', values: items.map(i => i.product.tech_sheet ? 'Disponível' : '—') },
    { label: 'Link Acabamentos', values: items.map(i => i.product.finish_link ? 'Disponível' : '—') },
  ];

  const colCount = items.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-xs uppercase tracking-wider"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <h1 className="text-lg font-serif text-foreground">Comparador de Produtos</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Product headers */}
        <div className={`grid gap-6 mb-8`} style={{ gridTemplateColumns: `200px repeat(${colCount}, 1fr)` }}>
          <div /> {/* label column spacer */}
          {items.map((item) => (
            <div key={item.product.id} className="text-center relative">
              <button
                onClick={() => removeItem(item.product.id)}
                className="absolute top-0 right-0 p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remover"
              >
                <X size={14} />
              </button>
              <div className="aspect-square max-w-[200px] mx-auto bg-secondary rounded-xl flex items-center justify-center mb-4 border border-border overflow-hidden">
                <img
                  src={item.product.images?.[0] || '/placeholder.svg'}
                  alt={item.product.name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-accent mb-1">{item.brandName}</p>
              <h2 className="text-base font-serif text-foreground mb-2">{item.product.name}</h2>
              <button
                onClick={() => {
                  setChosenId(item.product.id);
                  setShowProjectPicker(true);
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] uppercase tracking-[0.15em] font-semibold transition-all ${
                  chosenId === item.product.id
                    ? 'bg-accent text-accent-foreground'
                    : 'border border-border text-muted-foreground hover:border-accent hover:text-accent'
                }`}
              >
                {chosenId === item.product.id ? <Check size={12} /> : <FolderPlus size={12} />}
                {chosenId === item.product.id ? 'Escolhido' : 'Escolher'}
              </button>
            </div>
          ))}
        </div>

        {/* Spec table */}
        <div className="border border-border rounded-xl overflow-hidden">
          {specRows.map((row, rowIdx) => {
            const allSame = row.values.every(v => v === row.values[0]);
            return (
              <div
                key={row.label}
                className={`grid items-start ${rowIdx % 2 === 0 ? 'bg-card' : 'bg-secondary/30'}`}
                style={{ gridTemplateColumns: `200px repeat(${colCount}, 1fr)` }}
              >
                <div className="px-5 py-4 border-r border-border">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
                    {row.label}
                  </span>
                </div>
                {row.values.map((val, i) => (
                  <div
                    key={i}
                    className={`px-5 py-4 text-sm text-foreground font-light ${
                      i < colCount - 1 ? 'border-r border-border' : ''
                    } ${!allSame ? 'bg-accent/5' : ''}`}
                  >
                    {!allSame && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-2 -translate-y-px" />
                    )}
                    {val || '—'}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Project picker modal */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowProjectPicker(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-serif text-foreground mb-4">Adicionar ao Projeto</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => addChosenToProject(p.id)}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-secondary text-sm text-foreground transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="border-t border-border pt-4">
              <input
                placeholder="Novo projeto..."
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createAndAdd()}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground mb-2"
              />
              <input
                placeholder="Cliente final..."
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createAndAdd()}
                className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground mb-2"
              />
              <button
                onClick={createAndAdd}
                disabled={!newProjectName.trim() || !newClientName.trim()}
                className="w-full py-2 bg-primary text-primary-foreground rounded-md text-xs uppercase tracking-wider disabled:opacity-40"
              >
                Criar e Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
