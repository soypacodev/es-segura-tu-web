// Valida y normaliza lo que la persona escribe en el campo de la web.
// Es la primera barrera: lo que pasa de aquí se vuelve a comprobar al
// conectar (ver descarga.ts), porque un nombre válido puede apuntar a
// cualquier sitio.

import { isIP } from 'node:net';

export type MotivoObjetivo =
  | 'vacio'
  | 'demasiado-largo'
  | 'protocolo'
  | 'credenciales'
  | 'puerto'
  | 'ip-literal'
  | 'host-invalido'
  | 'host-interno';

export type ResultadoObjetivo = { ok: true; url: URL; host: string } | { ok: false; motivo: MotivoObjetivo };

const LONGITUD_MAXIMA = 2048;

/** Terminaciones reservadas o de redes internas: nunca son una web pública. */
const TERMINACIONES_INTERNAS = new Set([
  'localhost',
  'local',
  'internal',
  'lan',
  'home',
  'corp',
  'intranet',
  'test',
  'invalid',
  'example',
  'onion',
  'arpa',
]);

const CON_ESQUEMA = /^[a-z][a-z0-9+.-]*:\/\//i;
const ESQUEMA_SIN_BARRAS = /^(?:javascript|data|file|mailto|tel|blob|about|view-source|vbscript):/i;
const ETIQUETA = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

export function normalizarObjetivo(entrada: string): ResultadoObjetivo {
  const texto = entrada.trim();
  if (texto === '') return { ok: false, motivo: 'vacio' };
  if (texto.length > LONGITUD_MAXIMA) return { ok: false, motivo: 'demasiado-largo' };
  if (ESQUEMA_SIN_BARRAS.test(texto)) return { ok: false, motivo: 'protocolo' };

  let url: URL;
  try {
    url = new URL(CON_ESQUEMA.test(texto) ? texto : `https://${texto}`);
  } catch {
    return { ok: false, motivo: 'host-invalido' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, motivo: 'protocolo' };
  if (url.username !== '' || url.password !== '') return { ok: false, motivo: 'credenciales' };
  // Los puertos por defecto (80 y 443) los quita el propio URL: cualquier otro sobra.
  if (url.port !== '') return { ok: false, motivo: 'puerto' };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || isIP(host) !== 0) return { ok: false, motivo: 'ip-literal' };
  if (host === '' || host.length > 253) return { ok: false, motivo: 'host-invalido' };

  const etiquetas = host.split('.');
  if (etiquetas.length < 2) return { ok: false, motivo: 'host-interno' };
  if (!etiquetas.every((etiqueta) => ETIQUETA.test(etiqueta))) return { ok: false, motivo: 'host-invalido' };

  const terminacion = etiquetas[etiquetas.length - 1];
  if (/^\d+$/.test(terminacion)) return { ok: false, motivo: 'host-invalido' };
  if (TERMINACIONES_INTERNAS.has(terminacion)) return { ok: false, motivo: 'host-interno' };

  url.hostname = host;
  url.hash = '';
  return { ok: true, url, host };
}
