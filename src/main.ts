import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { crearVisor } from "./visor";
import { CATALOGO } from "./modelos/catalogo";
import type { Modelo } from "./modelos/tipos";
import { pedirPermisoOrientacion, hayOrientacionReal, iniciarControlOrientacion } from "./sensores";
import type { ControlOrientacion } from "./sensores";
import { diagnosticarAR, mensajeSoporteAR, pedirSesionAR, capacidadesDeSesion, describirErrorAR } from "./xr";
import { iniciarCamaraDeFondo, detenerCamaraDeFondo, describirErrorCamara } from "./camara";
import { cargarFicha, descargarFichas } from "./descargas";
import { iniciarInstalacion } from "./instalar";
import { iniciarBandaConexion } from "./conexion";
import { guardarRastro, leerRastro, describirRastro } from "./rastro";
import { iniciarTarjetas } from "./tarjetas";

// Entry point. The page is wired in sections, one per feature; the heavy lifting
// lives in the modules above (the "engine"), which do not depend on this file.
//
// Sessions 33-34: progress in IndexedDB and the Service Worker (see tarjetas.ts, sw.ts).
// Sessions 35-38: sensors, camera background and WebXR.
// Sessions 39-42: surfaces in AR, models as data, install button, offline band,
// draw on demand.

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const visor = crearVisor($("#visor"));
const avisoVisor = $("#aviso-visor");

function avisarVisor(texto: string) {
  avisoVisor.textContent = texto;
  avisoVisor.hidden = !texto;
}

// ── Models, pieces and the long-form sheet ──────────────────────────────────
const selectorModelo = $("#selector-modelo");
const listaPiezas = $("#lista-piezas");
const fichaTitulo = $("#ficha-titulo");
const fichaResumen = $("#ficha-resumen");
const fichaPieza = $("#ficha-pieza");
const fichaAmpliada = $("#ficha-ampliada");
const btnFichaAmpliada = $<HTMLButtonElement>("#btn-ficha-ampliada");
const btnDescargarFichas = $<HTMLButtonElement>("#btn-descargar-fichas");
const estadoDescarga = $("#estado-descarga");
let modeloActual: Modelo = CATALOGO[0];

function marcarPieza(id: string | null) {
  listaPiezas.querySelectorAll<HTMLButtonElement>(".pieza").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.id === id));
  });
  const pieza = modeloActual.piezas.find((p) => p.id === id);
  fichaPieza.textContent = pieza ? `${pieza.nombre}: ${pieza.descripcion}` : "Elige una pieza para ver qué hace.";
}

function elegirModelo(modelo: Modelo) {
  modeloActual = modelo;
  visor.mostrarModelo(modelo);
  selectorModelo.querySelectorAll<HTMLButtonElement>(".btn-modelo").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.id === modelo.id));
  });
  fichaTitulo.textContent = modelo.nombre;
  fichaResumen.textContent = modelo.resumen;
  listaPiezas.replaceChildren(
    ...modelo.piezas.map((p) => {
      const item = document.createElement("li");
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "pieza";
      boton.dataset.id = p.id;
      boton.textContent = p.nombre;
      boton.addEventListener("click", () => {
        visor.elegirPieza(p.id);
        marcarPieza(p.id);
      });
      item.append(boton);
      return item;
    })
  );
  marcarPieza(null);
  fichaAmpliada.hidden = true;
  fichaAmpliada.replaceChildren();
}

selectorModelo.replaceChildren(
  ...CATALOGO.map((m) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-modelo";
    boton.dataset.id = m.id;
    boton.textContent = m.nombre;
    boton.addEventListener("click", () => elegirModelo(m));
    return boton;
  })
);
visor.alElegirPieza(marcarPieza);
elegirModelo(CATALOGO[0]);

btnFichaAmpliada.addEventListener("click", async () => {
  if (!fichaAmpliada.hidden) {
    fichaAmpliada.hidden = true; // second click: hide it
    return;
  }
  try {
    const ficha = await cargarFicha(modeloActual.id);
    const lista = (titulo: string, items: string[]) => {
      const bloque = document.createElement("div");
      const cabecera = document.createElement("strong");
      cabecera.textContent = titulo;
      const ul = document.createElement("ul");
      ul.replaceChildren(
        ...items.map((t) => {
          const li = document.createElement("li");
          li.textContent = t;
          return li;
        })
      );
      bloque.append(cabecera, ul);
      return bloque;
    };
    const titulo = document.createElement("h3");
    titulo.textContent = ficha.titulo;
    const cuando = document.createElement("p");
    cuando.textContent = `Cuándo usarlo: ${ficha.cuandoUsarlo}`;
    fichaAmpliada.replaceChildren(
      titulo,
      ...ficha.detalle.map((t) => Object.assign(document.createElement("p"), { textContent: t })),
      cuando,
      lista("Ventajas", ficha.ventajas),
      lista("Riesgos", ficha.riesgos)
    );
    fichaAmpliada.hidden = false;
  } catch {
    avisarVisor("La ficha ampliada no está disponible sin conexión. Descárgala antes con «Descargar fichas».");
  }
});

