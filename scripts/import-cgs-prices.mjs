import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import xlsx from 'xlsx';

const { Client } = pg;

const DEFAULT_CSV_PATH = 'C:/Users/nycol/Downloads/cgs_moveis_importacao_custo_desconto_markup.csv';
const DEFAULT_TENANT_SLUG = 'acervo-1055';
const BRAND_NAME = 'CGS Moveis';
const SOURCE_BRAND_NAME = 'CGS Móveis';
const BRAND_SLUG = 'cgs-moveis';
const MARKUP_PERCENT = 214.0;
const PLACEHOLDER_FINISH = 'Preço';

const csvPath = process.env.CGS_CSV_PATH || DEFAULT_CSV_PATH;
const tenantSlug = process.env.PRICE_TENANT_SLUG || DEFAULT_TENANT_SLUG;
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL is required.');
}

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'sem-identificacao';
}

function stableHash(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 10);
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numberFromCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  return `${(numeric * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function uniqueBy(items, getKey) {
  const map = new Map();
  for (const item of items) map.set(getKey(item), item);
  return Array.from(map.values());
}

function inferCategory(row) {
  const category = cleanText(row.categoria);
  if (category) return category;

  const name = cleanText(row.produto_nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (name.startsWith('mesa de centro')) return 'Mesa De Centro';
  if (name.startsWith('mesa apoio') || name.startsWith('mesa de apoio')) return 'Mesa De Apoio';
  if (name.startsWith('mesa de cabeceira')) return 'Mesa De Cabeceira';
  if (name.startsWith('mesa de cha')) return 'Mesa De Apoio';
  if (name.includes('composicao de mesa')) return 'Mesa De Jantar';
  if (name.startsWith('mesa')) return 'Mesa De Jantar';
  return 'Sem Categoria';
}

function productSourceId(row, categoryName) {
  return [
    SOURCE_BRAND_NAME,
    cleanText(row.linha) || 'Linha',
    categoryName,
    cleanText(row.produto_nome),
  ].join('|');
}

function variationSourceId(row) {
  return [
    cleanText(row.codigo),
    cleanText(row.dimensoes) || 'Sem dimensao',
    cleanText(row.volume) || 'Sem volume',
    cleanText(row.cor) || 'Sem cor',
    cleanText(row.tipo_preco) || 'Preco',
  ].join('|');
}

function variationCode(row) {
  return [
    cleanText(row.codigo),
    cleanText(row.dimensoes),
    cleanText(row.volume),
    cleanText(row.cor),
    cleanText(row.tipo_preco),
  ].filter(Boolean).join(' | ');
}

function variationName(row) {
  return [
    cleanText(row.produto_nome),
    cleanText(row.dimensoes),
    cleanText(row.volume),
    cleanText(row.cor),
    cleanText(row.tipo_preco),
  ].filter(Boolean).join(' - ');
}

function parseCsv(path) {
  const contents = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const workbook = xlsx.read(contents, { type: 'string', raw: false, FS: ';' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error('CSV sheet not found.');

  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
  const rows = [];
  let invalidRows = 0;
  let priceMismatches = 0;

  for (const row of rawRows) {
    const cost = numberFromCell(row.preco_custo_liquido);
    const markup = numberFromCell(row.markup);
    const suggestedPrice = numberFromCell(row.preco_venda_sugerido);
    const productName = cleanText(row.produto_nome);
    const categoryName = inferCategory(row);
    const sourceProductId = productSourceId(row, categoryName);
    const sourceVariationId = `${sourceProductId}|${variationSourceId(row)}`;
    const finishName = cleanText(row.grupo_revestimento) || PLACEHOLDER_FINISH;
    const finishCode = slugify(finishName);

    if (!cost || cost <= 0 || !productName || !cleanText(row.codigo)) {
      invalidRows += 1;
      continue;
    }

    if (markup && suggestedPrice) {
      const expected = Number((cost * markup).toFixed(2));
      if (Math.abs(expected - suggestedPrice) > 0.02) priceMismatches += 1;
    }

    rows.push({
      brandName: BRAND_NAME,
      categoryName,
      categorySlug: slugify(categoryName),
      productSourceId: sourceProductId,
      productName,
      productSlug: `${slugify(sourceProductId)}-${stableHash(sourceProductId)}`,
      referenceCode: cleanText(row.codigo),
      sourceVariationId,
      variationCode: variationCode(row),
      variationName: variationName(row),
      dimensions: cleanText(row.dimensoes) || null,
      module: cleanText(row.volume) || null,
      description: [
        cleanText(row.linha),
        cleanText(row.observacoes),
        cleanText(row.pagina_pdf) ? `Pagina PDF ${cleanText(row.pagina_pdf)}` : null,
      ].filter(Boolean).join(' | ') || null,
      finishName,
      finishCode,
      finishSlug: finishCode,
      finishType: cleanText(row.grupo_revestimento) ? 'Grupo de revestimento' : null,
      price: cost,
      sourceReference: [
        cleanText(row.pagina_pdf) ? `PDF pagina ${cleanText(row.pagina_pdf)}` : null,
        numberFromCell(row.preco_tabela_custo_bruto) ? `Custo bruto ${numberFromCell(row.preco_tabela_custo_bruto)}` : null,
        numberFromCell(row.desconto_custo_percentual) != null ? `Desconto ${formatPercent(numberFromCell(row.desconto_custo_percentual))}` : null,
      ].filter(Boolean).join(' | ') || null,
      sourcePriceId: [
        sourceVariationId,
        finishCode,
      ].join('|'),
    });
  }

  return { rows, invalidRows, priceMismatches };
}

async function insertRows(client, table, columns, rows, conflictClause = '') {
  if (!rows.length) return [];
  const results = [];
  const chunkSize = Math.max(1, Math.floor(60000 / columns.length));

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = [];
    const tuples = chunk.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    const query = `
      insert into public.${table} (${columns.join(', ')})
      values ${tuples.join(',\n')}
      ${conflictClause}
      returning *
    `;
    const result = await client.query(query, values);
    results.push(...result.rows);
  }

  return results;
}

async function main() {
  const parsed = parseCsv(csvPath);
  const rows = parsed.rows;
  if (!rows.length) throw new Error('No CGS rows found in CSV.');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query('begin');

    const tenantResult = await client.query(
      'select id, name from public.tenants where slug = $1 limit 1',
      [tenantSlug],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new Error(`Tenant not found: ${tenantSlug}`);

    const brandResult = await client.query(
      `
        insert into public.price_brands (tenant_id, name, slug, source_brand_name, default_markup_percent)
        values ($1, $2, $3, $4, $5)
        on conflict (tenant_id, slug) do update
        set name = excluded.name,
            source_brand_name = excluded.source_brand_name,
            default_markup_percent = excluded.default_markup_percent,
            updated_at = now()
        returning id, name, slug, default_markup_percent
      `,
      [tenant.id, BRAND_NAME, BRAND_SLUG, SOURCE_BRAND_NAME, MARKUP_PERCENT],
    );
    const brand = brandResult.rows[0];

    await client.query('delete from public.price_table where tenant_id = $1 and brand_id = $2', [tenant.id, brand.id]);
    await client.query('delete from public.price_product_variations where tenant_id = $1 and brand_id = $2', [tenant.id, brand.id]);
    await client.query('delete from public.price_products where tenant_id = $1 and brand_id = $2', [tenant.id, brand.id]);
    await client.query('delete from public.price_categories where tenant_id = $1 and brand_id = $2', [tenant.id, brand.id]);
    await client.query('delete from public.price_finishes where tenant_id = $1 and brand_id = $2', [tenant.id, brand.id]);

    const categoryRows = uniqueBy(rows, row => row.categorySlug).map(row => ({
      tenant_id: tenant.id,
      brand_id: brand.id,
      name: row.categoryName,
      slug: row.categorySlug,
      source_category_id: row.categoryName,
    }));
    const insertedCategories = await insertRows(
      client,
      'price_categories',
      ['tenant_id', 'brand_id', 'name', 'slug', 'source_category_id'],
      categoryRows,
      `on conflict (tenant_id, brand_id, slug) do update set
        name = excluded.name,
        source_category_id = excluded.source_category_id,
        updated_at = now()`,
    );
    const categoryMap = new Map(insertedCategories.map(category => [category.slug, category.id]));

    const productRows = uniqueBy(rows, row => row.productSourceId).map(row => ({
      tenant_id: tenant.id,
      brand_id: brand.id,
      category_id: categoryMap.get(row.categorySlug),
      name: row.productName,
      slug: row.productSlug,
      reference_code: row.referenceCode,
      description: null,
      designer: null,
      source_product_id: row.productSourceId,
      markup_percent: null,
    }));
    const insertedProducts = await insertRows(
      client,
      'price_products',
      ['tenant_id', 'brand_id', 'category_id', 'name', 'slug', 'reference_code', 'description', 'designer', 'source_product_id', 'markup_percent'],
      productRows,
      `on conflict (tenant_id, brand_id, source_product_id) do update set
        category_id = excluded.category_id,
        name = excluded.name,
        slug = excluded.slug,
        reference_code = excluded.reference_code,
        description = excluded.description,
        designer = excluded.designer,
        markup_percent = excluded.markup_percent,
        updated_at = now()`,
    );
    const productMap = new Map(insertedProducts.map(product => [product.source_product_id, product.id]));

    const variationRows = uniqueBy(rows, row => row.sourceVariationId).map(row => ({
      tenant_id: tenant.id,
      brand_id: brand.id,
      category_id: categoryMap.get(row.categorySlug),
      product_id: productMap.get(row.productSourceId),
      variation_code: row.variationCode,
      variation_name: row.variationName,
      dimensions: row.dimensions,
      module: row.module,
      description: row.description,
      source_variation_id: row.sourceVariationId,
    }));
    const insertedVariations = await insertRows(
      client,
      'price_product_variations',
      ['tenant_id', 'brand_id', 'category_id', 'product_id', 'variation_code', 'variation_name', 'dimensions', 'module', 'description', 'source_variation_id'],
      variationRows,
      `on conflict (tenant_id, product_id, source_variation_id) do update set
        category_id = excluded.category_id,
        variation_code = excluded.variation_code,
        variation_name = excluded.variation_name,
        dimensions = excluded.dimensions,
        module = excluded.module,
        description = excluded.description,
        updated_at = now()`,
    );
    const variationMap = new Map(insertedVariations.map(variation => [variation.source_variation_id, variation.id]));

    const finishRows = uniqueBy(rows, row => row.finishCode).map(row => ({
      tenant_id: tenant.id,
      brand_id: brand.id,
      name: row.finishName,
      finish_type: row.finishType,
      code: row.finishCode,
      slug: row.finishSlug,
      source_finish_id: row.finishName,
    }));
    const insertedFinishes = await insertRows(
      client,
      'price_finishes',
      ['tenant_id', 'brand_id', 'name', 'finish_type', 'code', 'slug', 'source_finish_id'],
      finishRows,
      `on conflict (tenant_id, brand_id, code) do update set
        name = excluded.name,
        finish_type = excluded.finish_type,
        slug = excluded.slug,
        source_finish_id = excluded.source_finish_id,
        updated_at = now()`,
    );
    const finishMap = new Map(insertedFinishes.map(finish => [finish.code, finish.id]));

    const priceRows = rows.map(row => ({
      tenant_id: tenant.id,
      brand_id: brand.id,
      category_id: categoryMap.get(row.categorySlug),
      product_id: productMap.get(row.productSourceId),
      variation_id: variationMap.get(row.sourceVariationId),
      finish_id: finishMap.get(row.finishCode),
      price: row.price,
      currency: 'BRL',
      source_reference: row.sourceReference,
      source_price_id: row.sourcePriceId,
    }));
    await insertRows(
      client,
      'price_table',
      ['tenant_id', 'brand_id', 'category_id', 'product_id', 'variation_id', 'finish_id', 'price', 'currency', 'source_reference', 'source_price_id'],
      priceRows,
      `on conflict (tenant_id, brand_id, category_id, product_id, variation_id, finish_id) do update set
        price = excluded.price,
        currency = excluded.currency,
        source_reference = excluded.source_reference,
        source_price_id = excluded.source_price_id,
        updated_at = now()`,
    );

    const verification = await client.query(
      `
        select
          count(*)::int as prices,
          count(distinct category_id)::int as categories,
          count(distinct product_id)::int as products,
          count(distinct variation_id)::int as variations,
          count(distinct finish_id)::int as finishes,
          min(base_price)::numeric(12,2) as min_cost,
          max(base_price)::numeric(12,2) as max_cost,
          min(price)::numeric(12,2) as min_final_price,
          max(price)::numeric(12,2) as max_final_price,
          round(avg(price / nullif(base_price, 0)), 2)::numeric(12,2) as avg_multiplier,
          max(markup_percent)::numeric(7,2) as markup_percent
        from public.price_search_index
        where tenant_id = $1 and brand_id = $2
      `,
      [tenant.id, brand.id],
    );

    const samples = await client.query(
      `
        select product_name, variation_name, finish_name, base_price, price
        from public.price_search_index
        where tenant_id = $1
          and brand_id = $2
          and product_name ilike 'Cadeira Aita%'
        order by base_price
        limit 3
      `,
      [tenant.id, brand.id],
    );

    await client.query('commit');

    console.log(JSON.stringify({
      tenant: tenant.name,
      source: csvPath,
      invalidRows: parsed.invalidRows,
      priceMismatches: parsed.priceMismatches,
      parsed: {
        prices: rows.length,
        categories: categoryRows.length,
        products: productRows.length,
        variations: variationRows.length,
        finishes: finishRows.length,
      },
      imported: verification.rows[0],
      samples: samples.rows,
    }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
