// Firma de informes. Solo se puede compartir un informe que ha salido de este servidor y no se ha tocado:
// sin firma, cualquiera podría publicar con nuestra marca un informe inventado.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** JSON con las claves ordenadas: el mismo informe da siempre el mismo texto, lo reordene quien lo reordene. */
export function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    // Igual que JSON: las propiedades con valor «undefined» no existen (así el informe firmado y el que vuelve del navegador coinciden).
    const claves = Object.keys(valor)
      .filter((k) => (valor as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

function marca(informe: unknown, instante: number, secreto: string): string {
  return createHmac('sha256', secreto)
    .update(`${instante}.${canonico(informe)}`)
    .digest('hex');
}

/** «instante.firma»: el instante va dentro para poder caducar la firma. */
export function firmarInforme(informe: unknown, secreto: string, ahora: number): string {
  return `${ahora}.${marca(informe, ahora, secreto)}`;
}

/** Una firma vale una hora: da tiempo de sobra a pulsar el botón y no sirve para guardar informes viejos. */
export const VIGENCIA_FIRMA_MS = 60 * 60 * 1000;

export function firmaValida(informe: unknown, firma: string, secreto: string, ahora: number): boolean {
  const partes = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(firma);
  if (!partes) return false;
  const instante = Number(partes[1]);
  if (ahora - instante > VIGENCIA_FIRMA_MS || instante - ahora > 60_000) return false;
  const esperada = Buffer.from(marca(informe, instante, secreto), 'hex');
  const recibida = Buffer.from(partes[2], 'hex');
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
