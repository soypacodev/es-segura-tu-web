import type { Letra } from './analisis/tipos';

/** De mejor a peor, como se muestra en la escala. */
export const LETRAS_DE_MEJOR_A_PEOR: readonly Letra[] = ['A+', 'A', 'B', 'C', 'D', 'F'];

export const claseDeLetra = (letra: Letra) => (letra === 'A+' ? 'a-plus' : letra.toLowerCase());

export const colorDeLetra = (letra: Letra) => `var(--nota-${letra === 'A+' ? 'aplus' : letra.toLowerCase()})`;
