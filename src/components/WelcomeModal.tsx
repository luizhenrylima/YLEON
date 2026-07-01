import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, FolderPlus, Heart, Search, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import logoYleon from '@/assets/logo-yleon.png';

type OnboardingState = {
  started: boolean;
  favorited: boolean;
  projectCreated: boolean;
  itemAdded: boolean;
  lastFavoriteProductId: string | null;
};

const defaultState: OnboardingState = {
  started: false,
  favorited: false,
  projectCreated: false,
  itemAdded: false,
  lastFavoriteProductId: null,
};

function getStateKey(userId: string) {
  return `architect_onboarding_v2_${userId}`;
}

function getDoneKey(userId: string) {
  return `architect_onboarding_v2_done_${userId}`;
}

function readState(userId: string): OnboardingState {
  try {
    const raw = localStorage.getItem(getStateKey(userId));
    const lastFavoriteProductId = localStorage.getItem(`onboarding_last_favorite_${userId}`);
    if (!raw) return { ...defaultState, lastFavoriteProductId };
    return { ...defaultState, lastFavoriteProductId, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

function writeState(userId: string, state: OnboardingState) {
  try {
    localStorage.setItem(getStateKey(userId), JSON.stringify(state));
  } catch { /* noop */ }
}

export default function WelcomeModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [openIntro, setOpenIntro] = useState(false);
  const [visible, setVisible] = useState(false);
  const [fullName, setFullName] = useState('');
  const [state, setState] = useState<OnboardingState>(defaultState);

  useEffect(() => {
    if (!user) return;

    try {
      if (localStorage.getItem(getDoneKey(user.id))) return;
    } catch { /* private browsing */ }

    const stored = readState(user.id);
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Arquiteto';

    setFullName(name);
    setState(stored);
    setVisible(true);
    setOpenIntro(!stored.started);
  }, [user]);

  useEffect(() => {
    if (!user || !visible) return;
    writeState(user.id, state);
  }, [user, state, visible]);

  useEffect(() => {
    if (!user) return;

    const handleFavorited = (event: Event) => {
      const detail = (event as CustomEvent<{ productId?: string }>).detail;
      setState(prev => ({
        ...prev,
        favorited: true,
        lastFavoriteProductId: detail?.productId || prev.lastFavoriteProductId,
      }));
    };
    const handleProjectCreated = () => {
      setState(prev => ({ ...prev, projectCreated: true }));
    };
    const handleItemAdded = () => {
      setState(prev => ({ ...prev, itemAdded: true }));
    };

    window.addEventListener('architect-onboarding:favorited', handleFavorited);
    window.addEventListener('architect-onboarding:project-created', handleProjectCreated);
    window.addEventListener('architect-onboarding:item-added-to-project', handleItemAdded);

    return () => {
      window.removeEventListener('architect-onboarding:favorited', handleFavorited);
      window.removeEventListener('architect-onboarding:project-created', handleProjectCreated);
      window.removeEventListener('architect-onboarding:item-added-to-project', handleItemAdded);
    };
  }, [user]);

  const steps = useMemo(() => [
    {
      key: 'catalog',
      icon: Search,
      title: 'Explore o catalogo',
      done: location.pathname === '/catalog' || state.favorited || !!state.lastFavoriteProductId,
    },
    {
      key: 'favorite',
      icon: Heart,
      title: 'Favorite o primeiro produto',
      done: state.favorited,
    },
    {
      key: 'project',
      icon: FolderPlus,
      title: 'Crie um projeto',
      done: state.projectCreated,
    },
    {
      key: 'item',
      icon: Check,
      title: 'Adicione o item ao projeto',
      done: state.itemAdded,
    },
  ], [location.pathname, state.favorited, state.itemAdded, state.lastFavoriteProductId, state.projectCreated]);

  const activeStepIndex = Math.max(0, steps.findIndex(step => !step.done));
  const activeStep = steps[activeStepIndex] ?? steps[steps.length - 1];
  const isComplete = state.itemAdded;

  const startGuide = () => {
    if (!user) return;
    const next = { ...state, started: true };
    setState(next);
    writeState(user.id, next);
    setOpenIntro(false);
    setVisible(true);
    navigate('/catalog');
  };

  const finishGuide = () => {
    if (!user) return;
    try {
      localStorage.setItem(getDoneKey(user.id), 'true');
    } catch { /* noop */ }
    setOpenIntro(false);
    setVisible(false);
  };

  const skipGuide = () => {
    finishGuide();
  };

  const goToAction = () => {
    if (!state.favorited) {
      navigate('/catalog');
      return;
    }

    if (state.lastFavoriteProductId && !location.pathname.startsWith('/product/')) {
      navigate(`/product/${state.lastFavoriteProductId}`);
      return;
    }

    if (isComplete) {
      navigate('/projects');
    }
  };

  if (!user || !visible) return null;

  const ActionIcon = activeStep?.icon || Sparkles;

  return (
    <>
      <Dialog open={openIntro} onOpenChange={setOpenIntro}>
        <DialogContent className="sm:max-w-lg bg-background border-border p-0 overflow-hidden">
          <DialogTitle className="sr-only">Onboarding do arquiteto</DialogTitle>
          <DialogDescription className="sr-only">
            Guia inicial para favoritar um produto, criar um projeto e adicionar um item ao projeto.
          </DialogDescription>
          <div className="h-1 bg-gradient-to-r from-accent via-accent/60 to-accent" />

          <div className="px-8 py-10 text-center space-y-6">
            <div className="flex justify-center">
              <img src={logoYleon} alt="YLEON" className="h-24 object-contain drop-shadow-[0_10px_24px_rgba(28,35,20,0.16)]" />
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-serif text-foreground">
                Bem-vindo(a), <span className="text-accent">{fullName}</span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                Vamos fazer o primeiro fluxo completo: escolher um produto, favoritar, criar um projeto e salvar esse item nele.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.key} className="rounded-lg border border-border bg-secondary/45 p-3">
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[10px] text-accent font-semibold">
                        {index + 1}
                      </span>
                      <Icon size={14} className="text-accent" />
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{step.title}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={startGuide}
                className="flex-1 px-5 py-3 bg-primary text-primary-foreground rounded-lg text-xs uppercase tracking-[0.16em] font-medium hover:opacity-90 transition-opacity"
              >
                Comecar guia
              </button>
              <button
                onClick={skipGuide}
                className="px-4 py-3 border border-border rounded-lg text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
              >
                Pular
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!openIntro && (
        <aside
          className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
          aria-label="Guia inicial do arquiteto"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-semibold">Primeiros passos</p>
              <h3 className="mt-1 font-serif text-base text-foreground">
                {isComplete ? 'Fluxo concluido' : activeStep.title}
              </h3>
            </div>
            <button
              onClick={skipGuide}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Fechar guia"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid grid-cols-4 gap-2">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const active = index === activeStepIndex && !isComplete;
                return (
                  <div
                    key={step.key}
                    className={`h-1.5 rounded-full ${step.done ? 'bg-accent' : active ? 'bg-accent/45' : 'bg-border'}`}
                    title={step.title}
                  >
                    <span className="sr-only">
                      <Icon size={1} /> {step.title}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 rounded-lg bg-secondary/60 p-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ActionIcon size={18} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {isComplete
                  ? 'Perfeito. Seu primeiro produto ja esta salvo em um projeto.'
                  : !state.favorited
                    ? 'No catalogo, toque no coracao de um produto para salva-lo como favorito.'
                    : !location.pathname.startsWith('/product/')
                      ? 'Agora abra o produto favoritado para criar um projeto com ele.'
                      : 'Use o icone de pasta, digite o nome do novo projeto e clique em Criar e Adicionar.'}
              </p>
            </div>

            <div className="flex gap-2">
              {!isComplete ? (
                <button
                  onClick={goToAction}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs uppercase tracking-[0.12em] text-primary-foreground hover:opacity-90"
                >
                  {!state.favorited ? 'Ir ao catalogo' : location.pathname.startsWith('/product/') ? 'Estou no produto' : 'Abrir produto'}
                </button>
              ) : (
                <button
                  onClick={finishGuide}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs uppercase tracking-[0.12em] text-primary-foreground hover:opacity-90"
                >
                  Finalizar
                </button>
              )}
              {isComplete && (
                <button
                  onClick={() => navigate('/projects')}
                  className="rounded-lg border border-border px-4 py-2.5 text-xs uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                >
                  Ver projeto
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
