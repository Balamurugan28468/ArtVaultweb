// Windows desktop Chrome smoke check of the actual dev route and generated GLB.
// Uses Chrome's debugging protocol; no browser AR/camera capability is mocked.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const directory = fileURLToPath(new URL('../ar-proof.local/', import.meta.url))
const selection = JSON.parse(await readFile(`${directory}/selection.json`, 'utf8'))
const origin = 'http://localhost:5173'
const route = `${origin}/artworks/${selection.artworkId}/ar`
await mkdir(`${directory}/browser`, { recursive: true })
// Keep Chromium's frequently-written profile outside the Vite watch tree.
const profile = await mkdtemp(path.join(os.tmpdir(), 'artvault-ar-chrome-'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket, spawnError, evaluate, call
chrome.on('error', (error) => { spawnError = error })
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, label, timeout = 45000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (spawnError) throw spawnError; if (await check()) return; await pause(250) }
  throw new Error(`Timed out: ${label}`)
}
const errors = [], requests = [], checks = [], widths = []
try {
  let port
  await until(async () => { try { port = Number((await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split('\n')[0]); return !!port } catch { return false } }, 'Chrome debugging port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let sequence = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data)
    if (data.id) {
      const item = pending.get(data.id)
      if (!item) return
      clearTimeout(item.timer); pending.delete(data.id)
      if (data.error) item.reject(new Error(JSON.stringify(data.error))); else item.resolve(data.result)
    } else if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text)
    else if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url)
  })
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitModel = () => until(() => evaluate('document.querySelector("model-viewer")?.loaded === true'), 'actual GLB load')
  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable')
  await call('Network.setCacheDisabled', { cacheDisabled: true })
  const browser = await call('Browser.getVersion')
  // Visiting a route without a selected proof must not load model-viewer.
  await call('Page.navigate', { url: `${origin}/artworks/${selection.artworkId}` })
  await until(() => evaluate(`document.body.innerText.includes('AR DEV FIXTURE')`), 'artwork detail')
  assert.equal(requests.some((url) => /model-viewer|model_viewer/.test(url)), false)
  checks.push('viewer dependency absent from artwork detail before AR navigation')
  const started = Date.now()
  await call('Page.navigate', { url: route }); await waitModel()
  const loadMs = Date.now() - started
  await until(() => evaluate(`document.body.innerText.includes('3D preview, not camera placement')`), 'unsupported desktop message')
  const model = await evaluate(`(()=>{const m=document.querySelector('model-viewer');return {loaded:m.loaded,dimensions:m.getDimensions(),canActivateAR:m.canActivateAR,scale:m.getAttribute('ar-scale'),placement:m.getAttribute('ar-placement'),modes:m.getAttribute('ar-modes'),text:document.body.innerText,images:[...document.querySelectorAll('section img')].filter(i=>i.alt.includes('fallback')).map(i=>({loaded:i.complete&&i.naturalWidth>0})),buttons:[...document.querySelectorAll('button')].map(b=>b.innerText)}})()`)
  assert.ok(Math.abs(model.dimensions.x - selection.widthMm / 1000) < 1e-7)
  assert.ok(Math.abs(model.dimensions.y - selection.heightMm / 1000) < 1e-7)
  assert.equal(model.dimensions.z, 0)
  assert.equal(model.scale, 'fixed'); assert.equal(model.placement, 'wall'); assert.equal(model.modes, 'webxr scene-viewer')
  assert.equal(model.canActivateAR, false)
  assert.ok(model.text.includes(`${selection.widthMm} × ${selection.heightMm} mm`))
  assert.ok(model.images.length > 0 && model.images.every((item) => item.loaded))
  assert.equal(model.buttons.some((text) => /View in your space|Resize|Scale|Start Camera|Sample Room/.test(text)), false)
  checks.push('actual model and image loaded; correct SI dimensions; honest desktop fallback; fixed-scale/wall configuration; no fake launch controls')
  for (const [width, height] of [[302,700],[320,700],[350,515],[390,844],[768,1024],[1024,768],[1440,900]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await pause(200)
    const layout = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,viewerWidth:document.querySelector('model-viewer').getBoundingClientRect().width})`)
    assert.ok(layout.scrollWidth <= width, `Horizontal page overflow at ${width}: ${layout.scrollWidth}`)
    assert.ok(layout.viewerWidth > 0 && layout.viewerWidth <= width)
    widths.push({ ...layout, height })
    const metrics = await call('Page.getLayoutMetrics')
    const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: metrics.cssContentSize.height, scale: 1 } })
    await writeFile(`${directory}/browser/${width}x${height}.png`, Buffer.from(screenshot.data, 'base64'))
    // ArtVault scrolls its application container, not the document. Inspect
    // the viewer after scrolling too, especially on the short 350x515 screen.
    await evaluate(`document.querySelector('model-viewer').scrollIntoView({block:'center',behavior:'instant'})`)
    await pause(200)
    const bounds = await evaluate(`(()=>{const r=document.querySelector('model-viewer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}})()`)
    assert.ok(bounds.top >= 0 && bounds.bottom <= height, `Viewer vertically inaccessible at ${width}`)
    assert.ok(bounds.left >= 0 && bounds.right <= width, `Viewer horizontally clipped at ${width}`)
    const scrolled = await call('Page.captureScreenshot', { format: 'png' })
    await writeFile(`${directory}/browser/${width}x${height}-viewer.png`, Buffer.from(scrolled.data, 'base64'))
  }
  // Exercise real route links and disposal, rather than replacing the document.
  await evaluate(`document.querySelector('a[href="/artworks/${selection.artworkId}"]').click()`)
  await until(() => evaluate(`location.pathname === '/artworks/${selection.artworkId}' && !document.querySelector('model-viewer')`), 'back link and viewer disposal')
  await call('Page.navigate', { url: route }); await waitModel()
  await evaluate(`document.querySelector('a[href^="/artists/"]').click()`)
  await until(() => evaluate(`location.pathname.startsWith('/artists/') && document.body.innerText.includes('AR Development Fixture (not a seller)') && !document.querySelector('model-viewer')`), 'artist link')
  checks.push('back-to-artwork and artist navigation; model element removed on route exit; re-entry loads')
  // Real request failure and retry, with the original bytes after unblocking.
  await call('Network.setBlockedURLs', { urls: ['*/__ar-proof/model/*'] })
  await call('Page.navigate', { url: route })
  await until(() => evaluate(`document.body.innerText.includes('Retry 3D preview')`), 'failed model loading state')
  assert.equal(await evaluate(`document.body.innerText.includes('View in your space')`), false)
  await call('Network.setBlockedURLs', { urls: [] })
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Retry 3D preview')).click()`)
  await waitModel()
  checks.push('real failed model request retains image, hides AR action, and retry recovers')
  assert.deepEqual(errors, [])
  const report = { verifiedAt: new Date().toISOString(), browser, route, loadMs, model: { dimensions: model.dimensions, canActivateAR: model.canActivateAR }, widths, checks, runtimeExceptions: errors, physicalDevice: 'pending; no XR session simulated' }
  await writeFile(`${directory}/browser-verification.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  await call('Browser.close')
} catch (error) {
  console.error(JSON.stringify({ error: error.message, text: await evaluate?.('document.body.innerText'), runtimeExceptions: errors }, null, 2))
  if (call) {
    const screenshot = await call('Page.captureScreenshot', { format: 'png' })
    await writeFile(`${directory}/browser/failure.png`, Buffer.from(screenshot.data, 'base64'))
  }
  process.exitCode = 1
} finally {
  socket?.close()
  chrome.kill()
}
