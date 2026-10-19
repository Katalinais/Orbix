// camara.ts — la cámara como fondo vivo del visor 3D (Sesión 36, espejo de la 24).
// El permiso, las constraints y los errores de getUserMedia se estudiaron en
// la Sesión 24. La diferencia de hoy: el flujo queda ABIERTO como fondo, no se
// abre un instante para una foto — por eso hay que apagarlo a tiempo.

export async function iniciarCamaraDeFondo(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function detenerCamaraDeFondo(video: HTMLVideoElement, stream: MediaStream | null): void {
  stream?.getTracks().forEach((pista) => pista.stop());
  video.srcObject = null;
}

/** Traduce el error de getUserMedia a un mensaje para el usuario (mapeo corregido según MDN). */
export function describirErrorCamara(error: unknown): string {
  const nombre = error instanceof Error ? error.name : "";
  switch (nombre) {
    case "NotAllowedError":
      return "Bloqueaste el permiso de cámara. El visor sigue funcionando sin ella.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró una cámara en este dispositivo. El visor sigue funcionando sin ella.";
    case "NotReadableError":
      return "La cámara está ocupada por otra aplicación. Ciérrala y vuelve a intentarlo.";
    case "SecurityError":
      return "El navegador tiene deshabilitado el acceso a la cámara en esta página.";
    case "TypeError":
      // En una página HTTP navigator.mediaDevices es undefined: la llamada lanza TypeError.
      return "La cámara solo está disponible en una página segura (HTTPS o localhost).";
    default:
      return "No se pudo abrir la cámara. El visor sigue funcionando sin ella.";
  }
}
