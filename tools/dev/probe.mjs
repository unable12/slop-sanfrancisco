// tools/dev/probe.mjs — headless Chrome (real WebGPU on macOS/Metal) probe for the app, over the DevTools protocol.
// No dependencies (Node's global fetch & WebSocket). Exits non-zero when the page logs console errors or never gets ready.
//
//   node tools/dev/probe.mjs <url> <out.png> [waitSeconds]           one page: backend, readiness, fps, heap, errors, screenshot
//   node tools/dev/probe.mjs --shots tools/dev/shots.json [--base URL] [--out shots] [--only a,b]
//                                                                    every named shot (query string per name) -> <out>/<name>.png
//   node tools/dev/probe.mjs --bench street|car|heli|hill|russian-hill-view [--base URL] [--query extra=1]
//                                                                    runs ?bench=<name> and prints the [bench] result
//   node tools/dev/probe.mjs <url> <out.png> [waitSeconds] --eval '<js expression>'
//                                                                    also prints the expression's value once ready
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const BASE = opt('base', 'http://127.0.0.1:8080/index.html');
const WAIT_S = Number(opt('wait', 150));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(opt('port', 9333));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu', '--enable-gpu', `--use-angle=${opt('angle', 'metal')}`, '--ignore-gpu-blocklist',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--window-size=1280,720',
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });
const quit = (code) => { try { chrome.kill(); } catch {} process.exit(code); };

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('chrome did not start'); quit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
let errors = [];
let logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled') {
    const text = d.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (d.params.type === 'error') errors.push(text.slice(0, 300));
    else if (/^\[(init|bench|details|buildings|paint)\]/.test(text)) logs.push(text);
  }
  if (d.method === 'Runtime.exceptionThrown') errors.push(`exception: ${(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 300)}`);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  const timer = setTimeout(() => { pending.delete(i); reject(new Error(`DevTools timeout: ${method}`)); }, 30000);
  pending.set(i, result => { clearTimeout(timer); resolve(result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
process.on('uncaughtException', error => { console.error(error.message); quit(2); });
process.on('unhandledRejection', error => { console.error(error.message); quit(2); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

// Loads a page and waits for __NYC_APP.ready; returns timing and health
async function load(url) {
  errors = [];
  logs = [];
  await send('Page.navigate', { url });
  await send('Page.bringToFront');
  const t0 = Date.now();
  let ready = false;
  while (!ready && Date.now() - t0 < WAIT_S * 1000) {
    await sleep(500);
    ready = !!(await evalJs('!!(window.__NYC_APP && window.__NYC_APP.ready)'));
    if (errors.some((e) => e.startsWith('exception'))) break;
  }
  return { ready, readyS: +((Date.now() - t0) / 1000).toFixed(1) };
}
async function sample() {
  const fps = [];
  for (let i = 0; i < 5; i++) { await sleep(1000); fps.push(Number(await evalJs(`document.getElementById('hud-fps')?.textContent`))); }
  const heapMB = await evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : null');
  const stats = await evalJs('window.__NYC_APP?.debug?.stats?.()');
  const backend = await evalJs('window.__NYC_APP?.renderer?.backend?.isWebGPUBackend ? "webgpu" : "other"');
  return { fps, heapMB, stats, backend };
}
// JS heap still in use after a forced garbage collection (heapMB, read without one, also counts garbage not yet
// collected and, in --shots mode, what the previous shots' pages left behind)
async function liveHeapMB() {
  await send('HeapProfiler.collectGarbage');
  return evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : null');
}
async function screenshot(out) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
}
const withQuery = (q) => BASE + (BASE.includes('?') ? '&' : '?') + q;

let failed = false;
if (argv.includes('--shots')) {
  const shots = JSON.parse(readFileSync(opt('shots'), 'utf8'));
  const outDir = opt('out', 'shots');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  mkdirSync(outDir, { recursive: true });
  for (const [name, query] of Object.entries(shots)) {
    if (name.startsWith('_') || (only && !only.has(name))) continue;
    const r = await load(withQuery(query));
    await sleep(2500); // let streaming, shadows & traffic settle
    const s = await sample();
    await screenshot(join(outDir, `${name}.png`));
    const row = { name, ...r, fps: s.fps, heapMB: s.heapMB, heapLiveMB: await liveHeapMB(), backend: s.backend, errors: errors.length, firstError: errors[0] };
    console.log(JSON.stringify(row));
    if (!r.ready || errors.length) failed = true;
  }
} else if (argv.includes('--bench')) {
  const name = opt('bench');
  const extra = opt('query', '');
  const r = await load(withQuery(`bench=${name}&hud=0${extra ? `&${extra}` : ''}`));
  let bench = null;
  for (let i = 0; i < 40 && !bench && r.ready; i++) { await sleep(1000); bench = await evalJs('window.__NYC_APP.bench || null'); }
  const heapMB = await evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : null');
  const heapLiveMB = await liveHeapMB();
  console.log(JSON.stringify({ ...r, bench, heapMB, heapLiveMB, errors: errors.length, firstError: errors[0], init: logs.find((l) => l.startsWith('[init]')) }));
  if (!bench || errors.length) failed = true;
} else {
  const [url, out] = argv;
  const r = await load(url);
  const s = await sample();
  if (out && out !== '-') await screenshot(out);
  const evaluated = opt('eval') ? await evalJs(opt('eval')) : undefined;
  console.log(JSON.stringify({ ...r, ...s, consoleErrors: errors.length, firstErrors: errors.slice(0, 3), init: logs, evaluated }, null, 1));
  if (!r.ready || errors.length) failed = true;
}
ws.close();
quit(failed ? 1 : 0);
