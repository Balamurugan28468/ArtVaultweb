import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import ts from 'typescript'

export const pendingMigrations = [
  '20261020153833_auction_e2e_lifecycle.sql',
  '20261023142417_weekly_artwork_selection.sql',
  '20261023154024_assistant_recommendations.sql',
]

// Runs only on the caller's disposable PGlite instance. No environment, URL or
// network connections. This proves transactional DDL rollback, not an automatic
// downgrade of a committed migration or a native pg_cron deployment.
export async function verifyMigrationRollback(db, sql) {
  const catalog = async () => (await db.query(`select
    (select count(*)::int from pg_class) as relations,
    (select count(*)::int from pg_proc) as functions,
    (select count(*)::int from pg_policy) as policies,
    (select count(*)::int from pg_trigger) as triggers,
    (select count(*)::int from pg_constraint) as constraints,
    (select coalesce(jsonb_agg(to_jsonb(j) order by jobname),'[]') from cron.job j) as jobs,
    (select coalesce(jsonb_agg(to_jsonb(p) order by tablename),'[]') from pg_publication_tables p) as publication
  `)).rows
  const before = await catalog()
  const body = sql.replace(/^begin;\s*$/mi, '').replace(/^commit;\s*$/mi, '')
  await db.exec('begin')
  try { await db.exec(body) } finally { await db.exec('rollback') }
  assert.deepEqual(await catalog(), before, 'Rolled-back migration must restore schema, jobs and publication')
}

async function sourceCalls(directory) {
  const calls = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) calls.push(...await sourceCalls(file))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const source = ts.createSourceFile(file.pathname, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true)
      function visit(node) {
        if (ts.isCallExpression(node) && (
          (ts.isIdentifier(node.expression) && node.expression.text === 'rpc') ||
          (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'rpc')
        ) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const args = node.arguments[1]
          const names = args && ts.isObjectLiteralExpression(args)
            ? args.properties.map(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null) : []
          assert.ok(names.every(Boolean), `RPC arguments must be explicitly named: ${file.pathname}`)
          calls.push({ name: node.arguments[0].text, args: names, file: file.pathname })
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  return calls
}

export function registerModule09Tests({ db, test, rollbackEvidence }) {
  for (const file of pendingMigrations) test(`pending migration applies, rolls back and reapplies locally: ${file}`, () => {
    assert.ok(rollbackEvidence.has(file))
  })
  test('all static frontend RPC calls match installed PostgreSQL parameter names and defaults', async () => {
    const calls = await sourceCalls(new URL('../../src/', import.meta.url))
    assert.ok(calls.length >= 30, 'Keep the repository-wide contract scan meaningful')
    const { rows } = await db.query(`select p.proname as name, p.proargnames[1:p.pronargs] as args,
      p.pronargs-p.pronargdefaults as required from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)
    for (const call of calls) {
      assert.ok(rows.some(row => row.name === call.name &&
        call.args.every(key => (row.args ?? []).includes(key)) &&
        (row.args ?? []).slice(0, row.required).every(key => call.args.includes(key))),
      `RPC signature mismatch: ${call.name}(${call.args.join(',')}) in ${call.file}`)
    }
  })
}
