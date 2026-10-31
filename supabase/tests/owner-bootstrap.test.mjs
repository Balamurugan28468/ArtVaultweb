import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const sql = await readFile(new URL('../operators/bootstrap-owner-roles.sql', import.meta.url), 'utf8')
const seller = '00000000-0000-4000-8000-000000000001'
const admin = '00000000-0000-4000-8000-000000000002'
async function fixture({ includeAdmin = true, sellerRole = 'CUSTOMER' } = {}) {
  const db = new PGlite()
  await db.exec(`
    create schema auth; create schema private;
    create type public.app_role as enum ('CUSTOMER','SELLER','ADMIN','SUPER_ADMIN');
    create table auth.users(id uuid primary key, email text unique);
    create table private.user_roles(id uuid primary key references auth.users, role public.app_role,
      assigned_by uuid references auth.users);
    create table public.admin_logs(id uuid primary key default gen_random_uuid(),
      actor_id uuid references auth.users, action text, target_type text, target_id uuid, reason text);
  `)
  await db.query('insert into auth.users values ($1,$2)', [seller, 'bm440946@gmail.com'])
  await db.query('insert into private.user_roles(id,role) values ($1,$2)', [seller, sellerRole])
  if (includeAdmin) {
    await db.query('insert into auth.users values ($1,$2)', [admin, 'bm03102004@gmail.com'])
    await db.query("insert into private.user_roles(id,role) values ($1,'CUSTOMER')", [admin])
  }
  return db
}

test('separate approved identities receive distinct roles; repeated execution is idempotent', async () => {
  const db = await fixture()
  try {
    await db.exec(sql)
    await db.exec(sql)
    const { rows } = await db.query('select id,role from private.user_roles order by id')
    assert.deepEqual(rows, [{ id: seller, role: 'SELLER' }, { id: admin, role: 'SUPER_ADMIN' }])
    assert.equal((await db.query('select count(*)::int as n from public.admin_logs')).rows[0].n, 2)
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 2)
  } finally { await db.close() }
})

test('missing administrator fails before changing seller role', async () => {
  const db = await fixture({ includeAdmin: false })
  try {
    await assert.rejects(db.exec(sql))
    await db.exec('rollback')
    assert.equal((await db.query('select role from private.user_roles')).rows[0].role, 'CUSTOMER')
    assert.equal((await db.query('select count(*)::int as n from public.admin_logs')).rows[0].n, 0)
  } finally { await db.close() }
})

test('unexpected existing privilege fails closed without changing either account', async () => {
  const db = await fixture({ sellerRole: 'ADMIN' })
  try {
    await assert.rejects(db.exec(sql), /Unexpected seller role/)
    await db.exec('rollback')
    assert.deepEqual((await db.query('select role from private.user_roles order by id')).rows,
      [{ role: 'ADMIN' }, { role: 'CUSTOMER' }])
    assert.equal((await db.query('select count(*)::int as n from public.admin_logs')).rows[0].n, 0)
  } finally { await db.close() }
})
