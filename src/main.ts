import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { abrirBaseDeDatos, marcarModeloVisto, alternarFavorito, obtenerTodoElProgreso, guardarNotaDeEstudio } from "./db";
import { derivarClaveDesdeContrasena, cifrarTexto, descifrarTexto, obtenerOCrearSal } from "./crypto";
import type { ProgresoModelo } from "./db";
import { crearVisor } from "./visor";
import { pedirPermisoOrientacion, hayOrientacionReal, iniciarControlOrientacion } from "./sensores";
import type { ControlOrientacion } from "./sensores";
import { diagnosticarAR, mensajeSoporteAR, pedirSesionAR, describirErrorAR } from "./xr";
import { iniciarCamaraDeFondo, detenerCamaraDeFondo, describirErrorCamara } from "./camara";

// Punto de entrada del proyecto. El andamiaje de Vite + TypeScript + Three.js
// se confirmó en sesiones anteriores; el Service Worker se registró en la
// Sesión 28 y se migró a estrategias con nombre en la 31-32.
//
// Sesión 33: se agregó la capa de progreso en IndexedDB (favoritos, última
// visita, nota de estudio cifrada). El catálogo real de modelos 3D —
// dominio, vista, controlador — todavía no existe (se construye en sesiones
// futuras del Sub-bloque B), así que esta demo usa tres IDs de prueba, tal
// como indica la Actividad de la guía de la Sesión 33, en vez de inventar
// archivos .glb/.gltf que no están en el proyecto.
//
// Sesión 34: el sw.js manual de las Sesiones 28-32 desaparece. Ahora lo
// genera vite-plugin-pwa (Workbox integrado al build de Vite) — ver
// vite.config.ts — y se registra con registerSW() de virtual:pwa-register
// en vez de navigator.serviceWorker.register('/sw.js') a mano.

const MODELOS_DEMO: { id: string; nombre: string }[] = [
  { id: "modelo-demo-1", nombre: "Patrón MVC (de prueba)" },
  { id: "modelo-demo-2", nombre: "Arquitectura en capas (de prueba)" },
  { id: "modelo-demo-3", nombre: "Microservicios (de prueba)" },
];

const appEl = document.querySelector<HTMLDivElement>("#app")!;
let db: IDBDatabase;
let claveSesion: CryptoKey | null = null;
let progresoPorId = new Map<string, ProgresoModelo>();

async function obtenerClaveSesion(): Promise<CryptoKey | null> {
  if (claveSesion) return claveSesion;
  const contrasena = window.prompt(
    "Contraseña para cifrar/descifrar la nota de estudio (la misma cada vez — no se guarda en ningún lado):"
  );
  if (!contrasena) return null;
  const sal = obtenerOCrearSal();
  claveSesion = await derivarClaveDesdeContrasena(contrasena, sal);
  return claveSesion;
}

