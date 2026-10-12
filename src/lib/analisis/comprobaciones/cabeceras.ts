// Comprobaciones de las cabeceras de seguridad de la página final.
// Funciones puras: reciben la captura ya hecha.

import type { CapturaSitio, Hallazgo, RespuestaCapturada } from '../tipos';
import { valorCabecera } from './utiles';

const h = (
  id: string,
  resultado: Hallazgo['resultado'],
  gravedad: Hallazgo['gravedad'],
  peso: number,
  datos?: Hallazgo['datos'],
): Hallazgo => ({ id, categoria: 'cabeceras', resultado, gravedad, peso, ...(datos ? { datos } : {}) });

// ------------------------------------------------------------------
// Content-Security-Policy
// ------------------------------------------------------------------

export type DirectivasCsp = Map<string, string[]>;

function parsearPolitica(texto: string): DirectivasCsp {
  const directivas: DirectivasCsp = new Map();
  for (const parte of texto.split(';')) {
    const trozos = parte.trim().split(/\s+/).filter(Boolean);
    if (trozos.length === 0) continue;
    const [nombre, ...valores] = trozos;
    const clave = nombre.toLowerCase();
    // Si una directiva se repite, vale la primera.
    if (!directivas.has(clave)) directivas.set(clave, valores);
  }
  return directivas;
}

/** Una cabecera puede traer varias políticas separadas por coma; el navegador las cumple todas. */
export function parsearCsp(valor: string): DirectivasCsp[] {
  return valor
    .split(',')
    .map(parsearPolitica)
    .filter((directivas) => directivas.size > 0);
}

const PREFIJOS_NONCE_O_HASH = ["'nonce-", "'sha256-", "'sha384-", "'sha512-"];

/** Problemas que dejan una política (por lo demás presente) sin proteger de verdad. */
export function problemasCsp(directivas: DirectivasCsp): string[] {
  const problemas: string[] = [];

  const scripts = directivas.get('script-src') ?? directivas.get('default-src');
  if (!scripts) {
    problemas.push('sin-script-src');
  } else {
    const t = scripts.map((x) => x.toLowerCase());
    const strictDynamic = t.includes("'strict-dynamic'");
    // Con nonce, hash o strict-dynamic los navegadores ignoran 'unsafe-inline'.
    const protegido = strictDynamic || t.some((x) => PREFIJOS_NONCE_O_HASH.some((p) => x.startsWith(p)));
    if (t.includes("'unsafe-inline'") && !protegido) problemas.push('unsafe-inline');
    if (t.includes("'unsafe-eval'")) problemas.push('unsafe-eval');
    // Con strict-dynamic las listas de orígenes también se ignoran.
    if (!strictDynamic && t.some((x) => x === '*' || x === 'http:' || x === 'https:' || x === 'data:')) {
      problemas.push('comodin');
    }
  }

  if (!(directivas.get('object-src') ?? directivas.get('default-src'))) problemas.push('sin-object-src');
  return problemas;
}

function comprobarCsp(respuesta: RespuestaCapturada): Hallazgo {
  const id = 'cabeceras.csp';
  const valor = valorCabecera(respuesta, 'content-security-policy');
  const politicas = valor === undefined ? [] : parsearCsp(valor);

  if (politicas.length === 0) {
    const soloInforme = respuesta.cabeceras['content-security-policy-report-only'] !== undefined;
    return h(id, 'fallo', 'alta', 14, soloInforme ? { soloInforme: true } : undefined);
  }
  // Los navegadores cumplen todas a la vez: con que una proteja bien, la web está protegida.
  const mejor = politicas.map(problemasCsp).reduce((a, b) => (b.length < a.length ? b : a));
  return mejor.length === 0 ? h(id, 'correcto', 'alta', 14) : h(id, 'mejorable', 'alta', 14, { problemas: mejor });
}

// ------------------------------------------------------------------
// Resto de cabeceras
// ------------------------------------------------------------------

function comprobarClickjacking(respuesta: RespuestaCapturada): Hallazgo {
  const id = 'cabeceras.clickjacking';
  const csp = valorCabecera(respuesta, 'content-security-policy');
  const conFrameAncestors = (csp ? parsearCsp(csp) : []).some((directivas) => {
    const valores = directivas.get('frame-ancestors');
    return valores !== undefined && !valores.includes('*');
  });
  if (conFrameAncestors) return h(id, 'correcto', 'media', 6);

  const xfo = valorCabecera(respuesta, 'x-frame-options')?.trim().toUpperCase();
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') return h(id, 'correcto', 'media', 6);
  if (xfo?.startsWith('ALLOW-FROM')) return h(id, 'mejorable', 'media', 6, { obsoleta: true });
  return h(id, 'fallo', 'media', 6, xfo ? { valor: xfo } : undefined);
}

function comprobarNosniff(respuesta: RespuestaCapturada): Hallazgo {
  const valor = valorCabecera(respuesta, 'x-content-type-options');
  const correcto = valor?.split(',').some((v) => v.trim().toLowerCase() === 'nosniff') ?? false;
  return correcto ? h('cabeceras.nosniff', 'correcto', 'media', 4) : h('cabeceras.nosniff', 'fallo', 'media', 4, valor ? { valor } : undefined);
}

const POLITICAS_REFERRER = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

function comprobarReferrer(respuesta: RespuestaCapturada): Hallazgo {
  const id = 'cabeceras.referrer';
  const valor = valorCabecera(respuesta, 'referrer-policy');
  if (valor === undefined) return h(id, 'mejorable', 'baja', 3, { ausente: true });

  // Un navegador usa la última política que reconoce de la lista.
  const reconocidas = valor
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => POLITICAS_REFERRER.has(v));
  const efectiva = reconocidas[reconocidas.length - 1];
  if (efectiva === undefined) return h(id, 'mejorable', 'baja', 3, { valor });
  if (efectiva === 'unsafe-url') return h(id, 'fallo', 'baja', 3, { valor: efectiva });
  if (efectiva === 'no-referrer-when-downgrade') return h(id, 'mejorable', 'baja', 3, { valor: efectiva });
  return h(id, 'correcto', 'baja', 3, { valor: efectiva });
}

function comprobarPermisos(respuesta: RespuestaCapturada): Hallazgo {
  const presente =
    valorCabecera(respuesta, 'permissions-policy') !== undefined || valorCabecera(respuesta, 'feature-policy') !== undefined;
  return presente ? h('cabeceras.permisos', 'correcto', 'baja', 2) : h('cabeceras.permisos', 'mejorable', 'baja', 2);
}

export function comprobarCabeceras(captura: CapturaSitio): Hallazgo[] {
  if (!captura.https.ok) return [];
  const r = captura.https.respuesta;
  return [comprobarCsp(r), comprobarClickjacking(r), comprobarNosniff(r), comprobarReferrer(r), comprobarPermisos(r)];
}
