// conexion.ts — the "no connection" band: shown only while the browser is offline.
export function iniciarBandaConexion(banda: HTMLElement): void {
  const actualizar = () => {
    banda.hidden = navigator.onLine;
  };
  window.addEventListener("online", actualizar);
  window.addEventListener("offline", actualizar);
  actualizar();
}
