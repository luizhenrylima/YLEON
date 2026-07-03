import crypto from 'node:crypto';
import pg from 'pg';
import xlsx from 'xlsx';

const { Client } = pg;
const DEFAULT_XLSX_PATH = 'C:/Users/nycol/Downloads/essenza_importacao_ajustada_mesas.xlsx';
const DEFAULT_TENANT_SLUG = 'acervo-1055';
const BRAND_NAME = 'Essenza';
const BRAND_SLUG = 'essenza';
const MARKUP_PERCENT = 214.0;
const SHEET_NAME = 'Importar_Plataforma';
const PLACEHOLDER_FINISH = 'Sem acabamento especificado';

const workbookPath = process.env.ESSENZA_XLSX_PATH || DEFAULT_XLSX_PATH;
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

function uniqueBy(items, getKey) {
  const map = new Map();
  for (const item of items) map.set(getKey(item), item);
  return Array.from(map.values());
}

function optionParts(row) {
  return [
    cleanText(row.dimensoes) ? `Dimensao ${cleanText(row.dimensoes)}` : null,
    cleanText(row.medida_base) ? `Base ${cleanText(row.medida_base)}` : null,
    cleanText(row.variacao_preco),
  ].filter(Boolean);
}

function variationSourceId(row) {
  return [
    cleanText(row.produto_chave),
    cleanText(row.referencia),
    cleanText(row.dimensoes),
    cleanText(row.medida_base),
    cleanText(row.variacao_preco) || 'Padrao',
  ].join('|');
}

function variationCode(row) {
  return [
    cleanText(row.referencia),
    cleanText(row.dimensoes),
    cleanText(row.medida_base) ? `Base ${cleanText(row.medida_base)}` : null,
    cleanText(row.variacao_preco),
  ].filter(Boolean).join(' | ') || stableHash(variationSourceId(row));
}

function variationName(row) {
  return [cleanText(row.nome_produto), ...optionParts(row)].filter(Boolean).join(' - ');
}

function parseWorkbook(path) {
  const workbook = xlsx.readFile(path);
  const worksheet = workbook.Sheets[SHEET_NAME];
  if (!worksheet) throw new Error(`Sheet not found: ${SHEET_NAME}`);

  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
  const rows = [];
  let invalidRows = 0;

  for (const row of rawRows) {
    const active = cleanText(row.ativo).toLowerCase();
    const price = numberFromCell(row.preco_custo);
    const productSourceId = cleanText(row.produto_chave);
    const sku = cleanText(row.sku);
    const productName = cleanText(row.nome_produto);
    const categoryName = cleanText(row.categoria);
    const finishName = cleanText(row.configuracao) || PLACEHOLDER_FINISH;

    if (active === 'nao') continue;
    if (!sku || !price || price <= 0 || !productSourceId || !productName || !categoryName) {
      invalidRows += 1;
      continue;
    }

    const sourceVariationId = variationSourceId(row);
    const finishCode = slugify(finishName);

    rows.push({
      sku,
      brandName: cleanText(row.marca) || BRAND_NAME,
      categoryName,
      categorySlug: slugify(categoryName),
      productSourceId,
      productName,
      productSlug: `${slugify(productSourceId)}-${stableHash(productSourceId)}`,
      referenceCode: cleanText(row.referencia),
      sourceVariationId,
      variationCode: variationCode(row),
      variationName: variationName(row),
      dimensions: cleanText(row.dimensoes) || null,
      description: cleanText(row.opcao_nome) || null,
      module: cleanText(row.medida_base) || null,
      finishName,
      finishCode,
      finishSlug: finishCode,
      price,
      sourceReference: cleanText(row.origem) || null,
    });
  }

  const priceKeyCounts = new Map();
  for (const row of rows) {
    const key = `${row.productSourceId}|${row.sourceVariationId}|${row.finishCode}`;
    priceKeyCounts.set(key, (priceKeyCounts.get(key) || 0) + 1);
  }

  const duplicateCounters = new Map();
  for (const row of rows) {
    const key = `${row.productSourceId}|${row.sourceVariationId}|${row.finishCode}`;
    if ((priceKeyCounts.get(key) || 0) <= 1) continue;
    const current = (duplicateCounters.get(key) || 0) + 1;
    duplicateCounters.set(key, current);
    row.sourceVariationId = `${row.sourceVariationId}|${row.sku}`;
    row.variationCode = `${row.variationCode} | ${row.finishName} | Opcao ${current}`;
    row.variationName = `${row.variationName} - Opcao ${current}`;
  }

  return { rows, invalidRows };
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
  const parsed = parseWorkbook(workbookPath);
  const rows = parsed.rows.filter(row => slugify(row.brandName) === BRAND_SLUG);
  if (!rows.length) throw new Error('No Essenza rows found in workbook.');

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
      [tenant.id, BRAND_NAME, BRAND_SLUG, BRAND_NAME, MARKUP_PERCENT],
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
      finish_type: null,
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
      source_price_id: row.sku,
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
          and product_name ilike 'Mesa Agra%'
        order by base_price
        limit 3
      `,
      [tenant.id, brand.id],
    );

    await client.query('commit');

    console.log(JSON.stringify({
      tenant: tenant.name,
      source: workbookPath,
      invalidRows: parsed.invalidRows,
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
