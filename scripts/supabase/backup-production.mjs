import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { operatorClient } from './operator-client.mjs'

const tables = [
  'profiles',
  'seller_profiles',
  'categories',
  'artworks',
  'artwork_images',
  'orders',
  'order_items',
  'payments',
  'shipments',
  'notifications',
  'auctions',
  'bids'
]

async function runBackup() {
  const supabase = operatorClient()
  const backupDir = resolve(process.cwd(), 'backups/database')
  mkdirSync(backupDir, { recursive: true })

  console.log('--- Starting ArtVault Full Production Database Backup ---')
  const summary = {}

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact' })
      if (error) {
        console.warn(`[SKIP] Table "${table}": ${error.message}`)
        summary[table] = { status: 'skipped', error: error.message }
      } else {
        const filePath = resolve(backupDir, `${table}.json`)
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
        console.log(`[OK] Table "${table}": ${data.length} records backed up to ${table}.json`)
        summary[table] = { status: 'ok', count: data.length }
      }
    } catch (err) {
      console.error(`[ERROR] Table "${table}":`, err.message)
      summary[table] = { status: 'error', error: err.message }
    }
  }

  // Backup Auth Users
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (error) {
      console.warn(`[WARN] Auth users: ${error.message}`)
      summary['auth_users'] = { status: 'error', error: error.message }
    } else {
      const filePath = resolve(backupDir, `auth_users.json`)
      writeFileSync(filePath, JSON.stringify(data.users, null, 2), 'utf8')
      console.log(`[OK] Auth Users: ${data.users.length} accounts backed up to auth_users.json`)
      summary['auth_users'] = { status: 'ok', count: data.users.length }
    }
  } catch (err) {
    console.error('[ERROR] Auth Users:', err.message)
    summary['auth_users'] = { status: 'error', error: err.message }
  }

  const manifestPath = resolve(backupDir, 'backup_manifest.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({ timestamp: new Date().toISOString(), summary }, null, 2),
    'utf8'
  )
  console.log('--- Backup Completed Successfully. Manifest written to backup_manifest.json ---')
}

runBackup().catch((err) => {
  console.error('Fatal backup error:', err)
  process.exit(1)
})
