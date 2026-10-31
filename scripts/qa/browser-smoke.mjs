// Actual routes/providers/components in desktop Chrome, with an isolated,
// read-only client fixture. No hosted environment loaded and external requests
// blocked before navigation. This is UI integration, NOT hosted/RLS acceptance.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = fileURLToPath(new URL('./supabase-fixture.mjs', import.meta.url))
const server = await createServer({ root, configFile: false, envDir: false,
  plugins: [{ name: 'qa-client-fixture', enforce: 'pre', resolveId(source, importer) {
    if (source === '@/lib/supabase/client' || /\/src\/lib\/supabase\/client(?:\.ts)?$/.test(source.replaceAll('\\', '/')) || (importer && source.startsWith('.') && /\/src\/lib\/supabase\/client(?:\.ts)?$/.test(path.resolve(path.dirname(importer), source).replaceAll('\\', '/')))) return fixture
  } }, react(), tailwind()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://fixture.invalid'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_qa_fixture_only'), 'import.meta.env.VITE_ENABLE_RAZORPAY_TEST': '"false"', 'import.meta.env.VITE_ENABLE_DEVELOPMENT_AR_PROOF': '"false"' },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
})
await server.listen()
const origin = server.resolvedUrls.local[0].replace(/\/$/, '')
const profile = await mkdtemp(path.join(os.tmpdir(), 'artvault-qa-chrome-'))
const executable = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(file => existsSync(file))
if (!executable) { await server.close(); throw new Error('Chrome/Edge is required for the local browser smoke check') }
const chrome = spawn(executable, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket, spawnError, call, evaluate
chrome.on('error', error => { spawnError = error })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  const end = Date.now() + 45000
  while (Date.now() < end) { if (spawnError) throw spawnError; if (await check()) return; await pause(150) }
  throw new Error(`Timed out: ${label}`)
}
const checks = [], exceptions = [], blocked = [], layouts = []
try {
  let port
  await until(async () => { try { port = Number((await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split('\n')[0]); return !!port } catch { return false } }, 'Chrome launch')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.id) {
      const p = pending.get(data.id); if (!p) return
      clearTimeout(p.timer); pending.delete(data.id); if (data.error) p.reject(new Error(data.error.message)); else p.resolve(data.result)
    } else if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text)
    else if (data.method === 'Fetch.requestPaused') {
      const { requestId, request } = data.params
      // Navigation may cancel an intercepted request before CDP acknowledges
      // it. That exact cancellation is harmless; other harness errors fail QA.
      const settle = promise => { void promise.catch(error => { if (!error.message.includes('Invalid InterceptionId')) exceptions.push(error.message) }) }
      if (request.url.startsWith(origin + '/') || request.url.startsWith('data:')) settle(call('Fetch.continueRequest', { requestId }))
      else { blocked.push(new URL(request.url).origin); settle(call('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })) }
    }
  })
  evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result.value
  }
  await call('Runtime.enable'); await call('Page.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  const browser = await call('Browser.getVersion')
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)})sessionStorage.setItem('qa-role','guest');` })
  async function visit(route, text) {
    await call('Page.navigate', { url: origin + route })
    await until(() => evaluate(`document.body?.innerText.includes(${JSON.stringify(text)}) ?? false`), route + ' → ' + text)
    await pause(200)
    assert.deepEqual(await evaluate('window.__artvaultQa?.deniedWrites ?? []'), [], 'Browser smoke must not mutate backend fixtures')
    assert.deepEqual(await evaluate('window.__artvaultQa?.unsupported ?? []'), [], 'Every exercised data boundary must be explicitly modeled')
    checks.push({ route, expected: text })
  }
  const art = '/artworks/00000000-0000-4000-8000-000000000011'
  await visit('/explore', 'QA Mountain Painting')
  await visit(art, 'QA Mountain Painting')
  assert.equal(await evaluate(`document.querySelector('img')?.complete`), true)
  await visit('/artists/00000000-0000-4000-8000-000000000003', 'QA Artist')
  await visit('/recommendations', 'QA Mountain Painting')
  await visit('/auctions', 'Auctions')
  await visit(art + '/ar', 'AR')
  await visit('/checkout', 'Sign in')
  assert.equal(await evaluate('location.pathname'), '/sign-in')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('input')].filter(i=>i.type==='email'||i.type==='password').map(i=>i.value)`), ['', ''])
  await visit('/sign-up', 'Send OTP')
  assert.equal(await evaluate(`document.querySelectorAll('input[inputmode="numeric"]:disabled').length`), 6)
  await visit('/ai', 'Local FAQ guidance')
  await evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'How does checkout work?');t.dispatchEvent(new Event('input',{bubbles:true}));})()`)
  await until(() => evaluate(`![...document.querySelectorAll('button')].find(b=>b.textContent==='Send').disabled`), 'FAQ send enabled')
  await evaluate(`document.querySelector('textarea').closest('form').requestSubmit()`)
  await until(() => evaluate(`document.querySelector('[role="log"]').innerText.includes('complete saved shipping address')`), 'FAQ answer')
  checks.push({ action: 'guest FAQ answers without account access' })
  for (const [role, route, text] of [['CUSTOMER','/cart','QA Mountain Painting'],['CUSTOMER','/checkout','Create unpaid order'],['CUSTOMER','/orders','QA Mountain Painting'],['CUSTOMER','/orders/00000000-0000-4000-8000-000000000020','QA Mountain Painting'],['CUSTOMER','/admin','Manage your ArtVault profile.'],['SELLER','/seller-studio','Incoming paid orders'],['SELLER','/admin','Manage your ArtVault profile.'],['ADMIN','/admin','Admin Control Center'],['SUPER_ADMIN','/admin','Admin Control Center']]) {
    // Replace init script rather than store any real auth credentials.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)})sessionStorage.setItem('qa-role',${JSON.stringify(role)});` })
    await visit(route, text)
    if (route === '/checkout') {
      await until(() => evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create unpaid order'))?.disabled === false`), 'saved address enables checkout')
      // Do not click the order action. Inspect only the existing address modal.
      await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: false })
      await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Add new address').click()`)
      await until(() => evaluate(`!!document.querySelector('[role="dialog"]')`), 'address dialog')
      const button = await evaluate(`(()=>{const b=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Add Address');const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:!!r.width,form:b.getAttribute('form')};})()`)
      assert.ok(button.visible && button.top >= 0 && button.bottom <= 700 && button.left >= 0 && button.right <= 320 && button.form, 'Address save must be accessible and linked to its form')
      await evaluate(`document.querySelector('[role="dialog"] button[aria-label="Close"]').click()`)
      checks.push({ action: 'saved address enables unpaid checkout; address save action visible at 320px; no order/payment action invoked' })
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    }
    if (route === '/admin' && ['CUSTOMER','SELLER'].includes(role)) assert.equal(await evaluate('location.pathname'), '/account')
  }
  await until(() => evaluate(`[...document.querySelectorAll('[role="tab"]')].some(t=>t.textContent.trim()==='Auctions')`), 'admin auctions tab rendered')
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(t=>t.textContent.trim()==='Auctions').click()`)
  await until(() => evaluate(`document.body.innerText.includes('Review intelligent weekly selection')`), 'auction admin tab')
  await evaluate(`[...document.querySelectorAll('button')].find(t=>t.textContent.includes('Review intelligent weekly selection')).click()`)
  await until(() => evaluate(`document.body.innerText.includes('Weekly artwork selection')`), 'Module 05/06 admin integration')
  await until(() => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Generate selection')`), 'weekly selection RPC response rendered')
  assert.deepEqual(await evaluate('window.__artvaultQa.unsupported'), [])
  checks.push({ action: 'admin auction and weekly-selection interface loads existing RPC fixture contracts' })
  for (const width of [320, 390, 768, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false })
    await visit('/explore', 'QA Mountain Painting')
    const layout = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
    assert.ok(layout.scrollWidth <= width, `Explore overflows at ${width}`); layouts.push(layout)
  }
  assert.deepEqual(exceptions, [])
  assert.deepEqual(await evaluate('window.__artvaultQa.deniedWrites'), [])
  assert.deepEqual(await evaluate('window.__artvaultQa.unsupported'), [])
  const report = { checkedAt: new Date().toISOString(), browser: browser.product, checks, layouts, runtimeExceptions: exceptions, blockedExternalOrigins: [...new Set(blocked)], hostedRequestsAllowed: 0, fixtureOnly: true }
  await writeFile(path.join(root, 'module09-browser-results.log'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  const inspect = async expression => { try { return await evaluate?.(expression) } catch { return null } }
  console.error(JSON.stringify({ error: error.message, text: await inspect('document.body?.innerText'), fixture: await inspect('window.__artvaultQa'), exceptions }, null, 2))
  process.exitCode = 1
} finally {
  if (call) await call('Browser.close').catch(() => {})
  socket?.close(); chrome.kill(); await server.close()
}
