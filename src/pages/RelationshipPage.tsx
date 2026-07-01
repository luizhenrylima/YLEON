import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  CalendarDays,
  Gift,
  GraduationCap,
  Megaphone,
  Palette,
  Plus,
  Sparkles,
  Tags,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { sanitizePlainText } from '@/lib/validation';

type RelationshipPostType =
  | 'lancamento'
  | 'treinamento'
  | 'campanha'
  | 'beneficio'
  | 'condicao_especial'
  | 'evento'
  | 'tendencia_acabamentos';

type RelationshipPost = {
  id: string;
  post_type: RelationshipPostType;
  title: string;
  summary: string | null;
  body: string | null;
  event_date: string | null;
  cta_label: string | null;
  cta_url: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  created_at: string;
};

const postTypes: Array<{ value: RelationshipPostType; label: string; icon: typeof Megaphone }> = [
  { value: 'evento', label: 'Evento', icon: CalendarDays },
  { value: 'lancamento', label: 'Lançamento', icon: Sparkles },
  { value: 'treinamento', label: 'Treinamento', icon: GraduationCap },
  { value: 'campanha', label: 'Campanha', icon: Megaphone },
  { value: 'beneficio', label: 'Benefício', icon: Gift },
  { value: 'condicao_especial', label: 'Condição especial', icon: Tags },
  { value: 'tendencia_acabamentos', label: 'Tendências de acabamentos', icon: Palette },
];

const emptyPostDraft = {
  post_type: 'evento' as RelationshipPostType,
  title: '',
  summary: '',
  body: '',
  event_date: '',
  cta_label: '',
  cta_url: '',
  cover_image_url: '',
  is_published: true,
};

