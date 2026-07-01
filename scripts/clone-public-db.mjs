import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const args = new Set(process.argv.slice(2));
const sourceUrl = process.env.SOURCE_DB_URL;
const targetUrl = process.env.TARGET_DB_URL;
const batchSize = Number(process.env.BATCH_SIZE || 500);

if (!sourceUrl || !targetUrl) {
  console.error('SOURCE_DB_URL and TARGET_DB_URL are required.');
  process.exit(1);
}

const source = new Client({
  connectionString: sourceUrl,
  ssl: { rejectUnauthorized: false },
});

const target = new Client({
  connectionString: targetUrl,
  ssl: { rejectUnauthorized: false },
});

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const publicName = (table) => `public.${q(table)}`;

async function listMigrationFiles() {
  const dir = path.resolve('supabase', 'migrations');
  const entries = await fs.readdir(dir);
  const from = process.env.MIGRATION_FROM || '';
  const skip = new Set((process.env.MIGRATION_SKIP || '').split(',').map((item) => item.trim()).filter(Boolean));

  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .filter((entry) => !from || entry >= from)
    .filter((entry) => !skip.has(entry))
    .sort()
    .map((entry) => path.join(dir, entry));
}

async function applyMigrations() {
  const files = await listMigrationFiles();
  for (const file of files) {
    const sql = await fs.readFile(file, 'utf8');
    process.stdout.write(`Applying ${path.basename(file)}... `);
    await target.query(sql);
    console.log('ok');
  }
}

async function getTables(client) {
  const { rows } = await client.query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
    order by c.relname
  `);
  return rows.map((row) => row.table_name);
}

async function getColumns(client, table) {
  const { rows } = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = $1
      and is_generated = 'NEVER'
    order by ordinal_position
  `, [table]);
  return rows.map((row) => row.column_name);
}

async function getPublicFkEdges(client, tables) {
  const { rows } = await client.query(`
    select
      child.relname as child_table,
      parent.relname as parent_table
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where con.contype = 'f'
      and child_ns.nspname = 'public'
      and parent_ns.nspname = 'public'
  `);
  const tableSet = new Set(tables);
  return rows.filter((row) => tableSet.has(row.child_table) && tableSet.has(row.parent_table));
}

function topoSort(tables, edges) {
  const remaining = new Set(tables);
  const deps = new Map(tables.map((table) => [table, new Set()]));
  const children = new Map(tables.map((table) => [table, new Set()]));

  for (const edge of edges) {
    if (edge.child_table === edge.parent_table) continue;
    deps.get(edge.child_table)?.add(edge.parent_table);
    children.get(edge.parent_table)?.add(edge.child_table);
  }

  const ready = [...remaining].filter((table) => deps.get(table)?.size === 0).sort();
  const ordered = [];

  while (ready.length) {
    const table = ready.shift();
    if (!remaining.has(table)) continue;
    remaining.delete(table);
    ordered.push(table);

    for (const child of children.get(table) || []) {
      const childDeps = deps.get(child);
      childDeps?.delete(table);
      if (childDeps?.size === 0) ready.push(child);
    }
    ready.sort();
  }

  return [...ordered, ...[...remaining].sort()];
}

async function rowCount(client, table) {
  const { rows } = await client.query(`select count(*)::bigint as count from ${publicName(table)}`);
  return Number(rows[0].count);
}

async function truncateTargetTables(tables) {
  if (!tables.length) return;
  console.log(`Truncating ${tables.length} target public tables...`);
  await target.query(`truncate table ${tables.map(publicName).join(', ')} restart identity cascade`);
}

async function copyTable(table) {
  const sourceColumns = await getColumns(source, table);
  const targetColumns = new Set(await getColumns(target, table));
  const columns = sourceColumns.filter((column) => targetColumns.has(column));
  if (!columns.length) {
    console.log(`${table}: skipped, no matching columns`);
    return;
  }

  const total = await rowCount(source, table);
  if (total === 0) {
    console.log(`${table}: 0 rows`);
    return;
  }

  const columnSql = columns.map(q).join(', ');
  let copied = 0;

  while (copied < total) {
    const { rows } = await source.query(
      `select ${columnSql} from ${publicName(table)} offset $1 limit $2`,
      [copied, batchSize],
    );

    if (!rows.length) break;

    const values = [];
    const placeholders = rows.map((row, rowIndex) => {
      const rowPlaceholders = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    });

    await target.query(
      `insert into ${publicName(table)} (${columnSql}) values ${placeholders.join(', ')}`,
      values,
    );

    copied += rows.length;
    process.stdout.write(`\r${table}: ${copied}/${total}`);
  }

  process.stdout.write('\n');
}

async function main() {
  await source.connect();
  await target.connect();

  try {
    if (args.has('--apply-migrations')) {
      await applyMigrations();
    }

    const sourceTables = await getTables(source);
    const targetTables = await getTables(target);
    const sourceSet = new Set(sourceTables);
    const copyTables = targetTables.filter((table) => sourceSet.has(table));
    const edges = await getPublicFkEdges(target, copyTables);
    const orderedTables = topoSort(copyTables, edges);

    console.log(`Source public tables: ${sourceTables.length}`);
    console.log(`Target public tables: ${targetTables.length}`);
    console.log(`Copyable public tables: ${orderedTables.length}`);

    await target.query('begin');
    await target.query('set local session_replication_role = replica');
    await truncateTargetTables(orderedTables);

    for (const table of orderedTables) {
      await copyTable(table);
    }

    await target.query('commit');
    console.log('Public schema data copy complete.');
  } catch (error) {
    try {
      await target.query('rollback');
    } catch {
      // ignore rollback failures
    }
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
