import { ArrowDown, ArrowUpRight, Building2, MapPin, Sparkles } from 'lucide-react';

type ShowroomInfo = {
  label: string;
  value: string;
};

type ShowroomExperienceSectionProps = {
  id?: string;
  eyebrow: string;
  title: string;
  highlightedTitle: string;
  description: string[];
  tourUrl: string;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  infoItems?: ShowroomInfo[];
  sectionRef?: (element: HTMLElement | null) => void;
  className?: string;
};

const defaultInfoItems: ShowroomInfo[] = [
  { label: 'Localização', value: 'Bela Vista · São Paulo' },
  { label: 'Coleção', value: 'Doimo' },
  { label: 'Experiência', value: 'Tour virtual imersivo' },
];

const supportIcons = [MapPin, Sparkles, Building2];

export default function ShowroomExperienceSection({
  id = 'casarao-doimo',
  eyebrow,
  title,
  highlightedTitle,
  description,
  tourUrl,
  primaryCtaLabel = 'Abrir experiência',
  secondaryCtaLabel = 'Ver detalhes',
  infoItems = defaultInfoItems,
  sectionRef,
  className = '',
}: ShowroomExperienceSectionProps) {
  return (
    <section
      id={id}
      ref={sectionRef}
      className={`relative overflow-hidden bg-[#F8F4EC] px-6 py-20 text-[#221F1A] md:px-12 md:py-28 lg:px-24 ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#D8C8AA] to-transparent" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.045]" style={{ backgroundImage: 'linear-gradient(#221F1A 1px, transparent 1px), linear-gradient(90deg, #221F1A 1px, transparent 1px)', backgroundSize: '72px 72px' }} />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-end">
          <div>
            <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-[#D8C8AA] bg-white/55 px-4 py-2 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B58A54]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8D6B43]">
                {eyebrow}
              </span>
            </div>

            <h2 className="max-w-2xl font-serif text-4xl leading-[0.98] tracking-normal text-[#221F1A] md:text-6xl lg:text-7xl">
              {title}
              <span className="mt-2 block w-fit bg-[#221F1A] px-3 pb-2 pt-1 italic text-[#F8F4EC] shadow-[10px_10px_0_rgba(181,138,84,0.22)] md:px-4">
                {highlightedTitle}
              </span>
            </h2>

            <div className="mt-9 grid gap-3 sm:grid-cols-3">
              {infoItems.map((item, index) => {
                const Icon = supportIcons[index % supportIcons.length];
                return (
                  <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-[#E4D8C4] bg-white/58 px-4 py-4 shadow-[0_16px_35px_rgba(34,31,26,0.04)] backdrop-blur">
                    <Icon className="mb-4 h-4 w-4 text-[#B58A54]" aria-hidden="true" />
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#8F887C]">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-[#221F1A]">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:pl-10">
            <div className="border-l border-[#D8C8AA] pl-6 md:pl-8">
              <div className="space-y-5 text-sm leading-relaxed text-[#6E665C] md:text-[15px]">
                {description.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={tourUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#221F1A] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F8F4EC] shadow-[0_18px_34px_rgba(34,31,26,0.18)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#3A332A]"
                >
                  {primaryCtaLabel}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <a
                  href={`#${id}-preview`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#D8C8AA] bg-white/65 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#221F1A] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#B58A54] hover:text-[#8D6B43]"
                >
                  {secondaryCtaLabel}
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div id={`${id}-preview`} className="mt-14 overflow-hidden rounded-[32px] border border-[#D8C8AA] bg-[#221F1A] shadow-[0_32px_80px_rgba(34,31,26,0.18)]">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#221F1A] px-5 py-4 text-[#F8F4EC] md:px-7">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#D8C8AA]">Preview da experiência</p>
              <p className="mt-1 text-sm font-medium">Tour virtual Matterport</p>
            </div>
            <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/65">
              Imersivo
            </span>
          </div>
          <div className="aspect-[4/5] bg-[#15130F] md:aspect-video">
            <iframe
              src={tourUrl}
              title={`Tour virtual ${highlightedTitle}`}
              className="h-full w-full"
              loading="lazy"
              allow="fullscreen; vr; xr-spatial-tracking"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}