function render() {
  appEl.innerHTML = `
    <div class="atlas-demo">
      <h1>Atlas 3D de Arquitectura de Software</h1>
      <p class="aviso-demo">
        Demo de progreso (Sesión 33) — estos tres modelos son IDs de prueba,
        no modelos 3D reales todavía.
      </p>
      <div class="modelos-grid">
        ${MODELOS_DEMO.map((m) => {
          const p = progresoPorId.get(m.id);
          const favorito = p?.favorito ?? false;
          const ultimaVisita = p?.ultimaVisita ? new Date(p.ultimaVisita).toLocaleString() : "nunca";
          const tieneNota = !!p?.notaCifrada;
          return `
            <article class="modelo-card" data-id="${m.id}">
              <h2>${m.nombre}</h2>
              <p class="meta">Última visita: ${ultimaVisita}</p>
              <div class="acciones">
                <button class="btn-visitar" data-id="${m.id}">Marcar como visto</button>
                <button class="btn-favorito" data-id="${m.id}">${favorito ? "★ Favorito" : "☆ Marcar favorito"}</button>
              </div>
              <div class="nota-zona">
                <input type="text" class="nota-input" placeholder="Nota de estudio..." />
                <button class="btn-guardar-nota" data-id="${m.id}">🔒 Guardar nota</button>
                <button class="btn-ver-nota" data-id="${m.id}" ${tieneNota ? "" : "disabled"}>👁 Ver nota</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;

  appEl.querySelectorAll<HTMLButtonElement>(".btn-visitar").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const registro = await marcarModeloVisto(db, id);
      progresoPorId.set(id, registro);
      render();
    })
  );

  appEl.querySelectorAll<HTMLButtonElement>(".btn-favorito").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      await alternarFavorito(db, id);
      const todo = await obtenerTodoElProgreso(db);
      progresoPorId = new Map(todo.map((p) => [p.modeloId, p]));
      render();
    })
  );

  appEl.querySelectorAll<HTMLButtonElement>(".btn-guardar-nota").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const card = btn.closest(".modelo-card")!;
      const input = card.querySelector<HTMLInputElement>(".nota-input")!;
      if (!input.value.trim()) return;
      const clave = await obtenerClaveSesion();
      if (!clave) return;
      await guardarNotaDeEstudio(db, clave, id, input.value, cifrarTexto);
      const todo = await obtenerTodoElProgreso(db);
      progresoPorId = new Map(todo.map((p) => [p.modeloId, p]));
      render();
    })
  );

  appEl.querySelectorAll<HTMLButtonElement>(".btn-ver-nota").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id!;
      const p = progresoPorId.get(id);
      if (!p?.notaCifrada || !p.notaIv) return;
      const clave = await obtenerClaveSesion();
      if (!clave) return;
      try {
        const texto = await descifrarTexto(clave, { cifrado: p.notaCifrada, iv: p.notaIv });
        window.alert(`Nota de estudio de "${id}":\n\n${texto}`);
      } catch {
        window.alert("No se pudo descifrar — la contraseña ingresada no es la correcta.");
      }
    })
  );
}

async function iniciar() {
  db = await abrirBaseDeDatos();
  const todo = await obtenerTodoElProgreso(db);
  progresoPorId = new Map(todo.map((p) => [p.modeloId, p]));
  render();
}

iniciar();

// ── Sesión 35: visor 3D controlado por sensores de orientación ──────────────
const visor = crearVisor(document.querySelector<HTMLElement>("#visor")!);
const btnOrientacion = document.querySelector<HTMLButtonElement>("#btn-orientacion")!;
const btnCalibrar = document.querySelector<HTMLButtonElement>("#btn-calibrar")!;
const lecturaVisor = document.querySelector<HTMLElement>("#lectura-visor")!;
const avisoVisor = document.querySelector<HTMLElement>("#aviso-visor")!;
let control: ControlOrientacion | null = null;
let timerLectura = 0;

function avisarVisor(texto: string) {
  avisoVisor.textContent = texto;
  avisoVisor.hidden = !texto;
}

function apagarSensores() {
  control?.detener();
  control = null;
  window.clearInterval(timerLectura);
  visor.controlPorSensores(false);
  lecturaVisor.textContent = "";
  btnCalibrar.disabled = true;
  btnOrientacion.textContent = "📱 Rotar con el teléfono";
}

btnOrientacion.addEventListener("click", async () => {
  if (control) {
    apagarSensores(); // segundo clic: volver al control manual
    return;
  }
  const permiso = await pedirPermisoOrientacion();
  if (permiso === "denied") {
    avisarVisor("Denegaste el acceso a los sensores. Sigue disponible el control con ratón o dedo.");
    return;
  }
  if (permiso === "no-soportado" || !(await hayOrientacionReal())) {
    avisarVisor("Este dispositivo no tiene sensores de orientación. Usa el ratón o el dedo para girar el visor.");
    return;
  }
  avisarVisor("");
  visor.controlPorSensores(true);
  control = iniciarControlOrientacion((x, y) => visor.rotarHacia(x, y));
  btnCalibrar.disabled = false;
  btnOrientacion.textContent = "📱 Sensores: ACTIVOS (toca para apagar)";
  timerLectura = window.setInterval(() => {
    const { x, y } = visor.rotacionActualGrados();
    lecturaVisor.textContent = `rotación X ${x}° · Y ${y}°`;
  }, 150);
});
btnCalibrar.addEventListener("click", () => control?.calibrar());

// ── Session 36: the camera as a live viewer background ─────────────────────
const btnCamara = document.querySelector<HTMLButtonElement>("#btn-camara")!;
const videoFondo = document.querySelector<HTMLVideoElement>("#fondo-camara")!;
let streamFondo: MediaStream | null = null;