function formatDate(value: string | null) {
  if (!value) return 'Sem data definida';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function postTypeInfo(type: RelationshipPostType) {
  return postTypes.find(item => item.value === type) || postTypes[0];
}

export default function RelationshipPage() {
  const { user, isAdmin, isManager } = useAuth();
  const canPublish = isAdmin || isManager;
  const [posts, setPosts] = useState<RelationshipPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPost, setSavingPost] = useState(false);
  const [draft, setDraft] = useState(emptyPostDraft);

  const eventPosts = useMemo(
    () => posts.filter(post => ['evento', 'treinamento', 'lancamento'].includes(post.post_type)).slice(0, 4),
    [posts],
  );

  const loadRelationshipArea = async () => {
    if (!user) return;
    setLoading(true);

    const postsRes = await (supabase as any)
      .from('relationship_posts')
      .select('id, post_type, title, summary, body, event_date, cta_label, cta_url, cover_image_url, is_published, created_at')
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (postsRes.error) {
      console.warn('Relationship posts load failed:', postsRes.error);
      setPosts([]);
    } else {
      setPosts((postsRes.data as RelationshipPost[]) || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadRelationshipArea();
  }, [user?.id]);

  const publishPost = async () => {
    if (!user || !canPublish) return;
    const title = sanitizePlainText(draft.title, 140);
    if (title.length < 2) {
      toast({ title: 'Informe o título da publicação', variant: 'destructive' });
      return;
    }

    setSavingPost(true);
    const payload = {
      post_type: draft.post_type,
      title,
      summary: sanitizePlainText(draft.summary, 260) || null,
      body: sanitizePlainText(draft.body, 2500) || null,
      event_date: draft.event_date ? new Date(draft.event_date).toISOString() : null,
      cta_label: sanitizePlainText(draft.cta_label, 80) || null,
      cta_url: sanitizePlainText(draft.cta_url, 500) || null,
      cover_image_url: sanitizePlainText(draft.cover_image_url, 500) || null,
      is_published: draft.is_published,
      created_by: user.id,
    };

    const { data, error } = await (supabase as any)
      .from('relationship_posts')
      .insert(payload)
      .select('id, post_type, title, summary, body, event_date, cta_label, cta_url, cover_image_url, is_published, created_at')
      .single();

    setSavingPost(false);

    if (error) {
      toast({ title: 'Erro ao publicar', description: 'Aplique a migration da área de relacionamento e tente novamente.', variant: 'destructive' });
      return;
    }

    setPosts(current => [data as RelationshipPost, ...current]);
    setDraft(emptyPostDraft);
    toast({ title: 'Publicação enviada', description: 'Arquitetos já podem visualizar o conteúdo.' });
  };

  return (
    <main className="min-h-screen bg-[#F7F6F3] text-[#1F1F1F]">
      <Helmet>
        <title>Relacionamento com Arquitetos | YLEON</title>
        <meta name="description" content="Área de relacionamento da loja com arquitetos: eventos, lançamentos, treinamentos, campanhas e tendências." />
      </Helmet>

      <section className="border-b border-[#E5E2DC] bg-white/75">
        <div className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <Badge variant="outline" className="border-[#C8A46D]/40 bg-[#C8A46D]/10 text-[#8C6838]">
                Área de relacionamento
              </Badge>
              <h1 className="mt-5 max-w-3xl font-serif text-4xl leading-tight md:text-6xl">
                Loja e arquitetos, no mesmo ritmo.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[#77736B] md:text-base">
                Acompanhe lançamentos, treinamentos, campanhas, benefícios, condições especiais e tendências de acabamentos publicadas pela loja.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <RelationshipStat label="Próximos eventos" value={eventPosts.length} />
              <RelationshipStat label="Publicações ativas" value={posts.length} />
              <RelationshipStat label="Editorias" value={postTypes.length} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <Card className="rounded-[24px] border-[#E5E2DC] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Relacionamento da loja</CardTitle>
              <p className="text-sm text-[#77736B]">Eventos, lançamentos, treinamentos, campanhas, benefícios e tendências em um só lugar.</p>
            </CardHeader>
            <CardContent className="grid gap-4">
              {loading ? (
                <p className="rounded-2xl border border-dashed border-[#E5E2DC] p-6 text-sm text-[#77736B]">
                  Carregando publicações...
                </p>
              ) : posts.length ? posts.map(post => <RelationshipPostCard key={post.id} post={post} />) : (
                <p className="rounded-2xl border border-dashed border-[#E5E2DC] p-6 text-sm text-[#77736B]">
                  Ainda não há publicações ativas para arquitetos.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="grid gap-6 self-start lg:sticky lg:top-24">
          <Card className="rounded-[24px] border-[#E5E2DC] bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays size={17} className="text-[#C8A46D]" />
                Agenda em destaque
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {eventPosts.length ? eventPosts.map(post => {
                const info = postTypeInfo(post.post_type);
                const Icon = info.icon;
                return (
                  <div key={post.id} className="rounded-2xl border border-[#E5E2DC] bg-[#F7F6F3] p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs text-[#8C6838]">
                      <Icon size={14} />
                      {info.label}
                    </div>
                    <p className="text-sm font-medium">{post.title}</p>
                    <p className="mt-2 text-xs text-[#77736B]">{formatDate(post.event_date)}</p>
                  </div>
                );
              }) : (
                <p className="text-sm text-[#77736B]">Sem eventos publicados no momento.</p>
              )}
            </CardContent>
          </Card>

          {canPublish && (
            <Card className="rounded-[24px] border-[#E5E2DC] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus size={17} className="text-[#C8A46D]" />
                  Publicar para arquitetos
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <select
                  value={draft.post_type}
                  onChange={event => setDraft(current => ({ ...current, post_type: event.target.value as RelationshipPostType }))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {postTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <Input placeholder="Título" value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
                <Input placeholder="Resumo curto" value={draft.summary} onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))} />
                <Textarea placeholder="Descrição / detalhes" value={draft.body} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} rows={5} />
                <Input type="datetime-local" value={draft.event_date} onChange={event => setDraft(current => ({ ...current, event_date: event.target.value }))} />
                <Input placeholder="Texto do botão (opcional)" value={draft.cta_label} onChange={event => setDraft(current => ({ ...current, cta_label: event.target.value }))} />
                <Input placeholder="Link do botão (opcional)" value={draft.cta_url} onChange={event => setDraft(current => ({ ...current, cta_url: event.target.value }))} />
                <Button onClick={() => void publishPost()} disabled={savingPost}>
                  {savingPost ? 'Publicando...' : 'Publicar'}
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>
      </section>
    </main>
  );
}

function RelationshipStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E5E2DC] bg-white p-4 shadow-sm">
      <p className="text-2xl font-semibold text-[#1F1F1F]">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#77736B]">{label}</p>
    </div>
  );
}

function RelationshipPostCard({ post }: { post: RelationshipPost }) {
  const info = postTypeInfo(post.post_type);
  const Icon = info.icon;

  return (
    <article className="grid gap-4 rounded-2xl border border-[#E5E2DC] bg-[#F7F6F3] p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-[#C8A46D] shadow-sm">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-[#C8A46D]/40 text-[#8C6838]">{info.label}</Badge>
          {post.event_date && <span className="text-xs text-[#77736B]">{formatDate(post.event_date)}</span>}
        </div>
        <h2 className="mt-3 font-serif text-xl text-[#1F1F1F]">{post.title}</h2>
        {post.summary && <p className="mt-2 text-sm text-[#77736B]">{post.summary}</p>}
        {post.body && <p className="mt-3 text-sm leading-relaxed text-[#5F5A52]">{post.body}</p>}
      </div>
      {post.cta_url && (
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <a href={post.cta_url} target="_blank" rel="noopener noreferrer">
            {post.cta_label || 'Ver detalhes'}
          </a>
        </Button>
      )}
    </article>
  );
}
