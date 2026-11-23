// tipos.ts — the 3D models are data, not code: the viewer draws whatever it is given.

/** One part of an architecture, drawn as a box. Sizes and positions are in scene units. */
export interface Pieza {
  id: string;
  nombre: string;
  descripcion: string;
  color: number;
  posicion: [number, number, number];
  tamano: [number, number, number];
}

export interface Modelo {
  id: string;
  nombre: string;
  resumen: string;
  piezas: Pieza[];
}

/** Long-form sheet, fetched on demand from public/modelos/<id>.json (and cached for offline use). */
export interface FichaAmpliada {
  id: string;
  titulo: string;
  detalle: string[];
  cuandoUsarlo: string;
  ventajas: string[];
  riesgos: string[];
}
