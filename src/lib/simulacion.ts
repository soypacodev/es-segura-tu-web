// «¿Y si arreglo esto?»: recalcula la nota suponiendo que ciertos hallazgos
// pasan a estar bien. Usa el mismo cálculo que el análisis real.

import type { Hallazgo } from './analisis/tipos';
import { calcularNota, type Nota } from './analisis/puntuacion';

/** Un hallazgo se puede arreglar (y se puede simular) si cuenta para la nota y no está ya bien. */
export const sePuedeArreglar = (h: Hallazgo) => h.peso > 0 && (h.resultado === 'fallo' || h.resultado === 'mejorable');

export function simular(hallazgos: readonly Hallazgo[], arreglados: ReadonlySet<string>): Nota {
  return calcularNota(
    hallazgos.map((h) => (arreglados.has(h.id) && sePuedeArreglar(h) ? { ...h, resultado: 'correcto' as const } : h)),
  );
}

/**
 * Lo que conviene arreglar primero: lo que quita el techo de la nota y,
 * después, lo que más puntos devuelve.
 */
export function ordenarPorUrgencia(hallazgos: readonly Hallazgo[]): Hallazgo[] {
  const perdido = (h: Hallazgo) => h.peso * (h.resultado === 'fallo' ? 1 : 0.5);
  return hallazgos
    .filter(sePuedeArreglar)
    .map((h, i) => ({ h, i }))
    .sort((x, y) => {
      const techoX = x.h.resultado === 'fallo' && x.h.techo !== undefined ? 1 : 0;
      const techoY = y.h.resultado === 'fallo' && y.h.techo !== undefined ? 1 : 0;
      return techoY - techoX || perdido(y.h) - perdido(x.h) || x.i - y.i;
    })
    .map((x) => x.h);
}
