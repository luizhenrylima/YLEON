import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import logoYleon from '@/assets/logo-yleon.png';
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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
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
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(circle at 50% 0%, rgba(224,99,44,0.16), transparent 34%), linear-gradient(135deg, #241a12 0%, #3c3c3c 52%, #11100e 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <img
            src={logoYleon}
            alt="YLEON"
            className="mx-auto h-56 object-contain drop-shadow-[0_0_32px_rgba(224,99,44,0.18)]"
          />
          <p className="mt-4 text-sm uppercase tracking-widest text-[#fff7ea]/70">
            Acesso exclusivo para arquitetos, vendedores e equipe cadastrada.
          </p>
          {connStatus === 'error' && (
            <p className="mt-2 text-center text-xs text-red-300">
              Nao foi possivel conectar ao servidor. Verifique sua internet, desative VPN/extensoes e tente novamente.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/12 bg-[rgba(36,26,18,0.88)] p-8 shadow-[0_26px_80px_-42px_rgba(0,0,0,0.85)] backdrop-blur">
          <div className="mb-8 border-b border-white/12 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ff8a4c]">Entrar</p>
            <h1 className="mt-2 font-serif text-2xl text-[#fff7ea]">Bem-vindo a YLEON</h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-[10px] uppercase tracking-[0.15em] text-[#fff7ea]/55">
                E-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-white/12 bg-[#171310] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#ff8a4c]"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] uppercase tracking-[0.15em] text-[#fff7ea]/55">
                Senha
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-white/12 bg-[#171310] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#ff8a4c]"
                placeholder="********"
                minLength={6}
              />
            </div>

            {error && <p className="whitespace-pre-line text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#e0632c] py-3.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#241a12] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Aguarde...' : 'Entrar'}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] leading-5 text-[#fff7ea]/45">
            Novos acessos sao criados manualmente pelo Admin.
          </p>
        </div>
      </div>
    </div>
  );
}
