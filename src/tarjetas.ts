// tarjetas.ts — progress cards (favorite, last visit, encrypted study note).
// The cards are built ONCE. Afterwards each action updates only the parts of its
// own card: re-rendering the whole catalog would erase a note typed in another card.
import { abrirBaseDeDatos, marcarModeloVisto, alternarFavorito, obtenerTodoElProgreso, guardarNotaDeEstudio } from "./db";
import type { ProgresoModelo } from "./db";
import { derivarClaveDesdeContrasena, cifrarTexto, descifrarTexto, obtenerOCrearSal } from "./crypto";
import type { Modelo } from "./modelos/tipos";

let claveSesion: CryptoKey | null = null;

async function obtenerClaveSesion(): Promise<CryptoKey | null> {
  if (claveSesion) return claveSesion;
  const contrasena = window.prompt(
    "Contraseña para cifrar/descifrar la nota de estudio (la misma cada vez — no se guarda en ningún lado):"
  );
  if (!contrasena) return null;
  claveSesion = await derivarClaveDesdeContrasena(contrasena, obtenerOCrearSal());
  return claveSesion;
}

export async function iniciarTarjetas(contenedor: HTMLElement, modelos: Modelo[]): Promise<void> {
  contenedor.innerHTML = `
    <div class="atlas-demo">
      <h2>Mi progreso</h2>
      <p class="aviso-demo">Marca lo que ya estudiaste y guarda una nota cifrada por modelo.</p>
      <div class="modelos-grid">
        ${modelos
          .map(
            (m) => `
          <article class="modelo-card" data-id="${m.id}">
            <h3>${m.nombre}</h3>
            <p class="meta">Última visita: nunca</p>
            <div class="acciones">
              <button type="button" class="btn-visitar">Marcar como visto</button>
              <button type="button" class="btn-favorito">☆ Marcar favorito</button>
            </div>
            <div class="nota-zona">
              <input type="text" class="nota-input" placeholder="Nota de estudio..." aria-label="Nota de estudio de ${m.nombre}" />
              <button type="button" class="btn-guardar-nota">🔒 Guardar nota</button>
              <button type="button" class="btn-ver-nota" disabled>👁 Ver nota</button>
            </div>
          </article>`
          )
          .join("")}
      </div>
    </div>`;

  const db = await abrirBaseDeDatos();
  const progreso = new Map<string, ProgresoModelo>(
    (await obtenerTodoElProgreso(db)).map((p) => [p.modeloId, p])
  );

  const tarjeta = (id: string) => contenedor.querySelector<HTMLElement>(`.modelo-card[data-id="${id}"]`)!;

  /** Refreshes only what depends on the stored record; never touches the note input. */
  function pintar(id: string) {
    const p = progreso.get(id);
    const card = tarjeta(id);
    card.querySelector(".meta")!.textContent =
      `Última visita: ${p?.ultimaVisita ? new Date(p.ultimaVisita).toLocaleString() : "nunca"}`;
    card.querySelector(".btn-favorito")!.textContent = p?.favorito ? "★ Favorito" : "☆ Marcar favorito";
    card.querySelector<HTMLButtonElement>(".btn-ver-nota")!.disabled = !p?.notaCifrada;
  }

  async function recargar(id: string) {
    const todo = await obtenerTodoElProgreso(db);
    todo.forEach((p) => progreso.set(p.modeloId, p));
    pintar(id);
  }

  for (const m of modelos) {
    const card = tarjeta(m.id);
    pintar(m.id);

    card.querySelector(".btn-visitar")!.addEventListener("click", async () => {
      progreso.set(m.id, await marcarModeloVisto(db, m.id));
      pintar(m.id);
    });

    card.querySelector(".btn-favorito")!.addEventListener("click", async () => {
      await alternarFavorito(db, m.id);
      await recargar(m.id);
    });

    card.querySelector(".btn-guardar-nota")!.addEventListener("click", async () => {
      const entrada = card.querySelector<HTMLInputElement>(".nota-input")!;
      if (!entrada.value.trim()) return;
      const clave = await obtenerClaveSesion();
      if (!clave) return;
      await guardarNotaDeEstudio(db, clave, m.id, entrada.value, cifrarTexto);
      entrada.value = ""; // saved: the field is free again
      await recargar(m.id);
    });

    card.querySelector(".btn-ver-nota")!.addEventListener("click", async () => {
      const p = progreso.get(m.id);
      if (!p?.notaCifrada || !p.notaIv) return;
      const clave = await obtenerClaveSesion();
      if (!clave) return;
      try {
        const texto = await descifrarTexto(clave, { cifrado: p.notaCifrada, iv: p.notaIv });
        window.alert(`Nota de estudio de "${m.nombre}":\n\n${texto}`);
      } catch {
        window.alert("No se pudo descifrar — la contraseña ingresada no es la correcta.");
      }
    });
  }
}
