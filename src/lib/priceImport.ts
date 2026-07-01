import { read, utils } from 'xlsx';
import { slugify } from './priceConsultant';

export interface RawWorkbookRows {
  categorias: Record<string, unknown>[];
  produtos: Record<string, unknown>[];
  variacoes: Record<string, unknown>[];
  precos: Record<string, unknown>[];
  acabamentos: Record<string, unknown>[];
}

export interface NormalizedPriceRow {
  priceId: string;
  productSourceId: string;
  variationSourceId: string;
  brandName: string;
  categorySourceId: string;
  categoryName: string;
  productName: string;
  productSlug: string;
  referenceCode: string;
  variationCode: string;
  variationName: string;
  variationDimensions: string | null;
  variationDescription: string | null;
  designer: string | null;
  finishCode: string;
  finishName: string;
  finishSlug: string;
  finishType: string | null;
  price: number;
  sourceReference: string | null;
}

export interface ParsedPriceWorkbook {
  rows: NormalizedPriceRow[];
  invalidRows: number;
  counts: {
    brands: number;
    categories: number;
    products: number;
    variations: number;
    finishes: number;
    prices: number;
  };
}

const PLACEHOLDER_FINISH_NAME = 'Sem acabamento especificado';
const PLACEHOLDER_FINISH_CODE = 'SEM-ACABAMENTO';
const FLAT_PRICE_SHEET_NAME = 'Preços';
const IGNORED_NEW_PRICE_SHEETS = new Set(['CAPA', 'COMPLETA', FLAT_PRICE_SHEET_NAME]);

function value(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  if (raw == null) return '';
  return String(raw).trim();
}

