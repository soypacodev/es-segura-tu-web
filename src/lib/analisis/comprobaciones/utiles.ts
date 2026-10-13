import type { Categoria, Hallazgo, RespuestaCapturada } from '../tipos';

/** Valor de una cabecera; si se repite, los valores se unen con coma (como hacen los navegadores). */
export function valorCabecera(respuesta: RespuestaCapturada, nombre: string): string | undefined {
  const valores = respuesta.cabeceras[nombre];
  return valores !== undefined && valores.length > 0 ? valores.join(', ') : undefined;
}

/** Un constructor de hallazgos de una categoría: `const h = hallazgoDe('cookies'); h('cookies.secure', 'fallo', 'alta', 8, {…})`. */
export const hallazgoDe =
  (categoria: Categoria) =>
  (id: string, resultado: Hallazgo['resultado'], gravedad: Hallazgo['gravedad'], peso: number, datos?: Hallazgo['datos']): Hallazgo => ({
    id,
    categoria,
    resultado,
    gravedad,
    peso,
    ...(datos ? { datos } : {}),
  });

/** Cuántos nombres se listan en un hallazgo; si hay más, se dice cuántos faltan (nunca se recorta sin decirlo). */
export const MAX_NOMBRES = 5;

/** Los primeros nombres, cuántos hay en total y, si sobran, cuántos no se listan. */
export function datosDeLista(nombres: readonly string[]): Hallazgo['datos'] {
  return { nombres: nombres.slice(0, MAX_NOMBRES), total: nombres.length, ...(nombres.length > MAX_NOMBRES ? { mas: nombres.length - MAX_NOMBRES } : {}) };
}
