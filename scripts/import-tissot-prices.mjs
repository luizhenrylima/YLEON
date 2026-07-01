import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

const { readFile, utils } = xlsx;

const DEFAULT_XLSX_PATH = 'C:/Users/nycol/Downloads/tabela nova (1).xlsx';
const DEFAULT_TENANT_SLUG = 'acervo-1055';
const IGNORED_SHEETS = new Set(['CAPA', 'COMPLETA', 'Preços']);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workbookPath = process.env.TISSOT_XLSX_PATH || DEFAULT_XLSX_PATH;
const tenantSlug = process.env.PRICE_TENANT_SLUG || DEFAULT_TENANT_SLUG;
const shouldClear = process.env.CLEAR_TISSOT_PRICES !== 'false';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function numberFromCell(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const parsed = Number(String(raw ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function cell(row, index) {
  return String(row?.[index] ?? '').trim();
}

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'sem-nome';
}

function isCodeLike(value) {
  const text = String(value ?? '').trim();
  return /^[A-Z]{2,5}\d/i.test(text) || /^[A-Z]{2,5}\d.*\|/i.test(text);
}

function isNoteLike(value) {
  const text = String(value || '').toUpperCase();
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

function hasFutureCodeRows(rows, index) {
  for (let offset = 1; offset <= 3; offset += 1) {
    const next = rows[index + offset];
    if (!next) continue;
    if (isCodeLike(next[0]) || next.some(item => isCodeLike(item))) return true;
  }
  return false;
}

function isProductTitleRow(rows, index) {
  const first = cell(rows[index], 0);
  if (!first || isCodeLike(first) || isNoteLike(first)) return false;
  if (rows[index].some(item => numberFromCell(item) && Number(numberFromCell(item)) > 0)) return false;
  return hasFutureCodeRows(rows, index);
}

function extractDimension(rows) {
  const regex = /\b\d{2,3}\s*[xX]\s*\d{2,3}(?:\s*[xX]\s*\d{2,3})?\b/;
  const candidates = [];
  for (const row of rows) {
    for (const item of row) {
      const match = String(item ?? '').match(regex);
      if (!match) continue;
      const value = match[0].replace(/\s+/g, '').toUpperCase();
      const cleanText = String(item ?? '').trim().replace(/\s+/g, '').toUpperCase();
      const parts = value.split('X').length;
      const exact = cleanText === value;
      candidates.push({ value, score: (exact ? 10 : 0) + parts });
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0]?.value ?? null;
}

function componentKind(finishName, ref) {
  const normalized = `${finishName} ${ref}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if ((normalized.includes('TAMPO') || normalized.includes('VIDRO FUSING')) && (normalized.includes('METRO QUADRADO') || normalized.includes('M2') || normalized.includes('M²'))) {
    return 'Tampo por m2';
  }
  if (normalized.includes('CONTRA-TAMPO')) return 'Tampo por m2';
  if (normalized.includes('BASE') || normalized.includes('PES PARA MESA') || normalized.includes('PE PARA MESA')) return 'Base';
  return 'Padrao';
}

function uniqueBy(items, getKey) {
  const map = new Map();
  for (const item of items) map.set(getKey(item), item);
  return Array.from(map.values());
}

function parseWorkbook(path) {
  const workbook = readFile(path);
  const rows = [];
  let invalidRows = 0;

  for (const sheetName of workbook.SheetNames) {
    if (IGNORED_SHEETS.has(sheetName)) continue;
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const sheetRows = utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const blocks = [];
    let current = null;

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
      const emitted = new Set();

      const emit = (ref, finishName, price, note) => {
        const cleanRef = String(ref || '').trim();
        const cleanFinish = String(finishName || '').trim() || 'Sem acabamento especificado';
        if (!cleanRef || !price || emitted.has(cleanRef)) {
          if (!cleanRef || !price) invalidRows += 1;
          return;
        }
        emitted.add(cleanRef);

        const component = componentKind(cleanFinish, cleanRef);
        const variationDimensions = dimension || note || null;
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
          variationDescription: note || null,
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
  const flatWorksheet = workbook.Sheets['Preços'];
  if (flatWorksheet) {
    const flatRows = utils.sheet_to_json(flatWorksheet, { defval: '' });
    for (const row of flatRows) {
      const ref = String(row.Ref ?? '').trim();
      if (!ref || emittedRefs.has(ref)) continue;
      const price = numberFromCell(row[' Valor'] ?? row.Valor);
      const productName = String(row['Descrição'] ?? row.Descricao ?? '').trim();
      const finishName = String(row['Padrão'] ?? row.Padrao ?? 'Sem acabamento especificado').trim() || 'Sem acabamento especificado';
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
        sourceReference: 'Preços',
      });
      emittedRefs.add(ref);
    }
  }

  return { rows, invalidRows };
}

async function upsertChunks(table, rows, onConflict, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function fetchAll(table, columns, tenantId) {
  const result = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq('tenant_id', tenantId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return result;
}

async function clearExistingPrices(tenantId) {
  for (const table of ['price_table', 'price_product_variations', 'price_finishes', 'price_products', 'price_categories', 'price_brands']) {
    const { error } = await supabase.from(table).delete().eq('tenant_id', tenantId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

  const parsed = parseWorkbook(workbookPath);
  const rows = parsed.rows;
  if (shouldClear) await clearExistingPrices(tenant.id);

  const brandRows = uniqueBy(rows, row => slugify(row.brandName)).map(row => ({
    tenant_id: tenant.id,
    name: row.brandName,
    slug: slugify(row.brandName),
    source_brand_name: row.brandName,
    default_markup_percent: 0,
  }));
  await upsertChunks('price_brands', brandRows, 'tenant_id,slug');
  const brands = await fetchAll('price_brands', 'id, slug', tenant.id);
  const brandMap = new Map(brands.map(brand => [brand.slug, brand.id]));

  const categoryRows = uniqueBy(rows, row => `${row.brandName}|${row.categorySourceId}`).map(row => ({
    tenant_id: tenant.id,
    brand_id: brandMap.get(slugify(row.brandName)),
    name: row.categoryName,
    slug: slugify(row.categorySourceId),
    source_category_id: row.categorySourceId,
  })).filter(row => row.brand_id);
  await upsertChunks('price_categories', categoryRows, 'tenant_id,brand_id,slug');
  const categories = await fetchAll('price_categories', 'id, brand_id, slug', tenant.id);
  const categoryMap = new Map(categories.map(category => [`${category.brand_id}|${category.slug}`, category.id]));

  const productRows = uniqueBy(rows, row => row.productSourceId).map(row => {
    const brandId = brandMap.get(slugify(row.brandName));
    return {
      tenant_id: tenant.id,
      brand_id: brandId,
      category_id: categoryMap.get(`${brandId}|${slugify(row.categorySourceId)}`),
      name: row.productName,
      slug: row.productSlug,
      reference_code: row.referenceCode,
      description: null,
      designer: row.designer,
      source_product_id: row.productSourceId,
      markup_percent: null,
    };
  }).filter(row => row.brand_id && row.category_id);
  await upsertChunks('price_products', productRows, 'tenant_id,brand_id,source_product_id');
  const products = await fetchAll('price_products', 'id, source_product_id', tenant.id);
  const productMap = new Map(products.map(product => [product.source_product_id, product.id]));

  const variationRows = uniqueBy(rows, row => row.variationSourceId).map(row => {
    const brandId = brandMap.get(slugify(row.brandName));
    return {
      tenant_id: tenant.id,
      brand_id: brandId,
      category_id: categoryMap.get(`${brandId}|${slugify(row.categorySourceId)}`),
      product_id: productMap.get(row.productSourceId),
      variation_code: row.variationCode,
      variation_name: row.variationName,
      dimensions: row.variationDimensions,
      module: null,
      description: row.variationDescription,
      source_variation_id: row.variationSourceId,
    };
  }).filter(row => row.brand_id && row.category_id && row.product_id);
  await upsertChunks('price_product_variations', variationRows, 'tenant_id,product_id,source_variation_id');
  const variations = await fetchAll('price_product_variations', 'id, source_variation_id', tenant.id);
  const variationMap = new Map(variations.map(variation => [variation.source_variation_id, variation.id]));

  const finishRows = uniqueBy(rows, row => `${row.brandName}|${row.finishCode}`).map(row => ({
    tenant_id: tenant.id,
    brand_id: brandMap.get(slugify(row.brandName)),
    name: row.finishName,
    finish_type: row.finishType,
    code: row.finishCode,
    slug: row.finishSlug,
    source_finish_id: row.finishCode,
  })).filter(row => row.brand_id);
  await upsertChunks('price_finishes', finishRows, 'tenant_id,brand_id,code');
  const finishes = await fetchAll('price_finishes', 'id, brand_id, code', tenant.id);
  const finishMap = new Map(finishes.map(finish => [`${finish.brand_id}|${finish.code}`, finish.id]));

  const priceRows = uniqueBy(rows.map(row => {
    const brandId = brandMap.get(slugify(row.brandName));
    return {
      tenant_id: tenant.id,
      brand_id: brandId,
      category_id: categoryMap.get(`${brandId}|${slugify(row.categorySourceId)}`),
      product_id: productMap.get(row.productSourceId),
      variation_id: variationMap.get(row.variationSourceId),
      finish_id: finishMap.get(`${brandId}|${row.finishCode}`),
      price: row.price,
      currency: 'BRL',
      source_reference: row.sourceReference,
      source_price_id: row.priceId,
    };
  }).filter(row => row.brand_id && row.category_id && row.product_id && row.variation_id && row.finish_id), row =>
    `${row.tenant_id}|${row.brand_id}|${row.category_id}|${row.product_id}|${row.variation_id}|${row.finish_id}`
  );
  await upsertChunks('price_table', priceRows, 'tenant_id,brand_id,category_id,product_id,variation_id,finish_id');

  console.log(JSON.stringify({
    tenant: tenant.name,
    source: workbookPath,
    clearedBeforeImport: shouldClear,
    invalidRows: parsed.invalidRows,
    brands: brandRows.length,
    categories: categoryRows.length,
    products: productRows.length,
    variations: variationRows.length,
    finishes: finishRows.length,
    prices: priceRows.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
