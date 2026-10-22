// Headless Chrome + CDP probe: node shot.mjs <url> <out.png> [waitReadySeconds]
// Reports WebGPU availability, app readiness, FPS samples, console error count, and saves a screenshot.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, waitS = '90'] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const port = 9333;
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist',
  '--disable-gpu-vsync', '--disable-frame-rate-limit', '--window-size=1280,720', '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); let errors = 0; const firstErrors = []; const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled') {
    const text = d.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (d.params.type === 'error') { errors++; if (firstErrors.length < 3) firstErrors.push(text.slice(0, 200)); }
    else if (/\[init\]/.test(text)) logs.push(text);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const gpu = await evalJs(`(async()=>{const a=navigator.gpu&&await navigator.gpu.requestAdapter();return {gpu:!!navigator.gpu, adapter:!!a, vendor:a?.info?.vendor, arch:a?.info?.architecture}})()`);
await send('Page.navigate', { url });
let ready = false; const t0 = Date.now();
while (!ready && Date.now() - t0 < Number(waitS) * 1000) { await sleep(1000); ready = !!(await evalJs('!!(window.__NYC_APP && window.__NYC_APP.ready)')); }
const readyS = ((Date.now() - t0) / 1000).toFixed(1);
const fps = [];
for (let i = 0; i < 5; i++) { await sleep(1000); fps.push(await evalJs(`document.getElementById('hud-fps')?.textContent`)); }
const heap = await evalJs('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : null');
const rev = await evalJs('window.NYC?.THREE?.REVISION'); const backend = await evalJs(`(async()=>{const r=window.__NYC_APP?.renderer; const a=navigator.gpu && await navigator.gpu.requestAdapter(); return {webgpuBackend: !!r?.backend?.isWebGPUBackend, ctor: r?.backend?.constructor?.name, pageGpu: !!navigator.gpu, adapter: a?.info?.vendor+'/'+a?.info?.architecture}})()`);
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ gpu, backend, rev, ready, readyS, fps, heapMB: heap, consoleErrors: errors, firstErrors, init: logs }, null, 1));
ws.close(); chrome.kill(); process.exit(0);
