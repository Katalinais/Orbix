// rastro.ts — a small trace of the last AR session, kept in localStorage so the
// page can say what happened even after a reload. Purely informative.
const CLAVE = "atlas3d-rastro-ar";

export interface RastroAR {
  fecha: number;
  modeloId: string;
  colocado: boolean;
  anclado: boolean;
  planB: boolean;
  sesiones: number;
}

export function leerRastro(): RastroAR | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? (JSON.parse(crudo) as RastroAR) : null;
  } catch {
    return null;
  }
}

export function guardarRastro(datos: Omit<RastroAR, "fecha" | "sesiones">): RastroAR {
  const rastro: RastroAR = { ...datos, fecha: Date.now(), sesiones: (leerRastro()?.sesiones ?? 0) + 1 };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(rastro));
  } catch {
    // Storage may be blocked (private window): the trace is optional.
  }
  return rastro;
}

export function describirRastro(r: RastroAR | null): string {
  if (!r) return "Aún no has abierto ninguna sesión de realidad aumentada.";
  const como = r.planB
    ? "sin detectar superficies (el modelo flotó)"
    : r.colocado
      ? r.anclado
        ? "colocado sobre una superficie y anclado"
        : "colocado sobre una superficie, sin ancla"
      : "sin llegar a colocar el modelo";
  return `Última sesión de AR: ${new Date(r.fecha).toLocaleString()} · ${r.modeloId} · ${como} · sesiones en total: ${r.sesiones}.`;
}
