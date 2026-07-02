import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import logoYleon from '@/assets/logo-yleon.png';
import loginPattern from '@/assets/login-yleon-pattern.png';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { checkClientRateLimit, rateLimitMessage } from '@/lib/rateLimit';
import { authLoginSchema, firstZodMessage } from '@/lib/validation';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [connStatus, setConnStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    })
      .then((res) => setConnStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setConnStatus('error'));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const parsed = authLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(firstZodMessage(parsed.error));
      setLoading(false);
      return;
    }

    const rate = checkClientRateLimit('auth:login', parsed.data.email);
    if (!rate.allowed) {
      setError(rateLimitMessage(rate));
      setLoading(false);
      return;
    }

    const { error } = await signIn(parsed.data.email, parsed.data.password);
    if (error) setError(error.message);
    else navigate('/');
    setLoading(false);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fbfaf7] px-4 py-8 text-[#253021] sm:px-6 lg:px-10">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-repeat opacity-[0.28]"
        style={{
          backgroundImage: `url(${loginPattern})`,
          backgroundSize: '640px auto',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(251,250,247,0.58) 0%, rgba(251,250,247,0.86) 50%, rgba(251,250,247,0.98) 100%), radial-gradient(circle at 18% 18%, rgba(198,157,82,0.22), transparent 28%), radial-gradient(circle at 85% 88%, rgba(44,55,38,0.14), transparent 34%)',
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center lg:justify-end">
        <section className="grid w-full gap-8 lg:grid-cols-[1fr_430px] lg:items-center">
          <div className="hidden max-w-xl lg:block">
            <div className="inline-flex border border-[#c9a24d]/45 bg-[#fffdf8]/82 px-8 py-7 shadow-[0_30px_90px_-52px_rgba(37,48,33,0.58)] backdrop-blur-sm">
              <img
                src={logoYleon}
                alt="YLEON"
                className="h-60 w-auto object-contain drop-shadow-[0_18px_28px_rgba(37,48,33,0.12)]"
              />
            </div>
            <div className="mt-8 h-px w-72 bg-[#c9a24d]" />
            <p className="mt-6 max-w-md font-serif text-4xl leading-tight text-[#253021]">
              Acesso reservado YLEON
            </p>
          </div>

          <div className="w-full border border-[#c9a24d]/35 bg-[#fffdf8]/92 p-6 shadow-[0_34px_95px_-48px_rgba(37,48,33,0.52)] backdrop-blur-md sm:p-8">
            <div className="mb-8 text-center lg:hidden">
              <img
                src={logoYleon}
                alt="YLEON"
                className="mx-auto h-44 object-contain drop-shadow-[0_18px_28px_rgba(37,48,33,0.12)]"
              />
            </div>

            <div className="mb-8 border-b border-[#c9a24d]/32 pb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#b68d3f]">Entrar</p>
              <h1 className="mt-2 font-serif text-3xl text-[#253021]">Bem-vindo a YLEON</h1>
              <p className="mt-3 text-sm leading-6 text-[#68705f]">
                Acesso exclusivo para arquitetos, vendedores e equipe cadastrada.
              </p>
              {connStatus === 'error' && (
                <p className="mt-3 text-sm leading-5 text-[#9f2f24]">
                  Nao foi possivel conectar ao servidor. Verifique sua internet, desative VPN/extensoes e tente novamente.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#68705f]">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full border border-[#d8c8a8] bg-white/82 px-4 text-sm text-[#253021] shadow-inner shadow-[#c9a24d]/5 placeholder:text-[#9b998e] focus:border-[#b68d3f] focus:outline-none focus:ring-2 focus:ring-[#c9a24d]/18"
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#68705f]">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full border border-[#d8c8a8] bg-white/82 px-4 text-sm text-[#253021] shadow-inner shadow-[#c9a24d]/5 placeholder:text-[#9b998e] focus:border-[#b68d3f] focus:outline-none focus:ring-2 focus:ring-[#c9a24d]/18"
                  placeholder="********"
                  minLength={6}
                />
              </div>

              {error && <p className="whitespace-pre-line text-sm text-[#9f2f24]">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="h-12 w-full bg-[#253021] text-xs font-semibold uppercase tracking-[0.22em] text-[#fffdf8] shadow-[0_18px_34px_-25px_rgba(37,48,33,0.85)] transition-colors hover:bg-[#31402c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Aguarde...' : 'Entrar'}
              </button>
            </form>

            <p className="mt-5 text-center text-[11px] leading-5 text-[#7f7868]">
              Novos acessos sao criados manualmente pelo Admin.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
