// checklist-atlas.js — final 13-point checklist for the Atlas 3D.
//
// Design rule: it only looks at what is visible from OUTSIDE (ids, classes, what
// Chrome reports, what happens without a network), so the same script runs on any
// build of the Atlas, whatever framework is behind it.
//
// Usage:  npm run build && ATLASDIR=. node checklist-atlas.js
//         (PowerShell: $env:ATLASDIR="."; node checklist-atlas.js)
// Needs Chrome installed; set CHROME_PATH to use another Chromium binary.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const RAIZ = path.resolve(process.env.ATLASDIR ?? ".");
const DIST = path.join(RAIZ, "dist");
if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`No existe ${DIST}/index.html. Ejecuta primero «npm run build» en ese proyecto.`);
  process.exit(2);
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

// A tiny static server that stands in for the real host. Closing it later is how
// point 5 simulates "the server is down".
function servir() {
  const servidor = http.createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let archivo = path.join(DIST, ruta.endsWith("/") ? ruta + "index.html" : ruta);
    if (!archivo.startsWith(DIST) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TIPOS[path.extname(archivo)] ?? "application/octet-stream" });
    fs.createReadStream(archivo).pipe(res);
  });
  return new Promise((resolve) => servidor.listen(0, "127.0.0.1", () => resolve(servidor)));
}

