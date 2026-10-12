// De los hallazgos a la nota.
//
// - Cada hallazgo tiene un peso. «correcto» suma todo, «mejorable» la mitad
//   y «fallo» nada; lo que «no aplica» (o pesa 0) no cuenta.
// - La puntuación es el porcentaje conseguido, de 0 a 100, y de ahí sale la letra.
// - Algunos fallos graves ponen un techo: por muy bien que vaya lo demás, la
//   nota no puede pasar de esa letra.
//
// Los criterios completos, con el porqué de cada peso, irán en docs/CRITERIOS.md.

import type { Categoria, Hallazgo, Letra, Resultado } from './tipos';

const ORDEN: readonly Letra[] = ['F', 'D', 'C', 'B', 'A', 'A+'];

const FACTOR: Record<Exclude<Resultado, 'no-aplica'>, number> = { correcto: 1, mejorable: 0.5, fallo: 0 };

const CATEGORIAS: readonly Categoria[] = ['https', 'dns', 'cabeceras', 'contenido', 'cookies', 'privacidad', 'tecnologias', 'rendimiento'];

export interface Nota {
  puntos: number;
  letra: Letra;
  /** El fallo que limita la nota, solo si de verdad la ha bajado. */
  techo: { id: string; letra: Letra } | null;
  categorias: { id: Categoria; puntos: number | null }[];
}

export function letraPorPuntos(puntos: number): Letra {
  if (puntos >= 97) return 'A+';
  if (puntos >= 90) return 'A';
  if (puntos >= 80) return 'B';
  if (puntos >= 65) return 'C';
  if (puntos >= 50) return 'D';
  return 'F';
}

function porcentaje(hallazgos: readonly Hallazgo[]): number | null {
  let total = 0;
  let ganado = 0;
  for (const hallazgo of hallazgos) {
    if (hallazgo.peso <= 0 || hallazgo.resultado === 'no-aplica') continue;
    total += hallazgo.peso;
    ganado += hallazgo.peso * FACTOR[hallazgo.resultado];
  }
  return total === 0 ? null : Math.round((100 * ganado) / total);
}

export function calcularNota(hallazgos: readonly Hallazgo[]): Nota {
  const puntos = porcentaje(hallazgos) ?? 0;
  const porPuntos = letraPorPuntos(puntos);

  let techo: Nota['techo'] = null;
  for (const hallazgo of hallazgos) {
    if (hallazgo.resultado !== 'fallo' || hallazgo.techo === undefined) continue;
    if (techo === null || ORDEN.indexOf(hallazgo.techo) < ORDEN.indexOf(techo.letra)) {
      techo = { id: hallazgo.id, letra: hallazgo.techo };
    }
  }

  const limitada = techo !== null && ORDEN.indexOf(techo.letra) < ORDEN.indexOf(porPuntos);
  return {
    puntos,
    letra: limitada ? (techo as { letra: Letra }).letra : porPuntos,
    techo: limitada ? techo : null,
    categorias: CATEGORIAS.map((id) => ({ id, puntos: porcentaje(hallazgos.filter((h) => h.categoria === id)) })),
  };
}
