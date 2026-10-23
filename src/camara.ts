// camara.ts — the camera as a live background for the 3D viewer (Session 36, mirrors Session 24).
// Permissions, constraints and getUserMedia errors were covered in Session 24.
// What differs here: the stream stays OPEN as a background instead of opening
// briefly for a photo, so it has to be shut off in time.

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

/** Maps a getUserMedia error to a user-facing message (mapping corrected against MDN). */
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
      // On an HTTP page navigator.mediaDevices is undefined, so the call throws TypeError.
      return "La cámara solo está disponible en una página segura (HTTPS o localhost).";
    default:
      return "No se pudo abrir la cámara. El visor sigue funcionando sin ella.";
  }
}