function numberValue(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const parsed = Number(String(raw ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function numberFromCell(raw: unknown) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const parsed = Number(String(raw ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function cell(row: unknown[], index: number) {
  return String(row[index] ?? '').trim();
}

function isCodeLike(value: unknown) {
  const text = String(value ?? '').trim();
  return /^[A-Z]{2,5}\d/i.test(text) || /^[A-Z]{2,5}\d.*\|/i.test(text);
}

function isNoteLike(value: string) {
  const text = value.toUpperCase();
  return (
    text === '+' ||
    text.startsWith('DESIGNER') ||
    text.startsWith('PARA LACA') ||
    text.startsWith('TECIDO') ||
    text.startsWith('COURO') ||
    text.startsWith('MÓVEL') ||
    text.startsWith('MOVEL') ||
    text.startsWith('ATENÇÃO') ||
    text.startsWith('ATENCAO') ||
    text.startsWith('INDICAÇÕES') ||
    text.startsWith('INDICACOES')
  );
}

function hasFutureCodeRows(rows: unknown[][], index: number) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const next = rows[index + offset];
    if (!next) continue;
    if (isCodeLike(next[0]) || next.some(item => isCodeLike(item))) return true;
  }
  return false;
}

function isProductTitleRow(rows: unknown[][], index: number) {
  const first = cell(rows[index], 0);
  if (!first || isCodeLike(first) || isNoteLike(first)) return false;
  if (rows[index].some(item => numberFromCell(item) && Number(numberFromCell(item)) > 0)) return false;
  return hasFutureCodeRows(rows, index);
}

function extractDimension(rows: unknown[][]) {
  const regex = /\b\d{2,3}\s*[xX]\s*\d{2,3}(?:\s*[xX]\s*\d{2,3})?\b/;
  const candidates: { value: string; score: number }[] = [];
  for (const row of rows) {
    for (const item of row) {
      const text = String(item ?? '');
      const match = text.match(regex);
      if (!match) continue;
      const value = match[0].replace(/\s+/g, '').toUpperCase();
      const cleanText = text.trim().replace(/\s+/g, '').toUpperCase();
      const parts = value.split('X').length;
      const exact = cleanText === value;
      candidates.push({ value, score: (exact ? 10 : 0) + parts });
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0]?.value ?? null;
}

function componentKind(finishName: string, ref: string) {
  const normalized = `${finishName} ${ref}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if ((normalized.includes('TAMPO') || normalized.includes('VIDRO FUSING')) && (normalized.includes('METRO QUADRADO') || normalized.includes('M2') || normalized.includes('M²'))) {
    return 'Tampo por m2';
  }
  if (normalized.includes('CONTRA-TAMPO')) return 'Tampo por m2';
  if (normalized.includes('BASE') || normalized.includes('PES PARA MESA') || normalized.includes('PE PARA MESA')) return 'Base';
  return 'Padrao';
}

function mapBy<T>(rows: T[], getKey: (row: T) => string) {
  return new Map(rows.map(row => [getKey(row), row]));
}

export function normalizePriceRows(raw: RawWorkbookRows): ParsedPriceWorkbook {
  const productMap = mapBy(raw.produtos, row => value(row, 'produto_id'));
  const variationMap = mapBy(raw.variacoes, row => value(row, 'variacao_id'));
  const categoryMap = mapBy(raw.categorias, row => value(row, 'categoria_id'));
  const rows: NormalizedPriceRow[] = [];
  let invalidRows = 0;

  for (const row of raw.precos) {
    const price = numberValue(row, 'valor_tabela');
    const productSourceId = value(row, 'produto_id');
    const variationSourceId = value(row, 'variacao_id');
    const brandName = value(row, 'marca') || 'Tissot';
    const categorySourceId = value(row, 'categoria');
    const productName = value(row, 'produto');
    const variationCode = value(row, 'codigo_variacao');

    if (!price || !productSourceId || !variationSourceId || !brandName || !categorySourceId || !productName || !variationCode) {
      invalidRows += 1;
      continue;
    }

    const product = productMap.get(productSourceId);
    const variation = variationMap.get(variationSourceId);
    const category = categoryMap.get(categorySourceId);
    const rawFinishName = value(row, 'acabamento_revestimento');
    const rawFinishCode = value(row, 'codigo_acabamento');
    const finishName = rawFinishName || PLACEHOLDER_FINISH_NAME;
    const finishCode = rawFinishCode || PLACEHOLDER_FINISH_CODE;
    const productSlug = value(product ?? {}, 'slug') || slugify(productName);

    rows.push({
      priceId: value(row, 'preco_id') || `${productSourceId}|${variationSourceId}|${finishCode}`,
      productSourceId,
      variationSourceId,
      brandName,
      categorySourceId,
      categoryName: value(category ?? {}, 'nome_exibicao') || categorySourceId,
      productName,
      productSlug,
      referenceCode: productSourceId,
      variationCode,
      variationName: value(variation ?? {}, 'produto') || productName,
      variationDimensions: value(row, 'medidas') || value(variation ?? {}, 'medidas') || null,
      variationDescription: value(variation ?? {}, 'observacoes_tecnicas') || value(row, 'descricao') || null,
      designer: value(product ?? {}, 'designer') || null,
      finishCode,
      finishName,
      finishSlug: slugify(`${finishCode}-${finishName}`),
      finishType: null,
      price,
      sourceReference: value(row, 'origem') || value(row, 'ref_original') || null,
    });
  }

  return {
    rows,
    invalidRows,
    counts: {
      brands: new Set(rows.map(row => row.brandName)).size,
      categories: new Set(rows.map(row => `${row.brandName}|${row.categorySourceId}`)).size,
      products: new Set(rows.map(row => row.productSourceId)).size,
      variations: new Set(rows.map(row => row.variationSourceId)).size,
      finishes: new Set(rows.map(row => `${row.brandName}|${row.finishSlug}`)).size,
      prices: rows.length,
    },
  };
}

function parseNewTissotSheets(workbook: { SheetNames: string[]; Sheets: Record<string, unknown> }): ParsedPriceWorkbook {
  const rows: NormalizedPriceRow[] = [];
  let invalidRows = 0;

  for (const sheetName of workbook.SheetNames) {
    if (IGNORED_NEW_PRICE_SHEETS.has(sheetName)) continue;
    const worksheet = workbook.Sheets[sheetName] as Parameters<typeof utils.sheet_to_json>[0] | undefined;
    if (!worksheet) continue;
    const sheetRows = utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '' });
    const blocks: { productName: string; blockRows: unknown[][]; index: number }[] = [];
    let current: { productName: string; blockRows: unknown[][]; index: number } | null = null;

    sheetRows.forEach((row, index) => {
      if (isProductTitleRow(sheetRows, index)) {
        if (current) blocks.push(current);
        current = { productName: cell(row, 0), blockRows: [], index: blocks.length + 1 };
      } else if (current) {
        current.blockRows.push(row);
      }
    });
    if (current) blocks.push(current);

    for (const block of blocks) {
      const dimension = extractDimension(block.blockRows);
      const productSlug = slugify(block.productName);
      const productSourceId = `${sheetName}|${productSlug}`;
      const emitted = new Set<string>();

      const emit = (ref: string, finishName: string, price: number, rowNote: string | null) => {
        const cleanRef = ref.trim();
        const cleanFinish = finishName.trim() || PLACEHOLDER_FINISH_NAME;
        if (!cleanRef || !price || emitted.has(cleanRef)) {
          if (!cleanRef || !price) invalidRows += 1;
          return;
        }
        emitted.add(cleanRef);
        const component = componentKind(cleanFinish, cleanRef);
        const variationDimensions = dimension || rowNote;
        const variationSourceId = `${productSourceId}|${component}|${variationDimensions || block.index}`;
        const variationName = [block.productName, component !== 'Padrao' ? component : null, variationDimensions].filter(Boolean).join(' - ');

        rows.push({
          priceId: `TIS-${cleanRef}`,
          productSourceId,
          variationSourceId,
          brandName: 'Tissot',
          categorySourceId: sheetName,
          categoryName: sheetName,
          productName: block.productName,
          productSlug,
          referenceCode: cleanRef,
          variationCode: cleanRef,
          variationName,
          variationDimensions,
          variationDescription: rowNote,
          designer: null,
          finishCode: cleanRef,
          finishName: cleanFinish,
          finishSlug: slugify(`${cleanRef}-${cleanFinish}`),
          finishType: component === 'Padrao' ? null : component,
          price,
          sourceReference: sheetName,
        });
      };

      for (let index = 0; index < block.blockRows.length; index += 1) {
        const row = block.blockRows[index];
        const ref = cell(row, 0);
        const finishName = cell(row, 1);
        const price = numberFromCell(row[5]);
        if (isCodeLike(ref) && price && price > 0 && finishName) {
          emit(ref, finishName, price, cell(row, 6) || cell(row, 7) || null);
        }

        const refs = block.blockRows[index + 1];
        const prices = block.blockRows[index + 2];
        if (!refs || !prices) continue;
        for (let column = 1; column < Math.max(row.length, refs.length, prices.length); column += 1) {
          const matrixRef = cell(refs, column);
          const matrixFinish = cell(row, column);
          const matrixPrice = numberFromCell(prices[column]);
          if (isCodeLike(matrixRef) && matrixFinish && matrixPrice && matrixPrice > 0) {
            emit(matrixRef, matrixFinish, matrixPrice, null);
          }
        }
      }
    }
  }

  const emittedRefs = new Set(rows.map(row => row.finishCode));
  const flatWorksheet = workbook.Sheets[FLAT_PRICE_SHEET_NAME] as Parameters<typeof utils.sheet_to_json>[0] | undefined;
  if (flatWorksheet) {
    const flatRows = utils.sheet_to_json<Record<string, unknown>>(flatWorksheet, { defval: '' });
    for (const row of flatRows) {
      const ref = value(row, 'Ref');
      if (!ref || emittedRefs.has(ref)) continue;
      const price = numberValue(row, ' Valor') ?? numberValue(row, 'Valor');
      const productName = value(row, 'Descrição') || value(row, 'Descricao');
      const finishName = value(row, 'Padrão') || value(row, 'Padrao') || PLACEHOLDER_FINISH_NAME;
      if (!price || !productName) {
        invalidRows += 1;
        continue;
      }

      const categorySourceId = 'PREÇOS';
      const productSlug = slugify(productName);
      const productSourceId = `${categorySourceId}|${productSlug}`;
      const component = componentKind(finishName, ref);
      const variationSourceId = `${productSourceId}|${component}|${ref}`;
      const variationName = [productName, component !== 'Padrao' ? component : null].filter(Boolean).join(' - ');

      rows.push({
        priceId: `TIS-${ref}`,
        productSourceId,
        variationSourceId,
        brandName: 'Tissot',
        categorySourceId,
        categoryName: 'Preços',
        productName,
        productSlug,
        referenceCode: ref,
        variationCode: ref,
        variationName,
        variationDimensions: null,
        variationDescription: null,
        designer: null,
        finishCode: ref,
        finishName,
        finishSlug: slugify(`${ref}-${finishName}`),
        finishType: component === 'Padrao' ? null : component,
        price,
        sourceReference: FLAT_PRICE_SHEET_NAME,
      });
      emittedRefs.add(ref);
    }
  }

  return {
    rows,
    invalidRows,
    counts: {
      brands: new Set(rows.map(row => row.brandName)).size,
      categories: new Set(rows.map(row => `${row.brandName}|${row.categorySourceId}`)).size,
      products: new Set(rows.map(row => row.productSourceId)).size,
      variations: new Set(rows.map(row => row.variationSourceId)).size,
      finishes: new Set(rows.map(row => `${row.brandName}|${row.finishCode}`)).size,
      prices: rows.length,
    },
  };
}

export async function parsePriceWorkbook(file: File): Promise<ParsedPriceWorkbook> {
  const workbook = read(await file.arrayBuffer());
  if (!workbook.Sheets.precos_normalizados && workbook.Sheets[FLAT_PRICE_SHEET_NAME]) {
    return parseNewTissotSheets(workbook);
  }
  const sheet = (name: string) => {
    const worksheet = workbook.Sheets[name];
    return worksheet ? utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' }) : [];
  };

  return normalizePriceRows({
    categorias: sheet('categorias'),
    produtos: sheet('produtos'),
    variacoes: sheet('variacoes'),
    precos: sheet('precos_normalizados'),
    acabamentos: sheet('acabamentos'),
  });
}
