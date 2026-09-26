// Capture screenshots of Dune Racer in headless Chromium.
// Serves the folder, loads the game, and grabs: the menu, then several
// in-race frames while driving + boosting.

import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const OUT = join(ROOT, 'screenshots');
const PORT = 8178;

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
  } catch { res.writeHead(404); res.end('not found'); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--enable-webgl', '--window-size=1600,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__DUNE__ && window.__DUNE__.scene, { timeout: 20000 });

  // let a few frames render so the scene is warm
  await sleep(1200);

  // 1) Menu screen
  await page.screenshot({ path: join(OUT, '01-menu.png') });
  console.log('captured 01-menu.png');

  // Start the race
  await page.click('#startBtn');
  await sleep(400);

  // 2) Just after start (start/finish line in view)
  await page.screenshot({ path: join(OUT, '02-start.png') });
  console.log('captured 02-start.png');

  // Accelerate + boost, capture a mid-speed cruising frame
  await page.keyboard.down('KeyW');
  await sleep(1600);
  await page.screenshot({ path: join(OUT, '03-driving.png') });
  console.log('captured 03-driving.png');

  // Nitro on for the FOV kick + flames + dust
  await page.keyboard.down('Space');
  await sleep(900);
  await page.screenshot({ path: join(OUT, '04-nitro.png') });
  console.log('captured 04-nitro.png');

  // Hard steer at speed to trigger a drift + dust plume
  await page.keyboard.down('KeyD');
  await sleep(900);
  await page.screenshot({ path: join(OUT, '05-drift.png') });
  console.log('captured 05-drift.png');

  await page.keyboard.up('Space');
  await page.keyboard.up('KeyD');
  await sleep(1400);
  await page.screenshot({ path: join(OUT, '06-cruise.png') });
  console.log('captured 06-cruise.png');

  await page.keyboard.up('KeyW');

  const state = await page.evaluate(() => ({
    speed: Math.round(window.__DUNE__.car.speed * 3.6),
    children: window.__DUNE__.scene.children.length,
  }));
  console.log('final state:', JSON.stringify(state));

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
