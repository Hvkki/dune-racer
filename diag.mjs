// Diagnostic: drive forward and log how far the car is from the track
// centerline and how its Y compares to the corridor height. Reveals whether
// the car is driving on the graded road or wandering onto raw dunes.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = 8179;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  try {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') u = '/index.html';
    const fp = normalize(join(ROOT, u));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(await readFile(fp));
  } catch { res.writeHead(404); res.end(); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle',
      '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__DUNE__ && window.__DUNE__.scene, { timeout: 20000 });
  await page.click('#startBtn');

  // Phase 1: accelerate straight. Phase 2: nitro + hard steer (drift).
  await page.keyboard.down('KeyW');
  const rows = [];
  const sample = async (phase) => {
    const r = await page.evaluate(() => {
      const g = window.__DUNE__;
      const n = g.track.nearest(g.car.pos.x, g.car.pos.z);
      return {
        speed: +(g.car.speed * 3.6).toFixed(0),
        distToTrack: +n.dist.toFixed(1),
        carY: +g.car.pos.y.toFixed(2),
        terrainAtCar: +g.env.heightFn(g.car.pos.x, g.car.pos.z).toFixed(2),
      };
    });
    r.phase = phase;
    rows.push(r);
  };
  for (let i = 0; i < 6; i++) { await sleep(300); await sample('straight'); }
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 8; i++) { await sleep(300); await sample('drift'); }
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  await browser.close();
  server.close();

  console.log('phase     speed  dist2track  carY  terrainAtCar  (carY-terrain)');
  for (const r of rows) {
    console.log(
      r.phase.padEnd(9),
      String(r.speed).padStart(4),
      String(r.distToTrack).padStart(9),
      String(r.carY).padStart(6),
      String(r.terrainAtCar).padStart(11),
      String((r.carY - r.terrainAtCar).toFixed(2)).padStart(6)
    );
  }
  const worst = Math.max(...rows.map((r) => Math.abs(r.carY - r.terrainAtCar)));
  const maxDist = Math.max(...rows.map((r) => r.distToTrack));
  console.log(`\nworst |carY-terrain| = ${worst.toFixed(2)} (should stay ~0.35)`);
  console.log(`max dist from track = ${maxDist.toFixed(1)}m`);
}
main().catch((e) => { console.error(e); process.exit(1); });
