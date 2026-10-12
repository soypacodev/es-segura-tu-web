// Consultas DNS para las comprobaciones de dominio y correo (SPF, DMARC, CAA).
//
// El análisis recibe un «resolvedor» como parámetro, igual que el
// descargador: con el real se consulta el DNS y en las pruebas se pasa uno
// falso. Solo se piden registros públicos del dominio.

import dns from 'node:dns';
import { getDomain } from 'tldts';
import type { CapturaDns, ConsultaDns } from './tipos';

export interface RegistroMx {
  exchange: string;
  priority: number;
}
export interface RegistroCaa {
  critical?: number;
  issue?: string;
  issuewild?: string;
  iodef?: string;
}

/** Cada método lanza el error del DNS tal cual (con su «code») si la consulta no se pudo hacer o no hay registros. */
export interface Resolvedor {
  txt(nombre: string): Promise<string[][]>;
  mx(nombre: string): Promise<RegistroMx[]>;
  caa(nombre: string): Promise<RegistroCaa[]>;
  /** Servidores de nombres del dominio: todo dominio registrado tiene, así que sirve para comprobar que el DNS contesta de verdad. */
  ns(nombre: string): Promise<string[]>;
}

export const TIEMPO_DNS_MS = 3_000;

export function resolvedorReal(): Resolvedor {
  const r = new dns.promises.Resolver({ timeout: TIEMPO_DNS_MS, tries: 1 });
  return {
    txt: (n) => r.resolveTxt(n),
    mx: (n) => r.resolveMx(n),
    caa: (n) => r.resolveCaa(n) as Promise<RegistroCaa[]>,
    ns: (n) => r.resolveNs(n),
  };
}

/** Códigos con los que el DNS dice «ese nombre existe pero no tiene ese registro» o «ese nombre no existe». */
const SIN_REGISTRO = new Set(['ENODATA', 'ENOTFOUND']);

/** Distingue «no hay registros» (dato válido) de «no se pudo preguntar» (no se sabe). */
export async function consultar<T>(pregunta: () => Promise<T[]>): Promise<ConsultaDns<T>> {
  try {
    const valores = await pregunta();
    return valores.length > 0 ? { estado: 'ok', valores } : { estado: 'vacio' };
  } catch (e) {
    const codigo = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
    return SIN_REGISTRO.has(codigo) ? { estado: 'vacio' } : { estado: 'error' };
  }
}

/** El dominio que se registra (ejemplo.co.uk para www.tienda.ejemplo.co.uk), o null si no lo hay (una IP, «localhost»…). */
export const dominioRegistrable = (host: string): string | null => getDomain(host);

const aTexto = (c: ConsultaDns<string[]>): ConsultaDns<string> =>
  c.estado === 'ok' ? { estado: 'ok', valores: c.valores.map((trozos) => trozos.join('')) } : c;

function mapear<A, B>(c: ConsultaDns<A>, f: (a: A) => B): ConsultaDns<B> {
  return c.estado === 'ok' ? { estado: 'ok', valores: c.valores.map(f) } : c;
}

/** Los CAA que valen son los del nombre consultado y, si no tiene, los de su dominio. Si algo no se pudo preguntar, no se sabe. */
export function combinarCaa(host: ConsultaDns<string>, dominio: ConsultaDns<string>): ConsultaDns<string> {
  if (host.estado === 'ok') return host;
  if (dominio.estado === 'ok') return dominio;
  return host.estado === 'error' || dominio.estado === 'error' ? { estado: 'error' } : { estado: 'vacio' };
}

const textoCaa = (r: RegistroCaa) => [r.issue && `issue ${r.issue}`, r.issuewild && `issuewild ${r.issuewild}`, r.iodef && `iodef ${r.iodef}`].filter(Boolean).join(' ') || 'caa';

export async function capturarDns(host: string, resolvedor: Resolvedor): Promise<CapturaDns | null> {
  const dominio = dominioRegistrable(host);
  if (dominio === null) return null;
  const [ns, txt, dmarc, mx, caaHost, caaDominio] = await Promise.all([
    consultar(() => resolvedor.ns(dominio)),
    consultar(() => resolvedor.txt(dominio)),
    consultar(() => resolvedor.txt(`_dmarc.${dominio}`)),
    consultar(() => resolvedor.mx(dominio)),
    host === dominio ? Promise.resolve<ConsultaDns<RegistroCaa>>({ estado: 'vacio' }) : consultar(() => resolvedor.caa(host)),
    consultar(() => resolvedor.caa(dominio)),
  ]);
  // Si ni siquiera aparecen los servidores de nombres, el DNS que usamos no
  // es de fiar (filtrado, caído…): «sin registros» no significaría nada.
  if (ns.estado !== 'ok') return { dominio, txt: { estado: 'error' }, dmarc: { estado: 'error' }, mx: { estado: 'error' }, caa: { estado: 'error' } };
  return {
    dominio,
    txt: aTexto(txt),
    dmarc: aTexto(dmarc),
    mx: mapear(mx, (r) => r.exchange),
    caa: combinarCaa(mapear(caaHost, textoCaa), mapear(caaDominio, textoCaa)),
  };
}
