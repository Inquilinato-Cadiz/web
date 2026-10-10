// Genera las imágenes para compartir enlaces (1200×630) en public/og/ con Chrome headless.
// Para añadir una: nueva entrada en CARDS, `npm run og` y commit del PNG. La imagen por defecto se elige en src/data/og.ts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fmt = (n) => n.toLocaleString("es-ES");
const read = async (file) => (await import(pathToFileURL(resolve(file)), { with: { type: "json" } })).default;
const stats = await read("src/data/stats.json");
const fincas = await read("src/data/fincas.json");
const desahucios = await read("src/data/desahucios.json");

// claim: texto del titular; lo que va entre *asteriscos* sale en naranja y | fuerza un salto de línea.
const CARDS = [
  { slug: "piso-turistico", claim: "¿Hay un piso|turístico en|*tu calle?*", footer: "Mapa · Datos · Herramientas" },
  { slug: "huelga-general", claim: "Hacia la|huelga general|*por la vivienda*", footer: "Comité Popular por la Huelga General" },
  { slug: "datos", claim: `*${fmt(stats.province.total)}*|pisos turísticos|en la provincia`, footer: "Datos de vivienda en Cádiz" },
  { slug: "fincas", claim: `*${fmt(fincas.total)} fincas*|de Cádiz enteras|de un solo dueño`, footer: `${fmt(fincas.homes)} viviendas · Comprueba la tuya` },
  { slug: "desahucios", claim: `*${fmt(desahucios.last_year.lau)}* desahucios|por alquiler|en ${desahucios.last_full_year}`, footer: "Provincia de Cádiz · CGPJ" },
  { slug: "utilidades", claim: "¿Te quieren|*subir el|alquiler?*", footer: "Calculadoras · Contrato · Plazos" },
  { slug: "recursos", claim: "Guías y|modelos para|*defenderte*", footer: "Recursos para inquilinas" },
  { slug: "unete", claim: "No estás|sola.|*Organízate.*", footer: "Afíliate al sindicato" },
];

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const asset = (path) => pathToFileURL(resolve(path)).href;
const fist = asset("node_modules/@fortawesome/fontawesome-free/svgs/solid/hand-fist.svg");
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = (card) => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Anton; src: url(${asset("node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2")}); }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body { background: #171717; padding: 12px; font-family: Anton, sans-serif; text-transform: uppercase; color: #171717; }
.card { position: relative; width: 100%; height: 100%; background: #faf7f2; }
h1 { position: absolute; left: 66px; top: 64px; width: 880px; font-weight: 400; font-size: 106px; white-space: nowrap; line-height: 1; letter-spacing: .01em; }
em { font-style: normal; color: #f05a28; }
.fist { position: absolute; right: 64px; top: 50px; width: 96px; height: 120px; background: #f05a28; -webkit-mask: url(${fist}) center / contain no-repeat; }
.logo { position: absolute; left: 66px; bottom: 58px; width: 290px; }
.footer { position: absolute; right: 64px; bottom: 76px; font-size: 32px; letter-spacing: .01em; }
</style>
<div class="card">
  <h1>${escape(card.claim).replace(/\*([^*]+)\*/g, "<em>$1</em>").replaceAll("|", "<br>")}</h1>
  <div class="fist"></div>
  <img class="logo" src="${asset("public/logo-cabecera.png")}">
  <div class="footer">${escape(card.footer)}</div>
</div>
<script>
  // Encoge el titular hasta que quepa sobre el pie y a la izquierda del puño.
  document.fonts.ready.then(() => {
    const h1 = document.querySelector("h1");
    let size = 106;
    while ((h1.offsetHeight > 380 || h1.scrollWidth > 880) && size > 60) h1.style.fontSize = (size -= 4) + "px";
  });
</script>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
try {
  for (const card of CARDS) {
    const page = join(dir, `${card.slug}.html`);
    writeFileSync(page, html(card));
    const out = resolve(`public/og/${card.slug}.png`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--virtual-time-budget=3000",
      "--window-size=1200,630", `--screenshot=${out}`, pathToFileURL(page).href], { stdio: "ignore" });
    console.log(`public/og/${card.slug}.png`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
