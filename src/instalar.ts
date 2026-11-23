// instalar.ts — the "Instalar" button (beforeinstallprompt) and its fallbacks.

// beforeinstallprompt is not in the standard DOM typings.
interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const estaInstalada = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const esIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function iniciarInstalacion(boton: HTMLButtonElement, aviso: HTMLElement): void {
  if (estaInstalada()) {
    aviso.textContent = "Estás usando la app instalada.";
    return;
  }
  if (esIPhone()) {
    // iOS never fires beforeinstallprompt: the only way is the share menu.
    aviso.textContent = "En iPhone: toca Compartir y luego «Añadir a pantalla de inicio».";
    return;
  }

  let evento: EventoInstalacion | null = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the event so the prompt opens from OUR button
    evento = e as EventoInstalacion;
    boton.hidden = false;
  });

  boton.addEventListener("click", async () => {
    if (!evento) return;
    const guardado = evento;
    evento = null; // the event can be used only once
    boton.hidden = true;
    await guardado.prompt();
    const { outcome } = await guardado.userChoice;
    aviso.textContent =
      outcome === "accepted"
        ? "Instalando Atlas 3D…"
        : "Cancelaste la instalación. Puedes instalarla más tarde desde el menú del navegador.";
  });

  window.addEventListener("appinstalled", () => {
    boton.hidden = true;
    aviso.textContent = "Atlas 3D quedó instalado.";
  });
}
