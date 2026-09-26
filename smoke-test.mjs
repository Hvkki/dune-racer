// Headless smoke test for Dune Racer.
// Serves the folder over HTTP, loads it in headless Chromium, starts the race,
// simulates driving with nitro, and asserts the car moves and no console errors occur.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = 8177;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  console.log(`server on http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const errors = [];
  const logs = [];
  page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('reqfailed: ' + r.url() + ' ' + (r.failure()?.errorText || '')));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // wait for the game object + scene to be constructed
  await page.waitForFunction(() => window.__DUNE__ && window.__DUNE__.scene, { timeout: 20000 });

  // loading overlay should be hidden, menu visible
  const menuVisible = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
  const loadingHidden = await page.evaluate(() => document.getElementById('loading').classList.contains('hidden'));

  // capture starting car position
  const startPos = await page.evaluate(() => {
    const c = window.__DUNE__.car;
    return { x: c.pos.x, y: c.pos.y, z: c.pos.z };
  });

  // click START
  await page.click('#startBtn');

  // simulate driving: hold accelerate + nitro for ~1.5s
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await new Promise((r) => setTimeout(r, 1500));
  // steer a bit to test drift/steering
  await page.keyboard.down('KeyA');
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.up('KeyA');
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');

  const after = await page.evaluate(() => {
    const g = window.__DUNE__;
    return {
      pos: { x: g.car.pos.x, y: g.car.pos.y, z: g.car.pos.z },
      speed: g.car.speed,
      heading: g.car.heading,
      boostMeter: g.car.boost.meter,
      running: g.running,
      hudSpeed: document.getElementById('spd').textContent,
      nitroWidth: document.getElementById('nitroFill').style.width,
      childCount: g.scene.children.length,
    };
  });

  const moved = Math.hypot(after.pos.x - startPos.x, after.pos.z - startPos.z);

  await browser.close();
  server.close();

  // ---- assertions ----
  const results = [];
  const assert = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

  assert('loading overlay hidden', loadingHidden);
  assert('menu shown before start', menuVisible);
  assert('scene populated', after.childCount > 5, `children=${after.childCount}`);
  assert('game running after start', after.running);
  assert('car moved from start', moved > 5, `moved=${moved.toFixed(2)}m`);
  assert('car has speed', after.speed > 5, `speed=${after.speed.toFixed(1)} m/s`);
  assert('heading changed (steering works)', Math.abs(after.heading) > 0.001, `heading=${after.heading.toFixed(3)}`);
  assert('nitro drained', after.boostMeter < 1, `meter=${after.boostMeter.toFixed(2)}`);
  assert('HUD speed updates', Number(after.hudSpeed) > 0, `hud=${after.hudSpeed}`);
  assert('no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n--- console logs from page ---');
  logs.forEach((l) => console.log(l));
  console.log('\n--- results ---');
  let allPass = true;
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
    if (!r.pass) allPass = false;
  }
  console.log(`\n${allPass ? 'ALL PASS' : 'SOME FAILED'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
