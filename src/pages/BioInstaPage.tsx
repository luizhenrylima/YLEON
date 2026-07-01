import { MapPin, MessageCircle } from "lucide-react";
import React, { useState } from "react";
import logoYleon from "@/assets/logo-yleon.png";
import rafaelaImg from "@/assets/bio/rafaela_mendes.webp";
import danielleImg from "@/assets/bio/danielle_lara.webp";
import diegoImg from "@/assets/bio/diego_marques.webp";
import valquiriaImg from "@/assets/bio/valquiria_oliveira.jpeg";
import bioBg from "@/assets/bio/bio-bg.png";
import { useEffect } from "react";

// Tenta diferentes nomes possíveis do logo
let logoSrc: string;
try {
  logoSrc = logoYleon;
} catch {
  logoSrc = "";
}

const ADDRESS_URL =
  "https://www.google.com/maps/search/?api=1&query=Av.+Miguel+Sutil+10040+Jardim+Mariana+Cuiabá";
const WHATS_GERAL =
  "https://api.whatsapp.com/send?phone=5565981002789&text=Ol%C3%A1!%20Gostaria%20de%20saber%20mais%20sobre%20seus%20servi%C3%A7os.%20Podemos%20conversar%3F";

const consultores = [
  {
    name: "Valquíria Oliveira",
    role: "Consultora",
    img: valquiriaImg,
    link: "https://api.whatsapp.com/send?phone=5565992628108",
  },
  {
    name: "Rafaela Mendes",
    role: "Consultora",
    img: rafaelaImg,
    link: "https://api.whatsapp.com/send?phone=5565999617204",
  },
  {
    name: "Danielle Lara",
    role: "Consultora",
    img: danielleImg,
    link: "https://api.whatsapp.com/send?phone=5565999316056",
  },
  {
    name: "Diego Marques",
    role: "Consultor",
    img: diegoImg,
    link: "https://api.whatsapp.com/send?phone=5541988326597",
  },
];

const BioInstaPage = () => {
  useEffect(() => {
    document.title = "YLEON — Link in Bio";
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-[#e9d9b8] overflow-x-hidden">
      {/* Background image */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-no-repeat bg-cover bg-center opacity-60"
        style={{ backgroundImage: `url(${bioBg})` }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(10,10,10,0.6)_100%)]" />

      <main className="relative z-10 mx-auto w-full max-w-md sm:max-w-lg md:max-w-2xl px-5 py-10 sm:py-14">
        {/* Logo */}
        <div className="flex flex-col items-center animate-fade-in">
          <img
            src={logoSrc}
            alt="YLEON"
            className="h-28 sm:h-36 md:h-44 w-auto object-contain drop-shadow-[0_0_25px_rgba(233,217,184,0.15)]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />

          {/* Descrição com efeito de digitação */}
          <TypewriterIntro />

          <div className="mt-5 h-px w-16 bg-[#e9d9b8]/40" />
        </div>

        {/* Cards */}
        <div className="mt-8 sm:mt-10 space-y-4 sm:space-y-5">
          {/* Endereço */}
          <BioCard
            href={ADDRESS_URL}
            delay={0.1}
            icon={<MapPin className="h-6 w-6" strokeWidth={1.4} />}
          >
            <div className="text-base sm:text-lg font-light tracking-wide">
              Estamos aqui
            </div>
            <div className="text-xs sm:text-sm text-[#e9d9b8]/70 mt-0.5">
              Av. Miguel Sutil, 10040 - Jardim Mariana, Cuiabá
            </div>
          </BioCard>

          {/* Atendimento Geral */}
          <BioCard
            href={WHATS_GERAL}
            delay={0.2}
            icon={<MessageCircle className="h-6 w-6" strokeWidth={1.4} />}
          >
            <div className="text-base sm:text-lg font-light tracking-wide">
              Atendimento
            </div>
          </BioCard>

          {/* Consultores */}
          {consultores.map((c, i) => (
            <BioCard
              key={c.name}
              href={c.link}
              delay={0.3 + i * 0.1}
              avatar={c.img}
            >
              <div className="text-base sm:text-lg font-light tracking-wide">
                {c.role} {c.name}
              </div>
            </BioCard>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 sm:mt-14 text-center text-[10px] sm:text-xs text-[#e9d9b8]/40 tracking-[0.25em] uppercase animate-fade-in">
          YLEON · Cuiabá
        </div>
      </main>
    </div>
  );
};

interface BioCardProps {
  href: string;
  delay?: number;
  icon?: React.ReactNode;
  avatar?: string;
  children: React.ReactNode;
}

const BioCard = ({ href, delay = 0, icon, avatar, children }: BioCardProps) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    style={{ animationDelay: `${delay}s`, animationFillMode: "both" }}
    className="group relative flex items-center gap-4 sm:gap-5 rounded-full border border-[#e9d9b8]/30 bg-white/[0.02] backdrop-blur-sm px-3 py-3 sm:px-4 sm:py-3.5 transition-all duration-500 hover:border-[#e9d9b8]/70 hover:bg-white/[0.05] hover:scale-[1.02] hover:shadow-[0_0_30px_-10px_rgba(233,217,184,0.4)] animate-fade-in"
  >
    <div className="flex-shrink-0 flex items-center justify-center">
      {avatar ? (
        <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden border border-[#e9d9b8]/40 group-hover:border-[#e9d9b8]/80 transition-colors">
          <img
            src={avatar}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        </div>
      ) : (
        <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border border-[#e9d9b8]/40 flex items-center justify-center group-hover:border-[#e9d9b8]/80 transition-colors">
          {icon}
        </div>
      )}
    </div>
    <div className="h-8 w-px bg-[#e9d9b8]/30 group-hover:bg-[#e9d9b8]/60 transition-colors" />
    <div className="flex-1 min-w-0 pr-3">{children}</div>
  </a>
);

// ─── Typewriter ─────────────────────────────────────────────
const TYPE_LINES = [
  { text: "Mobiliário Brasileiro Contemporâneo", className: "text-sm sm:text-base md:text-lg font-light tracking-[0.15em] uppercase text-[#e9d9b8]" },
  { text: "Curadoria de peças icônicas que refletem o melhor do design.", className: "text-xs sm:text-sm text-[#e9d9b8]/70 font-light" },
  { text: "Visite nosso Showroom", className: "text-xs sm:text-sm italic text-[#e9d9b8]/90" },
];

const TypewriterIntro = () => {
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);

  React.useEffect(() => {
    if (lineIdx >= TYPE_LINES.length) return;
    const current = TYPE_LINES[lineIdx].text;
    if (charIdx < current.length) {
      const t = setTimeout(() => setCharIdx((c) => c + 1), 35);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setLineIdx((i) => i + 1);
      setCharIdx(0);
    }, 350);
    return () => clearTimeout(t);
  }, [lineIdx, charIdx]);

  return (
    <div className="mt-5 px-4 text-center min-h-[5.5rem] sm:min-h-[6rem] flex flex-col items-center justify-start gap-1.5">
      {TYPE_LINES.map((line, i) => {
        const visible =
          i < lineIdx
            ? line.text
            : i === lineIdx
            ? line.text.slice(0, charIdx)
            : "";
        const isTyping = i === lineIdx && charIdx < line.text.length;
        if (i > lineIdx) return null;
        return (
          <div key={i} className={line.className}>
            {visible}
            {isTyping && (
              <span className="inline-block w-[1px] h-[0.9em] align-middle bg-[#e9d9b8] ml-0.5 animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BioInstaPage;
