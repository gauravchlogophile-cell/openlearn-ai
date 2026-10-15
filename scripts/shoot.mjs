#!/usr/bin/env node
/**
 * Screenshots of a page under different reader settings, using headless Edge or
 * Chrome over the DevTools protocol. No dependencies: Node's own WebSocket.
 *
 * Exists because "does it work in dark mode, high contrast, with the readable
 * font and with reduced motion" is a question that needs to be answered by
 * looking, and the combinations are too many to click through by hand.
 *
 *   node scripts/shoot.mjs <url> <out-dir> [--open] [--view=you] [--w=1280 --h=860]
 *
 * It sets each combination on <html> the way the reader panel does (the same
 * data-* attributes), emulates the OS colour scheme and reduced-motion
 * preference, and writes one PNG per combination.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [url, out] = process.argv.slice(2);
const flag = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] ?? d;
const W = +flag('w', 1280), H = +flag('h', 860);
const open = process.argv.includes('--open');
const view = flag('view', '');
mkdirSync(out, { recursive: true });

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const exe = candidates.find((c) => existsSync(c));
if (!exe) { console.error('No Edge or Chrome found. Set BROWSER=path.'); process.exit(1); }

const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(exe, [`--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=${join(out, '.profile')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); }
}
if (!target) { proc.kill(); console.error('Could not reach the browser.'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });

const combos = [
  { name: 'light', scheme: 'light', attrs: {} },
  { name: 'dark', scheme: 'dark', attrs: {} },
  { name: 'light-high-contrast', scheme: 'light', attrs: { 'data-contrast': 'high' } },
  { name: 'dark-high-contrast', scheme: 'dark', attrs: { 'data-theme': 'dark', 'data-contrast': 'high' } },
  { name: 'light-dyslexia-large', scheme: 'light', attrs: { 'data-font': 'readable', 'data-textsize': 'xlarge', 'data-leading': 'loose' } },
  { name: 'dark-reduced-motion', scheme: 'dark', attrs: { 'data-motion': 'reduce' }, reduce: true },
];

for (const c of combos) {
  await send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: c.scheme },
    { name: 'prefers-reduced-motion', value: c.reduce ? 'reduce' : 'no-preference' },
  ] });
  await send('Page.navigate', { url });
  await sleep(2500);
  await ev(`(() => { const r = document.documentElement; ${Object.entries(c.attrs).map(([k, v]) => `r.setAttribute(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} return true; })()`);
  if (open) {
    await ev(`document.querySelector('.skyb-fab')?.click()`);
    await sleep(500);
    if (view) { await ev(`[...document.querySelectorAll('.skyb-row')].find((b) => b.textContent.includes(${JSON.stringify(view)}))?.click()`); await sleep(400); }
  }
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, `${c.name}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', c.name);
}
ws.close(); proc.kill();
