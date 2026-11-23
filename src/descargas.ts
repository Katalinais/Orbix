// descargas.ts — long-form model sheets (fichas), fetched on demand.
// The Service Worker caches /modelos/ responses, so a sheet read (or downloaded)
// once keeps working offline.
import { BASE } from "./base";
import type { FichaAmpliada } from "./modelos/tipos";

// BASE is "/" locally and "/repo-name/" on GitHub Pages: never write absolute paths by hand.
export const urlDeModelo = (id: string) => `${BASE}modelos/${id}.json`;

export async function cargarFicha(id: string): Promise<FichaAmpliada> {
  const respuesta = await fetch(urlDeModelo(id));
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return (await respuesta.json()) as FichaAmpliada;
}

/** Downloads every sheet so they can be read without a connection. */
export async function descargarFichas(ids: string[]): Promise<{ guardadas: number; fallidas: number }> {
  const resultados = await Promise.allSettled(ids.map((id) => cargarFicha(id)));
  const guardadas = resultados.filter((r) => r.status === "fulfilled").length;
  return { guardadas, fallidas: ids.length - guardadas };
}
