import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AuthError, Session, User } from '@supabase/supabase-js';

type AuthResult = { error: AuthError | { message: string } | null };
type AccessStatus = { admin: boolean; manager: boolean; seller: boolean; architect: boolean; approved: boolean };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isSeller: boolean;
  isArchitect: boolean;
  isStaff: boolean;
  isApproved: boolean | null;
  signUp: (email: string, password: string, fullName: string, sellerId?: string, birthDate?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isNetworkError(err: unknown) {
  return err instanceof Error && (err.message === 'Failed to fetch' || err.message.includes('NetworkError'));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isNetworkError(err) && attempt < maxRetries) {
        console.warn(`Network error on attempt ${attempt + 1}, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [isArchitect, setIsArchitect] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const authRequestId = useRef(0);

  const checkRole = async (userId: string, role: 'admin' | 'gestor' | 'vendedor' | 'arquiteto'): Promise<boolean> => {
    try {
      const { data } = await supabase.rpc('has_role', { _user_id: userId, _role: role as any });
      return !!data;
    } catch {
      return false;
    }
  };

  const checkApproval = async (userId: string): Promise<boolean> => {
    try {
      const { data } = await supabase.rpc('is_approved', { _user_id: userId });
      return !!data;
    } catch {
      return false;
    }
  };

  const getAccessStatus = async (userId: string): Promise<AccessStatus> => {
    const [admin, manager, seller, architect, approved] = await Promise.all([
      checkRole(userId, 'admin'),
      checkRole(userId, 'gestor'),
      checkRole(userId, 'vendedor'),
      checkRole(userId, 'arquiteto'),
      checkApproval(userId),
    ]);

    return { admin, manager, seller, architect, approved };
  };

  const clearAuthState = (approved: boolean | null = null) => {
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setIsManager(false);
    setIsSeller(false);
    setIsArchitect(false);
    setIsApproved(approved);
  };

  const applySession = async (nextSession: Session | null) => {
    const requestId = ++authRequestId.current;
    setLoading(true);

    try {
      if (!nextSession?.user) {
        clearAuthState(null);
        setLoading(false);
        return;
      }

      const { admin, manager, seller, architect, approved } = await getAccessStatus(nextSession.user.id);

      if (requestId !== authRequestId.current) return;

      if (!admin && !approved) {
        clearAuthState(false);
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      setSession(nextSession);
      setUser(nextSession.user);
      setIsAdmin(admin);
      setIsManager(manager);
      setIsSeller(seller);
      setIsArchitect(architect || (!admin && !manager && !seller));
      setIsApproved(approved);
      setLoading(false);
    } catch (error) {
      console.error('Auth session apply failed:', error);
      if (requestId !== authRequestId.current) return;
      clearAuthState(null);
      setLoading(false);
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore signout errors so the local UI can recover.
      }
    }
  };

  useEffect(() => {
    let active = true;

    const loadInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (active) await applySession(session);
      } catch {
        if (active) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      setTimeout(() => {
        void applySession(nextSession);
      }, 0);
    });

    void loadInitialSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string, sellerId?: string, birthDate?: string) => {
    try {
      const metadata: Record<string, string> = { full_name: fullName };
      if (sellerId) metadata.seller_id = sellerId;
      if (birthDate) metadata.birth_date = birthDate;

      const result = await withRetry(() =>
        supabase.auth.signUp({
          email,
          password,
          options: { data: metadata },
        })
      );
      return { error: result.error };
    } catch (err) {
      console.error('Signup failed after retries:', err);
      return {
        error: {
          message: 'Nao foi possivel conectar ao servidor. Possiveis causas:\n- Conexao de internet instavel\n- VPN ou firewall bloqueando a conexao\n- Extensao de navegador interferindo\n\nTente desativar extensoes e VPN, ou use outro navegador/rede.',
        },
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const result = await withRetry(() =>
        supabase.auth.signInWithPassword({ email, password })
      );

      if (!result.error && result.data?.user) {
        const { admin, approved } = await getAccessStatus(result.data.user.id);

        if (!admin && !approved) {
          clearAuthState(false);
          await supabase.auth.signOut();
          return {
            error: {
              message: 'Seu cadastro esta aguardando aprovacao do administrador. Voce sera notificado quando for aprovado.',
            },
          };
        }
      }

      return { error: result.error };
    } catch (err) {
      console.error('Login failed after retries:', err);
      return {
        error: {
          message: 'Nao foi possivel conectar ao servidor. Possiveis causas:\n- Conexao de internet instavel\n- VPN ou firewall bloqueando a conexao\n- Extensao de navegador interferindo\n\nTente desativar extensoes e VPN, ou use outro navegador/rede.',
        },
      };
    }
  };

  const signOut = async () => {
    clearAuthState(null);
    setLoading(false);

    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signout errors so local UI still leaves the protected area.
    }
  };

  const isStaff = isAdmin || isManager || isSeller;

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, isManager, isSeller, isArchitect, isStaff, isApproved, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
