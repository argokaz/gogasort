// Capturas de revisión de la web local (http://localhost:4173) con el Chromium headless de Overlay Studio.
// Uso: node tools/capturas.mjs <carpeta_salida>
import { lanzar } from '/Users/arturogoga/00CODEX/Overlay Studio/scripts/navegador.mjs';

const out = process.argv[2] || '.';
const URL = process.env.URL || 'http://localhost:4173/';
const browser = await lanzar();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shots(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(5000);
  await page.screenshot({ path: `${out}/${name}_hero.png` });
  for (const [sel, wait, tag] of [['#privacidad', 1500, 'priv'], ['#demo', 9000, 'demo'], ['#como', 1500, 'como'], ['.modes', 1500, 'modos'], ['.safe', 1500, 'safe'], ['#proart', 1500, 'proart'], ['#descargar', 1500, 'dl'], ['.faq', 1500, 'faq']]) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), sel);
    await sleep(wait);
    await page.screenshot({ path: `${out}/${name}_${tag}.png` });
  }
  if (errs.length) console.log(name, 'ERRORES:', errs);
  await ctx.close();
}

await shots('desk', { width: 1440, height: 900 });
await shots('movil', { width: 390, height: 844 });
await browser.close();
console.log('ok');