// Counts every WebGL draw call, and accumulates layout shifts (CLS) from the start.
const INSTRUMENTO = () => {
  window.__dibujos = 0;
  for (const Contexto of [WebGLRenderingContext, WebGL2RenderingContext]) {
    for (const metodo of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const original = Contexto.prototype[metodo];
      if (!original) continue;
      Contexto.prototype[metodo] = function (...args) {
        window.__dibujos++;
        return original.apply(this, args);
      };
    }
  }
  window.__cls = 0;
  new PerformanceObserver((lista) => {
    for (const e of lista.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
};

const resultados = [];
function punto(numero, descripcion, dato, ok, motivo) {
  resultados.push({ numero, linea: `${numero}) ${descripcion} → ${dato}`, ok, motivo });
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = await servir();
const url = `http://localhost:${servidor.address().port}/`;

// A persistent profile (not the default incognito-like context): Chrome refuses
// to report an app as installable from incognito ("in-incognito").
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-checklist-"));
const contexto = await chromium.launchPersistentContext(perfil, {
  headless: true,
  executablePath: process.env.CHROME_PATH,
  channel: process.env.CHROME_PATH ? undefined : "chrome",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  viewport: { width: 1000, height: 900 },
});
await contexto.addInitScript(INSTRUMENTO);
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
const erroresDePagina = [];
pagina.on("pageerror", (e) => erroresDePagina.push(e.message));

await pagina.goto(url, { waitUntil: "networkidle" });
await pagina.waitForSelector("#visor canvas");
await pagina.evaluate(() => navigator.serviceWorker.ready);
await pagina.reload({ waitUntil: "networkidle" }); // second load: now the Service Worker controls the page
await pagina.waitForSelector("#visor canvas");
await pausa(1200);

// 1) Document basics
const doc = await pagina.evaluate(() => ({
  idioma: document.documentElement.lang,
  viewport: !!document.querySelector('meta[name="viewport"]'),
  descripcion: document.querySelector('meta[name="description"]')?.content?.length ?? 0,
  mains: document.querySelectorAll("main").length,
  seguro: window.isSecureContext,
}));
punto(
  1,
  "documento: idioma, viewport, descripción, un solo <main>, contexto seguro",
  JSON.stringify(doc),
  !!doc.idioma && doc.viewport && doc.descripcion > 0 && doc.mains === 1 && doc.seguro,
  "el documento debe tener lang, viewport, meta description, un único <main> y servirse en contexto seguro"
);

// 2 and 3) Manifest and installability, asked to Chrome itself
const cdp = await contexto.newCDPSession(pagina);
await cdp.send("Page.enable");
const manifiesto = await cdp.send("Page.getAppManifest");
punto(
  2,
  "manifest",
  JSON.stringify({ url: manifiesto.url?.replace(url, "/"), errores: manifiesto.errors.map((e) => e.message) }),
  !!manifiesto.url && manifiesto.errors.length === 0,
  "Chrome reporta errores en el manifest"
);
const instalabilidad = await cdp.send("Page.getInstallabilityErrors");
punto(
  3,
  "instalabilidad según Chrome",
  JSON.stringify(instalabilidad.installabilityErrors.map((e) => e.errorId)),
  instalabilidad.installabilityErrors.length === 0,
  "Chrome dice que la app no se puede instalar"
);

// 4) Service Worker active, controlling the page, and a complete precache
const sw = await pagina.evaluate(async () => {
  const registro = await navigator.serviceWorker.getRegistration();
  const nombres = (await caches.keys()).filter((n) => n.includes("precache"));
  const urls = nombres.length ? (await (await caches.open(nombres[0])).keys()).map((r) => new URL(r.url).pathname) : [];
  return { activo: registro?.active?.state === "activated", controla: !!navigator.serviceWorker.controller, urls };
});
const esperados = [];
(function recorrer(carpeta) {
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name !== "modelos") recorrer(ruta); // the sheets are cached on demand, not precached
    } else if (/\.(html|js|css|png|json)$/.test(entrada.name) && !/^(sw|workbox-)/.test(entrada.name)) {
      esperados.push("/" + path.relative(DIST, ruta).split(path.sep).join("/"));
    }
  }
})(DIST);
const faltan = esperados.filter((e) => e !== "/index.html" && !sw.urls.includes(e));
punto(
  4,
  "service worker",
  JSON.stringify({ activo: sw.activo, controla: sw.controla, precache: sw.urls.length, faltan }),
  sw.activo && sw.controla && sw.urls.length >= 8 && faltan.length === 0,
  "el Service Worker debe estar activo, controlar la página y precachear todo lo compilado (8 entradas o más)"
);

// 6) Cumulative layout shift while loading
const cls = await pagina.evaluate(() => window.__cls);
punto(6, "desplazamiento de diseño acumulado (CLS) al cargar", cls.toFixed(3), cls < 0.1, "el CLS debe ser menor que 0,1");

// 7 to 12) Draw on demand
const dibujos = () => pagina.evaluate(() => window.__dibujos);
const reiniciarCuenta = () => pagina.evaluate(() => (window.__dibujos = 0));
const caja = await (await pagina.$("#visor canvas")).boundingBox();

await reiniciarCuenta();
await pausa(1500);
let n = await dibujos();
punto(7, "escena quieta durante 1,5 s", `llamadas de dibujo: ${n}`, n === 0, "una escena quieta no debe dibujar");

await reiniciarCuenta();
await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
await pagina.mouse.down();
await pagina.mouse.move(caja.x + caja.width / 2 + 120, caja.y + caja.height / 2 + 30, { steps: 8 });
await pagina.mouse.up();
await pausa(500);
n = await dibujos();
punto(8, "girar con el ratón", `llamadas de dibujo: ${n}`, n > 0, "girar el modelo debe dibujar");

await pausa(1500); // let the damping settle
await reiniciarCuenta();
await pagina.click(".pieza >> nth=0");
await pausa(300);
n = await dibujos();
punto(9, "elegir una pieza", `llamadas de dibujo: ${n}`, n > 0, "elegir una pieza debe dibujar el resaltado");

await reiniciarCuenta();
await pagina.click(".btn-modelo >> nth=1");
await pausa(300);
n = await dibujos();
punto(10, "cambiar de modelo", `llamadas de dibujo: ${n}`, n > 0, "cambiar de modelo debe dibujar el modelo nuevo");

await reiniciarCuenta();
await pagina.setViewportSize({ width: 700, height: 900 });
await pausa(300);
n = await dibujos();
punto(11, "redimensionar la ventana", `llamadas de dibujo: ${n}`, n > 0, "redimensionar debe dibujar con el tamaño nuevo");

await pausa(1500);
await reiniciarCuenta();
await pausa(1500);
n = await dibujos();
punto(12, "volver a quedar quieta tras interactuar", `llamadas de dibujo: ${n}`, n === 0, "tras interactuar, la escena debe dejar de dibujar");

// 13) A note typed in one card survives a favorite toggled in another card
await pagina.fill(".modelo-card >> nth=0 >> .nota-input", "repasar el controlador");
await pagina.click(".modelo-card >> nth=1 >> .btn-favorito");
await pausa(400);
const nota = await pagina.inputValue(".modelo-card >> nth=0 >> .nota-input");
punto(
  13,
  "escribir una nota y marcar favorito en otra tarjeta",
  `nota conservada: ${JSON.stringify(nota)}`,
  nota === "repasar el controlador",
  "la nota escrita no debe borrarse al marcar un favorito"
);

// 5) The app opens with the server down (last: it needs the page offline)
await new Promise((resolve) => {
  servidor.close(resolve);
  servidor.closeAllConnections();
});
await pagina.reload({ waitUntil: "load" }).catch(() => {});
const sinServidor = await pagina.evaluate(() => ({
  titulo: document.title,
  canvas: document.querySelectorAll("#visor canvas").length,
})).catch(() => ({ titulo: "", canvas: 0 }));
punto(
  5,
  "recargar con el servidor caído",
  JSON.stringify(sinServidor),
  sinServidor.canvas === 1 && sinServidor.titulo.length > 0,
  "la app debe abrir y mostrar el visor sin servidor"
);
if (erroresDePagina.length) {
  console.log("errores de página:", erroresDePagina);
}

await contexto.close();
fs.rmSync(perfil, { recursive: true, force: true });

resultados.sort((a, b) => a.numero - b.numero);
let fallos = 0;
for (const r of resultados) {
  console.log(r.linea);
  if (!r.ok) {
    fallos++;
    console.log(`   ✗ FALLÓ: ${r.motivo}`);
  }
}
console.log(fallos ? `RESULTADO: hay ${fallos} fallos` : "RESULTADO: todo en orden");
process.exit(fallos ? 1 : 0);
