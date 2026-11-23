// visor.ts — Three.js scene of the Atlas 3D.
// Session 35: sensors. Session 36: transparent background. Session 38-39: WebXR
// with surfaces. Session 40: models as data. Session 42: draw on demand.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Modelo } from "./modelos/tipos";

/** What happened in an AR session, for the trace and the status line. */
export interface ResultadoAR {
  colocado: boolean;
  anclado: boolean;
  /** true when there was no hit-test: the model just floated in front of the user. */
  planB: boolean;
}

export interface OpcionesAR {
  hitTest: boolean;
  anclas: boolean;
  alEstado(texto: string): void;
  alTerminar(resultado: ResultadoAR): void;
}

export interface Visor {
  /** Replaces the model on screen with the one described by `modelo`. */
  mostrarModelo(modelo: Modelo): void;
  /** Highlights a piece (or clears the highlight with null). */
  elegirPieza(id: string | null): void;
  /** Called when the user taps a piece (or empty space) in the canvas. */
  alElegirPieza(callback: (id: string | null) => void): void;
  /** Sets the target rotation of the model (radians). The viewer eases towards it. */
  rotarHacia(rotX: number, rotY: number): void;
  /** true: sensors drive the model (mouse/touch off). false: manual control. */
  controlPorSensores(activo: boolean): void;
  /** Current rotation of the model, in degrees (to show on screen). */
  rotacionActualGrados(): { x: number; y: number };
  /** true lets whatever is behind the canvas (the camera) show through. */
  fondoTransparente(activo: boolean): void;
  /** Opens the viewer inside a WebXR immersive-ar session. */
  entrarEnAR(sesion: XRSession, opciones: OpcionesAR): Promise<void>;
  /** AR: forget the current placement and look for a surface again. */
  reiniciarColocacion(): void;
  /** AR gestures: spin the placed model (radians) and/or scale it (factor). */
  gestoAR(giroY: number, factorEscala: number): void;
  destruir(): void;
}

const LADO_AR_METROS = 0.4; // the largest side of the model measures ~40 cm in AR
const POSICION_PLAN_B = new THREE.Vector3(0, -0.2, -1.5);

