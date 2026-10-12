// Lee un flujo de líneas JSON (una por evento) que puede llegar partido en
// trozos de cualquier tamaño.

import type { Evento } from './protocolo';

const TIPOS = new Set(['inicio', 'captura', 'informe', 'error']);

function esEvento(valor: unknown): valor is Evento {
  return typeof valor === 'object' && valor !== null && TIPOS.has((valor as { t?: string }).t as string);
}

/** Acumula texto y devuelve los eventos completos que ya se pueden entregar. */
export function crearLector() {
  let pendiente = '';
  return {
    añadir(trozo: string): Evento[] {
      pendiente += trozo;
      const lineas = pendiente.split('\n');
      pendiente = lineas.pop() ?? '';
      return lineas.flatMap((linea) => {
        if (!linea.trim()) return [];
        try {
          const valor: unknown = JSON.parse(linea);
          return esEvento(valor) ? [valor] : [];
        } catch {
          return [];
        }
      });
    },
    /** Lo que quedó sin terminar al cerrarse el flujo. */
    terminar(): Evento[] {
      const resto = pendiente;
      pendiente = '';
      return resto.trim() ? this.añadir(`${resto}\n`) : [];
    },
  };
}
