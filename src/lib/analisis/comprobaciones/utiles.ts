import type { RespuestaCapturada } from '../tipos';

/** Valor de una cabecera; si se repite, los valores se unen con coma (como hacen los navegadores). */
export function valorCabecera(respuesta: RespuestaCapturada, nombre: string): string | undefined {
  const valores = respuesta.cabeceras[nombre];
  return valores !== undefined && valores.length > 0 ? valores.join(', ') : undefined;
}
