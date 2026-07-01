import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CompareProvider } from "@/contexts/CompareContext";
import Navbar from "@/components/Navbar";
import CompareBar from "@/components/CompareBar";
import CookieConsent from "@/components/CookieConsent";
import WelcomeModal from "@/components/WelcomeModal";
import AuthPage from "@/pages/AuthPage";
import LandingPage from "@/pages/LandingPage";
import CatalogPage from "@/pages/CatalogPage";
import CuradoriaPage from "@/pages/CuradoriaPage";
import BrandCatalogPage from "@/pages/BrandCatalogPage";
import BrandFinishesPage from "@/pages/BrandFinishesPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import FavoritesPage from "@/pages/FavoritesPage";
import ProjectsPage from "@/pages/ProjectsPage";
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/NotFound";
import SharedProjectPage from "@/pages/SharedProjectPage";
import ComparePage from "@/pages/ComparePage";
import AdminAnalyticsPage from "@/pages/AdminAnalyticsPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import TermsOfUsePage from "@/pages/TermsOfUsePage";
import BioInstaPage from "@/pages/BioInstaPage";
import MarketingPage from "@/pages/MarketingPage";
import PriceConsultantPage from "@/pages/PriceConsultantPage";
import OperationsPage from "@/pages/OperationsPage";
import RelationshipPage from "@/pages/RelationshipPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Application render error:", error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recuperacao da plataforma</p>
          <h1 className="mt-3 font-serif text-2xl">A pagina encontrou um erro.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A aplicacao foi protegida para nao ficar em tela branca. Recarregue a pagina; se continuar, volte para o login e entre novamente.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/auth"; }}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Voltar para login
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-5 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
        </div>
      </main>
    );
  }
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, area }: { children: ReactNode; area: "admin" | "management" | "seller" | "staff" }) {
  const { user, loading, isAdmin, isManager, isSeller, isStaff } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (area === "admin") {
    if (isAdmin) return <>{children}</>;
    if (isManager) return <Navigate to="/gestao" replace />;
    if (isSeller) return <Navigate to="/rotina" replace />;
    return <Navigate to="/" replace />;
  }
  if (area === "management") {
    if (isAdmin || isManager) return <>{children}</>;
    if (isSeller) return <Navigate to="/rotina" replace />;
    return <Navigate to="/" replace />;
  }
  if (area === "staff") {
    if (isStaff) return <>{children}</>;
    return <Navigate to="/" replace />;
  }
  if (isSeller) return <>{children}</>;
  if (isAdmin) return <Navigate to="/gestao" replace />;
  if (isManager) return <Navigate to="/gestao" replace />;
  return <Navigate to="/" replace />;
}

function AuthRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : <AuthPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute />} />
      <Route path="/" element={<ProtectedRoute><Navbar /><LandingPage /></ProtectedRoute>} />
      <Route path="/catalog" element={<ProtectedRoute><Navbar /><CatalogPage /></ProtectedRoute>} />
      <Route path="/curadoria" element={<ProtectedRoute><Navbar /><CuradoriaPage /></ProtectedRoute>} />
      <Route path="/relacionamento" element={<ProtectedRoute><Navbar /><RelationshipPage /></ProtectedRoute>} />
      <Route path="/segments" element={<Navigate to="/catalog" replace />} />
      <Route path="/brands/:segment" element={<Navigate to="/catalog" replace />} />
      <Route path="/brand/:brandId" element={<ProtectedRoute><Navbar /><BrandCatalogPage /></ProtectedRoute>} />
      <Route path="/brand/:brandId/acabamentos" element={<ProtectedRoute><Navbar /><BrandFinishesPage /></ProtectedRoute>} />
      <Route path="/product/:productId" element={<ProtectedRoute><Navbar /><ProductDetailPage /></ProtectedRoute>} />
      <Route path="/favorites" element={<ProtectedRoute><Navbar /><FavoritesPage /></ProtectedRoute>} />
      <Route path="/projects" element={<ProtectedRoute><Navbar /><ProjectsPage /></ProtectedRoute>} />
      <Route path="/consultor-valores" element={<RoleRoute area="staff"><Navbar /><PriceConsultantPage /></RoleRoute>} />
      <Route path="/gestao/*" element={<RoleRoute area="management"><Navbar /><OperationsPage /></RoleRoute>} />
      <Route path="/rotina/*" element={<RoleRoute area="seller"><Navbar /><OperationsPage /></RoleRoute>} />
      <Route path="/admin" element={<RoleRoute area="admin"><Navbar /><AdminPage /></RoleRoute>} />
      <Route path="/admin/precos" element={<Navigate to="/consultor-valores" replace />} />
      <Route path="/compare" element={<ProtectedRoute><Navbar /><ComparePage /></ProtectedRoute>} />
      <Route path="/admin/analytics" element={<RoleRoute area="management"><Navbar /><AdminAnalyticsPage /></RoleRoute>} />
      <Route path="/shared/:token" element={<SharedProjectPage />} />
      <Route path="/privacidade" element={<PrivacyPolicyPage />} />
      <Route path="/termos" element={<TermsOfUsePage />} />
      <Route path="/bioinsta" element={<BioInstaPage />} />
      <Route path="/marketing" element={<ProtectedRoute><MarketingPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppErrorBoundary>
          <AuthProvider>
            <CompareProvider>
              <AppRoutes />
              <CompareBar />
              <WelcomeModal />
              <CookieConsent />
            </CompareProvider>
          </AuthProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