export function crearVisor(contenedor: HTMLElement): Visor {
  const COLOR_FONDO = new THREE.Color(0x0b1220);
  const escena = new THREE.Scene();
  escena.background = COLOR_FONDO;

  const camara = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camara.position.set(0, 0, 4.8);

  // Alpha is decided WHEN the renderer is created (it cannot change later). It is
  // always created with alpha; the camera only toggles scene.background.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0); // clear with alpha 0 = transparent
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  contenedor.append(renderer.domElement);

  escena.add(new THREE.AmbientLight(0xffffff, 0.6));
  const luz = new THREE.DirectionalLight(0xffffff, 1.2);
  luz.position.set(3, 4, 5);
  escena.add(luz);

  // raiz: where the model sits in the world (moved by AR placement).
  // grupo: the model itself (rotated and scaled by the user).
  const raiz = new THREE.Group();
  const grupo = new THREE.Group();
  raiz.add(grupo);
  escena.add(raiz);

  const piezas = new Map<string, THREE.Mesh>();
  let piezaElegida: string | null = null;
  let escalaAR = 0.25;
  let minimoY = -0.8; // lowest point of the model, in model units
  let alElegir: (id: string | null) => void = () => {};

  const controles = new OrbitControls(camara, renderer.domElement);
  controles.enableDamping = true;

  let objetivoX = 0;
  let objetivoY = 0;
  let porSensores = false;
  let sesionAR: XRSession | null = null;

  // ── Draw on demand: nothing is drawn while the scene is still ──────────────
  let cuadroPendiente = false;
  let animacion = 0;

  function pedirDibujo() {
    if (sesionAR || cuadroPendiente) return; // in AR the XR clock draws
    cuadroPendiente = true;
    animacion = requestAnimationFrame(cuadro);
  }

  function cuadro() {
    cuadroPendiente = false;
    let seguir = false;
    if (porSensores) {
      // Easing: reach the target little by little (filters sensor jitter).
      const dx = objetivoX - grupo.rotation.x;
      const dy = objetivoY - grupo.rotation.y;
      grupo.rotation.x += dx * 0.15;
      grupo.rotation.y += dy * 0.15;
      if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) seguir = true;
    }
    if (controles.update()) seguir = true; // true while damping is still moving the camera
    renderer.render(escena, camara);
    if (seguir) pedirDibujo();
  }

  controles.addEventListener("change", pedirDibujo);

  function ajustarTamano() {
    if (sesionAR) return; // in AR the XR viewer controls the canvas size
    const ancho = contenedor.clientWidth || 320;
    const alto = Math.round(ancho * 0.6);
    renderer.setSize(ancho, alto);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    pedirDibujo();
  }
  ajustarTamano();
  window.addEventListener("resize", ajustarTamano);

  // ── Models as data ─────────────────────────────────────────────────────────
  function vaciarModelo() {
    grupo.traverse((objeto) => {
      if (objeto instanceof THREE.Mesh || objeto instanceof THREE.LineSegments) {
        objeto.geometry.dispose();
        (objeto.material as THREE.Material).dispose();
      }
    });
    grupo.clear();
    piezas.clear();
  }

  function mostrarModelo(modelo: Modelo) {
    vaciarModelo();
    piezaElegida = null;
    for (const p of modelo.piezas) {
      const malla = new THREE.Mesh(
        new THREE.BoxGeometry(...p.tamano),
        new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.45 })
      );
      malla.position.set(...p.posicion);
      malla.userData.piezaId = p.id;
      malla.add(
        new THREE.LineSegments(new THREE.EdgesGeometry(malla.geometry), new THREE.LineBasicMaterial({ color: 0x0b1220 }))
      );
      grupo.add(malla);
      piezas.set(p.id, malla);
    }
    grupo.rotation.set(0, 0, 0);
    grupo.scale.setScalar(1);
    const caja = new THREE.Box3().setFromObject(grupo);
    const tamano = caja.getSize(new THREE.Vector3());
    escalaAR = LADO_AR_METROS / Math.max(tamano.x, tamano.y, tamano.z);
    minimoY = caja.min.y;
    pedirDibujo();
  }

  function elegirPieza(id: string | null) {
    piezaElegida = id && piezas.has(id) ? id : null;
    piezas.forEach((malla, clave) => {
      (malla.material as THREE.MeshStandardMaterial).emissive.setHex(clave === piezaElegida ? 0x666666 : 0x000000);
    });
    pedirDibujo();
  }

  // Tap on a piece: only if the pointer barely moved (a drag is orbiting, not picking).
  const raycaster = new THREE.Raycaster();
  let punteroAbajo: { x: number; y: number } | null = null;
  const alBajar = (e: PointerEvent) => {
    punteroAbajo = { x: e.clientX, y: e.clientY };
  };
  const alSubir = (e: PointerEvent) => {
    const inicio = punteroAbajo;
    punteroAbajo = null;
    if (!inicio || sesionAR) return;
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 5) return;
    const caja = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - caja.left) / caja.width) * 2 - 1,
      -((e.clientY - caja.top) / caja.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camara);
    const toque = raycaster.intersectObjects([...piezas.values()], false)[0];
    const id = (toque?.object.userData.piezaId as string | undefined) ?? null;
    elegirPieza(id);
    alElegir(id);
  };
  renderer.domElement.addEventListener("pointerdown", alBajar);
  renderer.domElement.addEventListener("pointerup", alSubir);

  // ── AR with surfaces (hit-test + anchors), with a plan B ───────────────────
  let reiniciarAR: (() => void) | null = null;
  let escalaActualAR = 1;
  let sobreSuperficie = false;

  function colocarAlturaBase() {
    // On a surface the bottom of the model rests on it; floating, the model is centered.
    grupo.position.y = sobreSuperficie ? -minimoY * grupo.scale.x : 0;
  }

  async function entrarEnAR(sesion: XRSession, op: OpcionesAR) {
    cancelAnimationFrame(animacion); // in AR requestAnimationFrame does NOT drive rendering: the XR viewer's clock does
    cuadroPendiente = false;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local");
    await renderer.xr.setSession(sesion);
    sesionAR = sesion;

    const fondoPrevio = escena.background;
    escena.background = null; // the real camera is the background: nothing is painted behind
    controles.enabled = false;
    const giroPrevio = grupo.rotation.clone();
    grupo.rotation.set(0, 0, 0);
    escalaActualAR = escalaAR;
    grupo.scale.setScalar(escalaActualAR);

    // Reticle: a ring that follows the surface the phone is looking at.
    const reticulo = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.13, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffcc29 })
    );
    reticulo.matrixAutoUpdate = false;
    reticulo.visible = false;

    let fuente: XRHitTestSource | null = null;
    let ultimoImpacto: XRHitTestResult | null = null;
    let ancla: XRAnchor | null = null;
    let colocado = false;
    let anclado = false;

    if (op.hitTest) {
      try {
        const espacioVisor = await sesion.requestReferenceSpace("viewer");
        fuente = (await sesion.requestHitTestSource?.({ space: espacioVisor })) ?? null;
      } catch {
        fuente = null; // the system said no: fall back to plan B
      }
    }
    const planB = !fuente;

    function buscarSuperficie() {
      ancla?.delete();
      ancla = null;
      colocado = false;
      anclado = false;
      sobreSuperficie = false;
      grupo.visible = false;
      escena.add(reticulo);
      op.alEstado("Mueve el teléfono despacio hasta ver el anillo sobre una superficie y toca para colocar.");
    }

    function flotarDelante() {
      raiz.position.copy(POSICION_PLAN_B);
      sobreSuperficie = false;
      colocarAlturaBase();
      grupo.visible = true;
      colocado = true;
      op.alEstado("Este dispositivo no detecta superficies: el modelo flota a 1,5 m. «Volver a colocar» lo recentra.");
    }

    reiniciarAR = () => {
      escalaActualAR = escalaAR;
      grupo.scale.setScalar(escalaActualAR);
      grupo.rotation.set(0, 0, 0);
      if (planB) flotarDelante();
      else buscarSuperficie();
    };
    if (planB) flotarDelante();
    else buscarSuperficie();

    // A tap on the screen is a "select" event of the session.
    sesion.addEventListener("select", () => {
      if (planB || colocado || !ultimoImpacto) return;
      raiz.position.setFromMatrixPosition(reticulo.matrix);
      sobreSuperficie = true;
      colocarAlturaBase();
      grupo.visible = true;
      reticulo.visible = false;
      escena.remove(reticulo);
      colocado = true;
      const impacto = ultimoImpacto as XRHitTestResult & { createAnchor?: () => Promise<XRAnchor> };
      if (op.anclas && impacto.createAnchor) {
        impacto
          .createAnchor()
          .then((a) => {
            if (!colocado) return a.delete(); // the user restarted while the anchor was being created
            ancla = a;
            anclado = true;
            op.alEstado("Colocado y anclado a la superficie. Arrastra para girar, pellizca para cambiar el tamaño.");
          })
          .catch(() => op.alEstado("Colocado sin ancla (el sistema no pudo crearla). Arrastra para girar."));
      } else {
        op.alEstado("Colocado sin ancla: este dispositivo no las ofrece. Arrastra para girar, pellizca para escalar.");
      }
    });

    renderer.setAnimationLoop((_tiempo, cuadroXR) => {
      const referencia = renderer.xr.getReferenceSpace();
      if (cuadroXR && referencia) {
        if (fuente && !colocado) {
          const impactos = cuadroXR.getHitTestResults(fuente);
          const pose = impactos[0]?.getPose(referencia);
          ultimoImpacto = pose ? impactos[0] : null;
          reticulo.visible = !!pose;
          if (pose) reticulo.matrix.fromArray(pose.transform.matrix);
        }
        if (ancla) {
          // An anchor is re-estimated by the system: follow it every frame.
          const pose = cuadroXR.getPose(ancla.anchorSpace, referencia);
          if (pose) raiz.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
        }
      }
      renderer.render(escena, camara);
    });

    sesion.addEventListener(
      "end",
      () => {
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;
        sesionAR = null;
        reiniciarAR = null;
        fuente?.cancel();
        ancla?.delete();
        escena.remove(reticulo);
        reticulo.geometry.dispose();
        reticulo.material.dispose();
        raiz.position.set(0, 0, 0);
        sobreSuperficie = false;
        grupo.visible = true;
        grupo.position.set(0, 0, 0);
        grupo.scale.setScalar(1);
        grupo.rotation.copy(giroPrevio);
        escena.background = fondoPrevio;
        controles.enabled = !porSensores;
        ajustarTamano(); // the XR viewer changed the canvas size
        pedirDibujo(); // the on-demand drawing resumes
        op.alTerminar({ colocado, anclado, planB });
      },
      { once: true }
    );
  }

  const aGrados = (r: number) => Math.round((r * 180) / Math.PI);
  return {
    mostrarModelo,
    elegirPieza,
    alElegirPieza(callback) {
      alElegir = callback;
    },
    rotarHacia(x, y) {
      objetivoX = x;
      objetivoY = y;
      pedirDibujo();
    },
    controlPorSensores(activo) {
      porSensores = activo;
      controles.enabled = !activo;
      if (!activo) grupo.rotation.set(0, 0, 0);
      pedirDibujo();
    },
    rotacionActualGrados() {
      return { x: aGrados(grupo.rotation.x), y: aGrados(grupo.rotation.y) };
    },
    fondoTransparente(activo) {
      escena.background = activo ? null : COLOR_FONDO;
      pedirDibujo();
    },
    entrarEnAR,
    reiniciarColocacion() {
      reiniciarAR?.();
    },
    gestoAR(giroY, factorEscala) {
      if (!sesionAR || !grupo.visible) return;
      grupo.rotation.y += giroY;
      escalaActualAR = Math.min(escalaAR * 3, Math.max(escalaAR * 0.3, escalaActualAR * factorEscala));
      grupo.scale.setScalar(escalaActualAR);
      colocarAlturaBase();
    },
    destruir() {
      cancelAnimationFrame(animacion);
      window.removeEventListener("resize", ajustarTamano);
      renderer.domElement.removeEventListener("pointerdown", alBajar);
      renderer.domElement.removeEventListener("pointerup", alSubir);
      vaciarModelo();
      controles.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