function apagarCamara() {
  // If play() failed, streamFondo is still null but the video already holds the stream.
  detenerCamaraDeFondo(videoFondo, streamFondo ?? (videoFondo.srcObject as MediaStream | null));
  streamFondo = null;
  videoFondo.hidden = true;
  visor.fondoTransparente(false);
  btnCamara.textContent = "📷 Cámara de fondo";
}

btnCamara.addEventListener("click", async () => {
  if (streamFondo) {
    apagarCamara(); // second click: turn it off
    return;
  }
  btnCamara.disabled = true;
  try {
    streamFondo = await iniciarCamaraDeFondo(videoFondo);
    videoFondo.hidden = false;
    visor.fondoTransparente(true);
    avisarVisor("");
    btnCamara.textContent = "📷 Cámara: ACTIVA (toca para apagar)";
  } catch (error) {
    apagarCamara();
    avisarVisor(describirErrorCamara(error));
  } finally {
    btnCamara.disabled = false;
  }
});

// An open stream nobody is watching drains battery and leaves the LED on, so it
// is shut off when the page is left. It does not restart on return: that would
// open the camera without the user asking.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && streamFondo) {
    apagarCamara();
    avisarVisor("La cámara se apagó al salir de la página. Vuelve a activarla cuando quieras.");
  }
});

// ── Session 38: augmented reality with WebXR ───────────────────────────────
const btnAR = document.querySelector<HTMLButtonElement>("#btn-ar")!;
const btnSalirAR = document.querySelector<HTMLButtonElement>("#btn-salir-ar")!;
const btnRecomprobar = document.querySelector<HTMLButtonElement>("#btn-recomprobar")!;
const estadoAR = document.querySelector<HTMLElement>("#estado-ar")!;
const overlayAR = document.querySelector<HTMLElement>("#xr-overlay");
const diagAR = document.querySelector<HTMLElement>("#diag-ar")!;
const detallesAR = document.querySelector<HTMLDetailsElement>(".diag-ar")!;
let sesionAR: XRSession | null = null;

// Can we? The button is only enabled if the answer is "yes". It is checked on
// load, on "Comprobar de nuevo" and when the browser reports an XR device change
// (so it also works if the emulator is activated afterwards).
async function comprobarAR(): Promise<void> {
  const { estado, lineas } = await diagnosticarAR();
  estadoAR.textContent = mensajeSoporteAR(estado);
  diagAR.textContent = lineas.join("\n");
  if (!sesionAR) btnAR.disabled = estado !== "disponible";
  // If AR is unavailable, the diagnostic opens so the failing check is visible.
  detallesAR.open = estado !== "disponible";
}
void comprobarAR();
btnRecomprobar.addEventListener("click", () => void comprobarAR());
navigator.xr?.addEventListener("devicechange", () => void comprobarAR());

btnAR.addEventListener("click", async () => {
  avisarVisor("");
  // The page camera and the AR session cannot run at once: AR opens the camera
  // on its own. The Session 35 sensors are turned off too.
  apagarCamara();
  apagarSensores();
  try {
    // The request happens INSIDE the click: that is the "user gesture" WebXR requires.
    const sesion = await pedirSesionAR(overlayAR);
    sesionAR = sesion;
    btnAR.disabled = true;
    await visor.entrarEnAR(sesion, () => {
      sesionAR = null;
      btnAR.disabled = false;
      estadoAR.textContent = "La sesión de realidad aumentada terminó.";
    });
    // domOverlayState exists only if the browser granted the "dom-overlay" feature.
    estadoAR.textContent = sesion.domOverlayState
      ? "Sesión de realidad aumentada activa. Usa «Salir de AR» sobre la cámara."
      : "Sesión de realidad aumentada activa. Este navegador no mostró el botón sobre la cámara: sal con el gesto de salida del sistema.";
  } catch (err) {
    console.error("Could not start the AR session:", err);
    sesionAR?.end().catch(() => {});
    sesionAR = null;
    btnAR.disabled = false;
    avisarVisor(describirErrorAR(err));
  }
});

// Single exit path: end(). Restoring state is done by the viewer's "end" listener.
btnSalirAR.addEventListener("click", () => {
  void sesionAR?.end();
});

// Registro del Service Worker generado por Workbox — Sesión 34.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.log("SW de Workbox registrado:", swUrl, registration);
  },
  onRegisterError(error) {
    console.error("Error al registrar el SW de Workbox:", error);
  },
});
