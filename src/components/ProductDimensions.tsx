import { Ruler } from 'lucide-react';

export type Dimensions = {
  height?: string;
  width?: string;
  depth?: string;
};

type DimensionInput = string | number | null | undefined;

type ProductDimensionsProps = {
  height?: DimensionInput;
  width?: DimensionInput;
  depth?: DimensionInput;
  description?: string | null;
};

const numberPattern = '(\\d+(?:\\.\\d+)?)';

function normalizeDimensionText(description: string) {
  return description
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/[×]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDimensionValue(value: DimensionInput) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;

  const numeric = text
    .replace(/,/g, '.')
    .match(/\d+(?:\.\d+)?/);

  return numeric?.[0] || text;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

export function extractDimensionsFromDescription(description?: string | null): Dimensions {
  if (!description?.trim()) return {};

  const text = normalizeDimensionText(description);
  const dimensions: Dimensions = {};

  const labelToValuePrefix = '(?:^|[\\s|,;:/\\-x])';
  const optionalUnit = '\\s*(?:cm|cms|centimetros?)?\\b';

  dimensions.height = firstMatch(text, [
    new RegExp(`${labelToValuePrefix}(?:altura|alt\\.?|a)\\s*[:\\-]?\\s*${numberPattern}${optionalUnit}`),
    new RegExp(`${numberPattern}\\s*(?:cm|cms|centimetros?)?\\s*(?:de\\s*)?(?:altura)\\b`),
  ]);

  dimensions.width = firstMatch(text, [
    new RegExp(`${labelToValuePrefix}(?:largura|larg\\.?|l)\\s*[:\\-]?\\s*${numberPattern}${optionalUnit}`),
    new RegExp(`${numberPattern}\\s*(?:cm|cms|centimetros?)?\\s*(?:de\\s*)?(?:largura)\\b`),
  ]);

  dimensions.depth = firstMatch(text, [
    new RegExp(`${labelToValuePrefix}(?:profundidade|prof\\.?|p|comprimento|comp\\.?|c)\\s*[:\\-]?\\s*${numberPattern}${optionalUnit}`),
    new RegExp(`${numberPattern}\\s*(?:cm|cms|centimetros?)?\\s*(?:de\\s*)?(?:profundidade|comprimento)\\b`),
  ]);

  const genericMatch = text.match(
    new RegExp(`(?:dimensoes|medidas)?\\s*:?\\s*${numberPattern}\\s*(?:cm)?\\s*x\\s*${numberPattern}\\s*(?:cm)?\\s*x\\s*${numberPattern}\\s*(?:cm)?\\b`)
  );

  if (genericMatch) {
    dimensions.height = dimensions.height || genericMatch[1];
    dimensions.width = dimensions.width || genericMatch[2];
    dimensions.depth = dimensions.depth || genericMatch[3];
  }

  return dimensions;
}

function formatDimension(value: string) {
  return `${value.replace('.', ',')} cm`;
}

export default function ProductDimensions({ height, width, depth, description }: ProductDimensionsProps) {
  const extracted = extractDimensionsFromDescription(description);
  const dimensions: Dimensions = {
    height: cleanDimensionValue(height) || extracted.height,
    width: cleanDimensionValue(width) || extracted.width,
    depth: cleanDimensionValue(depth) || extracted.depth,
  };

  const rows = [
    { label: 'Altura', value: dimensions.height },
    { label: 'Largura', value: dimensions.width },
    { label: 'Profundidade', value: dimensions.depth },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  if (!rows.length) return null;

  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-accent">
          <Ruler size={16} aria-hidden="true" />
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground">
          Dimensões
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {rows.map(row => (
          <div key={row.label} className="rounded-lg border border-border/70 bg-background/60 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{row.label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{formatDimension(row.value)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
