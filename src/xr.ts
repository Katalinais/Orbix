// xr.ts — augmented reality with WebXR (Session 38).
// Unlike the camera background (Session 36), here the browser shows the camera
// and tracks the phone's movement; the page only draws on top.

/** Result of asking "can I use AR here?". */
export type SoporteAR = "disponible" | "contexto-inseguro" | "sin-webxr" | "sin-ar";

/** Support state plus each individual check (to show them on screen). */
export async function diagnosticarAR(): Promise<{ estado: SoporteAR; lineas: string[] }> {
  const lineas: string[] = [];
  const seguro = window.isSecureContext;
  lineas.push(`Contexto seguro (HTTPS o localhost): ${seguro ? "sí" : "NO"}`);
  if (!seguro) return { estado: "contexto-inseguro", lineas };

  lineas.push(`navigator.xr: ${navigator.xr ? "presente" : "AUSENTE"}`);
  if (!navigator.xr) return { estado: "sin-webxr", lineas };

  try {
    // Answers whether the DEVICE can open that mode; it neither asks permission nor opens anything.
    const ok = await navigator.xr.isSessionSupported("immersive-ar");
    lineas.push(`isSessionSupported("immersive-ar"): ${ok}`);
    return { estado: ok ? "disponible" : "sin-ar", lineas };
  } catch (err) {
    lineas.push(`isSessionSupported("immersive-ar") lanzó: ${err instanceof Error ? err.name : String(err)}`);
    return { estado: "sin-ar", lineas };
  }
}

export function mensajeSoporteAR(estado: SoporteAR): string {
  switch (estado) {
    case "disponible":
      return "Este dispositivo puede abrir una sesión de realidad aumentada.";
    case "contexto-inseguro":
      return "La realidad aumentada exige HTTPS o localhost.";
    case "sin-webxr":
      return "Este navegador no ofrece WebXR (por ejemplo, Safari en iPhone o Firefox). El visor 3D sigue funcionando.";
    case "sin-ar":
      return "Este dispositivo no admite realidad aumentada en el navegador (por ejemplo, un computador de escritorio sin el emulador activado).";
  }
}

/**
 * Requests the AR session. MUST be called from a click handler: without a user
 * gesture the browser rejects it with SecurityError.
 */
export function pedirSesionAR(overlay: HTMLElement | null): Promise<XRSession> {
  const opciones: XRSessionInit & { domOverlay?: { root: Element } } = {
    requiredFeatures: ["local"], // the origin (0,0,0) is where the user is when the session starts
    optionalFeatures: ["dom-overlay"], // if granted, the "Exit" button is drawn over the camera
  };
  if (overlay) opciones.domOverlay = { root: overlay };
  return navigator.xr!.requestSession("immersive-ar", opciones);
}

/** Explains to the user why requestSession failed. */
export function describirErrorAR(err: unknown): string {
  const nombre = err instanceof Error ? err.name : "";
  switch (nombre) {
    case "NotSupportedError":
      return "Este dispositivo no puede abrir realidad aumentada con las funciones que pide la app.";
    case "SecurityError":
      return "El navegador rechazó la sesión de realidad aumentada: se denegó el permiso o la petición no vino de un toque del usuario.";
    default:
      return "No se pudo iniciar la realidad aumentada. Inténtalo de nuevo.";
  }
}
