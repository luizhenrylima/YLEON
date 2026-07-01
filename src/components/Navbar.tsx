import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  FolderOpen,
  Handshake,
  Heart,
  LogOut,
  Maximize2,
  Minimize2,
  Pencil,
  Settings,
  User,
} from "lucide-react";
import logoYleon from "@/assets/logo-yleon.png";

const getFullscreenElement = () =>
  document.fullscreenElement || (document as any).webkitFullscreenElement || null;

const isTabletLikeDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const hasTouch = navigator.maxTouchPoints > 1;
  const isiPad = /iPad/.test(ua) || (platform === "MacIntel" && hasTouch);
  const isAndroidTablet = /Android/.test(ua) && !/Mobile/.test(ua);
  const tabletViewport = window.innerWidth >= 720 && window.innerWidth <= 1366;

  return isiPad || isAndroidTablet || (hasTouch && tabletViewport);
};

export default function Navbar() {
  const { user, isAdmin, isManager, isSeller, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [useAppFullscreen, setUseAppFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!getFullscreenElement() || document.documentElement.classList.contains("app-fullscreen"));
    };

    setFullscreenSupported(
      isTabletLikeDevice() ||
      !!document.documentElement.requestFullscreen ||
      !!(document.documentElement as any).webkitRequestFullscreen
    );
    handleChange();

    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange as EventListener);

    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange as EventListener);
      document.documentElement.classList.remove("app-fullscreen");
      document.body.classList.remove("app-fullscreen");
    };
  }, []);

  useEffect(() => {
    const syncViewportHeight = () => {
      document.documentElement.style.setProperty("--app-viewport-height", `${window.innerHeight}px`);
    };

    syncViewportHeight();
    window.addEventListener("resize", syncViewportHeight);
    window.addEventListener("orientationchange", syncViewportHeight);

    return () => {
      window.removeEventListener("resize", syncViewportHeight);
      window.removeEventListener("orientationchange", syncViewportHeight);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const setAppFullscreen = (enabled: boolean) => {
    setUseAppFullscreen(enabled);
    document.documentElement.classList.toggle("app-fullscreen", enabled);
    document.body.classList.toggle("app-fullscreen", enabled);
    setIsFullscreen(enabled || !!getFullscreenElement());
  };

  const toggleFullscreen = async () => {
    try {
      const doc = document as any;
      const root = document.documentElement as any;
      const active = getFullscreenElement();

      if (isTabletLikeDevice()) {
        setAppFullscreen(!useAppFullscreen);
        return;
      }

      if (useAppFullscreen) {
        setAppFullscreen(false);
      } else if (active) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      } else {
        setAppFullscreen(true);
      }
    } catch {
      setAppFullscreen(!useAppFullscreen);
    }
  };

  const navTextClass = "shrink-0 text-[10px] uppercase tracking-[0.15em] transition-colors link-underline";
  const navIconTextClass = `flex shrink-0 items-center gap-1.5 ${navTextClass}`;

  return (
    <>
      <nav className="app-navbar flex items-center justify-between gap-3 border-b border-[#d7b65d]/25 bg-[#10140d]/92 text-[#f4ecd7] shadow-[0_12px_40px_-28px_rgba(0,0,0,0.75)] backdrop-blur-lg transition-all duration-300 [&_a]:text-[#f4ecd7]/72 [&_a:hover]:text-[#f4ecd7] [&_button]:text-[#f4ecd7]/72 [&_button:hover]:text-[#f4ecd7]">
        <Link to="/" className="flex h-14 shrink-0 items-center overflow-visible group md:h-16">
          <img
            src={logoYleon}
            alt="YLEON"
            className="h-14 w-auto drop-shadow-[0_0_18px_rgba(215,182,93,0.18)] transition-transform duration-300 group-hover:scale-[1.02] md:h-16"
          />
        </Link>

        <div className="app-navbar-scroll flex flex-1 items-center justify-end gap-2 text-sm sm:gap-4 lg:gap-5">
          <Link to="/catalog" className={navTextClass}>
            Cat&aacute;logo
          </Link>
          <Link to="/curadoria" className={navTextClass}>
            Curadoria
          </Link>
          <Link
            to="/relacionamento"
            className="hidden shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] transition-colors link-underline md:flex"
            title="Relacionamento"
          >
            <Handshake size={14} />
            Relacionamento
          </Link>
          <Link
            to="/projects"
            className={navIconTextClass}
            title={isAdmin ? "Todos os Projetos" : isSeller ? "Painel do Vendedor" : "Meus Projetos"}
          >
            {isStaff ? <Pencil size={14} /> : <FolderOpen size={14} />}
            Projetos
          </Link>

          {isStaff && (
            <Link to="/consultor-valores" className={navIconTextClass} title="Cotacao">
              <BadgeDollarSign size={14} />
              Cota&ccedil;&atilde;o
            </Link>
          )}

          {isStaff && (
            <Link to={isSeller ? "/rotina" : "/gestao"} className={navIconTextClass} title={isSeller ? "Rotina" : "Gestao"}>
              <BriefcaseBusiness size={14} />
              {isSeller ? "Rotina" : <>Gest&atilde;o</>}
            </Link>
          )}

          <Link to="/favorites" className="shrink-0 text-[#f4ecd7]/70 transition-colors duration-200 hover:text-accent" title="Favoritos">
            <Heart size={18} />
          </Link>

          {(isAdmin || isManager) && (
            <Link to="/admin/analytics" className={navIconTextClass} title="Performance & Curadoria">
              <BarChart3 size={14} />
              Performance
            </Link>
          )}

          {isAdmin && (
            <Link to="/admin" className="flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-accent transition-colors hover:text-accent/80">
              <Settings size={14} />
              Admin
            </Link>
          )}

          <div className="flex shrink-0 items-center gap-2 border-l border-white/15 pl-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[#f4ecd7]/58">
              <User size={14} />
              <span className="hidden xl:inline">{user?.email?.split("@")[0]}</span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-[#f4ecd7]/58 transition-colors hover:text-[#f4ecd7]"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={16} />
            </button>
            {fullscreenSupported && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                aria-label={isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
                aria-pressed={isFullscreen}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
          </div>
        </div>
      </nav>
      <div className="app-navbar-spacer" aria-hidden="true" />
    </>
  );
}
