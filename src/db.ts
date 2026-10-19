// db.ts — envoltorio en promesas de IndexedDB para el progreso del Atlas 3D.
// Mismo patrón de la Sesión 22 (Gestor de Tareas), reescrito aquí con los
// nombres reales del Atlas 3D — sin cambiar cómo funciona por dentro.
// Sesión 33, sección 2 y 3.

const NOMBRE_DB = "atlas3d-progreso-db";
const VERSION_DB = 1;

export interface ProgresoModelo {
  modeloId: string;
  favorito: boolean;
  ultimaVisita: number | null;
  notaCifrada: ArrayBuffer | null;
  notaIv: Uint8Array | null;
}

/** Abre (o crea) la base de datos de progreso. */
export function abrirBaseDeDatos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE_DB, VERSION_DB);

    peticion.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const store = db.createObjectStore("progreso", { keyPath: "modeloId" });
      store.createIndex("porFavorito", "favorito", { unique: false });
      store.createIndex("porUltimaVisita", "ultimaVisita", { unique: false });
    };

    peticion.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    peticion.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
}

/** Marca un modelo como visitado ahora. put(): crea o actualiza, nunca falla por clave repetida. */
export function marcarModeloVisto(db: IDBDatabase, modeloId: string): Promise<ProgresoModelo> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progreso", "readwrite");
    const store = tx.objectStore("progreso");
    const peticion = store.get(modeloId);

    peticion.onsuccess = () => {
      const registro: ProgresoModelo =
        peticion.result || { modeloId, favorito: false, ultimaVisita: null, notaCifrada: null, notaIv: null };
      registro.ultimaVisita = Date.now();
      const escritura = store.put(registro);
      escritura.onsuccess = () => resolve(registro);
      escritura.onerror = () => reject(escritura.error);
    };
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Alterna el favorito de un modelo. Devuelve el nuevo estado. */
export function alternarFavorito(db: IDBDatabase, modeloId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progreso", "readwrite");
    const store = tx.objectStore("progreso");
    const peticion = store.get(modeloId);

    peticion.onsuccess = () => {
      const registro: ProgresoModelo =
        peticion.result || { modeloId, favorito: false, ultimaVisita: null, notaCifrada: null, notaIv: null };
      registro.favorito = !registro.favorito;
      const escritura = store.put(registro);
      escritura.onsuccess = () => resolve(registro.favorito);
      escritura.onerror = () => reject(escritura.error);
    };
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Trae todos los registros de progreso (para pintar el estado inicial de la demo). */
export function obtenerTodoElProgreso(db: IDBDatabase): Promise<ProgresoModelo[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progreso", "readonly");
    const peticion = tx.objectStore("progreso").getAll();
    peticion.onsuccess = () => resolve(peticion.result as ProgresoModelo[]);
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Recorre con un cursor, por el índice porFavorito, los modelos marcados como favoritos. */
export function obtenerFavoritos(db: IDBDatabase): Promise<ProgresoModelo[]> {
  return new Promise((resolve) => {
    const resultado: ProgresoModelo[] = [];
    const indice = db.transaction("progreso", "readonly").objectStore("progreso").index("porFavorito");
    const cursor = indice.openCursor(IDBKeyRange.only(true as any));

    cursor.onsuccess = (event) => {
      const c = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (c) {
        resultado.push(c.value as ProgresoModelo);
        c.continue();
      } else {
        resolve(resultado);
      }
    };
  });
}

/** Guarda (cifrada) la nota de estudio de un modelo. Sesión 33, sección 4. */
export async function guardarNotaDeEstudio(
  db: IDBDatabase,
  clave: CryptoKey,
  modeloId: string,
  texto: string,
  cifrarTexto: (clave: CryptoKey, texto: string) => Promise<{ cifrado: ArrayBuffer; iv: Uint8Array }>
): Promise<void> {
  const { cifrado, iv } = await cifrarTexto(clave, texto);
  const tx = db.transaction("progreso", "readwrite");
  const store = tx.objectStore("progreso");
  const existente = await new Promise<ProgresoModelo | undefined>((resolve) => {
    store.get(modeloId).onsuccess = (e) => resolve((e.target as IDBRequest).result);
  });
  const registro: ProgresoModelo = existente || { modeloId, favorito: false, ultimaVisita: null, notaCifrada: null, notaIv: null };
  registro.notaCifrada = cifrado;
  registro.notaIv = iv;
  return new Promise((resolve, reject) => {
    const escritura = store.put(registro);
    escritura.onsuccess = () => resolve();
    escritura.onerror = () => reject(escritura.error);
  });
}