btnDescargarFichas.addEventListener("click", async () => {
  estadoDescarga.textContent = "Descargando fichas…";
  const { guardadas, fallidas } = await descargarFichas(CATALOGO.map((m) => m.id));
  estadoDescarga.textContent = fallidas
    ? `Se guardaron ${guardadas} de ${CATALOGO.length} fichas. Revisa tu conexión y vuelve a intentarlo.`
    : `Listo: ${guardadas} fichas disponibles sin conexión.`;
});

// ── Session 35: orientation sensors ─────────────────────────────────────────
const btnOrientacion = $<HTMLButtonElement>("#btn-orientacion");
const btnCalibrar = $<HTMLButtonElement>("#btn-calibrar");
const lecturaVisor = $("#lectura-visor");
let control: ControlOrientacion | null = null;
let timerLectura = 0;

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
    apagarSensores(); // second click: back to manual control
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
const btnCamara = $<HTMLButtonElement>("#btn-camara");
const videoFondo = $<HTMLVideoElement>("#fondo-camara");
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

// ── Sessions 38-39: augmented reality with WebXR ───────────────────────────
const btnAR = $<HTMLButtonElement>("#btn-ar");
const btnSalirAR = $<HTMLButtonElement>("#btn-salir-ar");
const btnRecolocar = $<HTMLButtonElement>("#btn-recolocar");
const btnRecomprobar = $<HTMLButtonElement>("#btn-recomprobar");
const estadoAR = $("#estado-ar");
const rastroAR = $("#rastro-ar");
const overlayAR = document.querySelector<HTMLElement>("#xr-overlay");
const xrEstado = $("#xr-estado");
const diagAR = $("#diag-ar");
const detallesAR = $<HTMLDetailsElement>(".diag-ar");
let sesionAR: XRSession | null = null;

rastroAR.textContent = describirRastro(leerRastro());

// Can we? The button is only enabled if the answer is "yes". It is checked on
// load, on "Comprobar de nuevo" and when the browser reports an XR device change
// (so it also works if the emulator is activated afterwards).
async function comprobarAR(): Promise<void> {
  const { estado, lineas } = await diagnosticarAR();
  estadoAR.textContent = mensajeSoporteAR(estado);
  diagAR.textContent = lineas.join("\n");
  if (!sesionAR) btnAR.disabled = estado !== "disponible";
  // If AR is unavailable, point to the diagnostic. It is NOT opened automatically:
  // opening it after load would push the whole page down (layout shift).
  detallesAR.querySelector("summary")!.textContent =
    estado === "disponible"
      ? "Diagnóstico de realidad aumentada"
      : "Diagnóstico de realidad aumentada — toca para ver qué falló";
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
    const { hitTest, anclas } = capacidadesDeSesion(sesion);
    await visor.entrarEnAR(sesion, {
      hitTest,
      anclas,
      alEstado: (texto) => {
        xrEstado.textContent = texto;
        estadoAR.textContent = texto;
      },
      alTerminar: (resultado) => {
        sesionAR = null;
        btnAR.disabled = false;
        rastroAR.textContent = describirRastro(guardarRastro({ modeloId: modeloActual.id, ...resultado }));
        estadoAR.textContent = "La sesión de realidad aumentada terminó.";
      },
    });
    // domOverlayState exists only if the browser granted the "dom-overlay" feature.
    if (!sesion.domOverlayState) {
      estadoAR.textContent += " Este navegador no mostró los botones sobre la cámara: sal con el gesto de salida del sistema.";
    }
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

// "Retry": forget the placement and look for a surface again.
btnRecolocar.addEventListener("click", () => visor.reiniciarColocacion());

// Taps on our buttons must not count as "select" (which would place the model).
overlayAR?.addEventListener("beforexrselect", (e) => {
  if ((e.target as HTMLElement).closest("button")) e.preventDefault();
});

// Gestures over the camera: one finger spins the model, two fingers scale it.
if (overlayAR) {
  const punteros = new Map<number, { x: number; y: number }>();
  const distancia = () => {
    const [a, b] = [...punteros.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  overlayAR.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  overlayAR.addEventListener("pointermove", (e) => {
    const previo = punteros.get(e.pointerId);
    if (!previo) return;
    if (punteros.size === 2) {
      const antes = distancia();
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (antes > 0) visor.gestoAR(0, distancia() / antes);
    } else {
      visor.gestoAR((e.clientX - previo.x) * 0.01, 1);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  });
  const soltar = (e: PointerEvent) => punteros.delete(e.pointerId);
  overlayAR.addEventListener("pointerup", soltar);
  overlayAR.addEventListener("pointercancel", soltar);
}

// ── Session 41: install button and offline band ─────────────────────────────
iniciarInstalacion($<HTMLButtonElement>("#btn-instalar"), $("#aviso-instalacion"));
iniciarBandaConexion($("#banda-sin-conexion"));

// ── Progress cards (Session 33) ─────────────────────────────────────────────
void iniciarTarjetas($("#app"), CATALOGO);

// Service Worker registration (generated from src/sw.ts by vite-plugin-pwa).
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    console.log("Service Worker registered:", swUrl, registration);
  },
  onRegisterError(error) {
    console.error("Error registering the Service Worker:", error);
  },
});
