// Comprobaciones de dominio y correo a partir de sus registros DNS:
// SPF y DMARC (quién puede enviar correo en nombre del dominio) y CAA
// (quién puede emitir certificados para él).
//
// Si el DNS no contesta, esa comprobación «no aplica»: no se sabe, y no se
// acusa a nadie de lo que no se ha podido ver. No se mira DKIM (hace falta
// conocer el «selector» de cada proveedor) ni DNSSEC.

import type { CapturaDns, CapturaSitio, ConsultaDns, Hallazgo } from '../tipos';
import { hallazgoDe } from './utiles';

const h = hallazgoDe('dns');

/** Qué hace el registro SPF con lo que no está en su lista, según su primer «all» (el primer mecanismo que encaja gana; lo que va detrás no se evalúa). */
export type PoliticaSpf = '-all' | '~all' | '?all' | '+all' | 'sin-all' | 'redirect';

export function politicaSpf(registro: string): PoliticaSpf {
  const todos = [...registro.matchAll(/(?:^|\s)([+\-~?]?)all(?=\s|$)/gi)];
  if (todos.length > 0) return `${todos[0][1] || '+'}all` as PoliticaSpf;
  return /(?:^|\s)redirect=/i.test(registro) ? 'redirect' : 'sin-all';
}

export const registrosSpf = (txt: string[]) => txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
export const registrosDmarc = (txt: string[]) => txt.filter((t) => /^v=dmarc1\s*(;|$)/i.test(t.trim()));

export interface EtiquetasDmarc {
  p: string | null;
  pct: number | null;
}

export function etiquetasDmarc(registro: string): EtiquetasDmarc {
  const mapa = new Map<string, string>();
  for (const trozo of registro.split(';')) {
    const igual = trozo.indexOf('=');
    if (igual === -1) continue;
    const clave = trozo.slice(0, igual).trim().toLowerCase();
    if (!mapa.has(clave)) mapa.set(clave, trozo.slice(igual + 1).trim());
  }
  const pct = mapa.get('pct');
  return { p: mapa.get('p')?.toLowerCase() ?? null, pct: pct !== undefined && /^\d{1,3}$/.test(pct) ? Number(pct) : null };
}

/** true si el dominio recibe correo, false si declara que no, null si no se sabe. */
function recibeCorreo(mx: ConsultaDns<string>): boolean | null {
  if (mx.estado === 'error') return null;
  if (mx.estado === 'vacio') return false;
  // «0 .» (MX nulo, RFC 7505) es la forma de decir «este dominio no recibe correo».
  return mx.valores.some((m) => m !== '' && m !== '.');
}

const valores = (c: ConsultaDns<string>) => (c.estado === 'ok' ? c.valores : []);

function comprobarSpf(d: CapturaDns, correo: boolean | null): Hallazgo {
  const id = 'dns.spf';
  if (d.txt.estado === 'error') return h(id, 'no-aplica', 'alta', 6);
  const spf = registrosSpf(valores(d.txt));
  if (spf.length === 0) return correo === true ? h(id, 'fallo', 'alta', 6, { motivo: 'sin-registro', correo: true }) : h(id, 'mejorable', 'media', 6, { motivo: 'sin-registro', correo: correo === false ? false : null });
  if (spf.length > 1) return h(id, 'fallo', 'alta', 6, { motivo: 'duplicado', total: spf.length });
  const politica = politicaSpf(spf[0]);
  if (politica === '+all') return h(id, 'fallo', 'alta', 6, { motivo: 'abierto' });
  if (politica === '?all' || politica === 'sin-all') return h(id, 'mejorable', 'media', 6, { motivo: 'permisivo', politica });
  return h(id, 'correcto', 'alta', 6, { politica });
}

function comprobarDmarc(d: CapturaDns, correo: boolean | null): Hallazgo {
  const id = 'dns.dmarc';
  if (d.dmarc.estado === 'error') return h(id, 'no-aplica', 'alta', 8);
  const dmarc = registrosDmarc(valores(d.dmarc));
  if (dmarc.length === 0) return correo === true ? h(id, 'fallo', 'alta', 8, { motivo: 'sin-registro', correo: true }) : h(id, 'mejorable', 'media', 8, { motivo: 'sin-registro', correo: correo === false ? false : null });
  if (dmarc.length > 1) return h(id, 'fallo', 'alta', 8, { motivo: 'duplicado', total: dmarc.length });
  const { p, pct } = etiquetasDmarc(dmarc[0]);
  if (p !== 'none' && p !== 'quarantine' && p !== 'reject') return h(id, 'mejorable', 'media', 8, { motivo: 'sin-politica' });
  if (p === 'none') return h(id, 'mejorable', 'media', 8, { motivo: 'solo-observar' });
  if (pct !== null && pct < 100) return h(id, 'mejorable', 'media', 8, { motivo: 'parcial', pct, politica: p });
  return h(id, 'correcto', 'alta', 8, { politica: p });
}

function comprobarCaa(d: CapturaDns): Hallazgo {
  const id = 'dns.caa';
  if (d.caa.estado === 'error') return h(id, 'no-aplica', 'baja', 3);
  return d.caa.estado === 'ok' ? h(id, 'correcto', 'baja', 3) : h(id, 'mejorable', 'baja', 3);
}

export function comprobarDns(captura: CapturaSitio): Hallazgo[] {
  const d = captura.dns;
  if (!captura.https.ok || d === undefined) return [];
  const correo = recibeCorreo(d.mx);
  return [comprobarSpf(d, correo), comprobarDmarc(d, correo), comprobarCaa(d)];
}
