import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const COOKIE_KEY = 'acervo_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_KEY);
    if (!stored) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ accepted: false, date: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] cookie-banner animate-fade-up"
      role="dialog"
      aria-label="Aviso de cookies"
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Utilizamos cookies para melhorar sua experiência, memorizar preferências e otimizar a navegação no catálogo.{' '}
            <span className="text-foreground/70">Ao continuar, você concorda com nossa política de privacidade.</span>
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={decline}
            className="label-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Recusar
          </button>
          <button
            onClick={accept}
            className="label-xs px-5 py-2 bg-foreground text-background rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Aceitar
          </button>
          <button
            onClick={decline}
            aria-label="Fechar"
            className="text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
