// Geometría del gráfico de radar: de las puntuaciones por categoría a los
// puntos del polígono. Va aparte del componente para poder probarla.

export interface PuntoRadar {
  x: number;
  y: number;
}

/** Con menos de tres ejes con nota el radar es una línea o un punto: no dice nada. */
export const MINIMO_EJES_RADAR = 3;

/** Punto del eje `indice` (de `total`), a la fracción `fraccion` (0 a 1) del radio. El primer eje apunta hacia arriba y se avanza en sentido horario. */
export function puntoDeEje(indice: number, total: number, fraccion: number, centro: number, radio: number): PuntoRadar {
  const angulo = (2 * Math.PI * indice) / total - Math.PI / 2;
  return { x: centro + Math.cos(angulo) * radio * fraccion, y: centro + Math.sin(angulo) * radio * fraccion };
}

export const comoPuntos = (puntos: readonly PuntoRadar[]) => puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Se dibuja solo con las categorías que tienen nota. */
export function ejesConNota<T extends { puntos: number | null }>(categorias: readonly T[]): (T & { puntos: number })[] {
  return categorias.filter((c): c is T & { puntos: number } => c.puntos !== null);
}
