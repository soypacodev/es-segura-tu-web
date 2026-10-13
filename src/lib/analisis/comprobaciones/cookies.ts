// Comprobaciones de las cookies que la web intenta guardar al visitarla.
//
// Se miran las cabeceras Set-Cookie de la respuesta final y de las
// redirecciones por las que se pasó. Solo se leen los nombres y los
// atributos: el valor de una cookie nunca sale de aquí.

import type { CapturaSitio, Hallazgo } from '../tipos';
import { MAX_NOMBRES, hallazgoDe } from './utiles';

export interface Cookie {
  nombre: string;
  secure: boolean;
  httpOnly: boolean;
  /** «Lax», «Strict» o «None» tal como llegó, o null si no lo dice. */
  sameSite: string | null;
}

/** Nombres que suelen identificar una sesión o un acceso: esas son las que importa proteger del JavaScript. */
const NOMBRE_DE_SESION = /(sess|sid\b|auth|token|login|logged_in|jwt)/i;

export function parsearSetCookie(valor: string): Cookie | null {
  const [par, ...atributos] = valor.split(';');
  const igual = par.indexOf('=');
  const nombre = (igual === -1 ? par : par.slice(0, igual)).trim();
  if (!nombre) return null;

  let secure = false;
  let httpOnly = false;
  let sameSite: string | null = null;
  for (const atributo of atributos) {
    const [clave, ...resto] = atributo.trim().split('=');
    switch (clave.trim().toLowerCase()) {
      case 'secure':
        secure = true;
        break;
      case 'httponly':
        httpOnly = true;
        break;
      case 'samesite':
        sameSite = resto.join('=').trim().toLowerCase() || null;
        break;
    }
  }
  return { nombre, secure, httpOnly, sameSite };
}

/** Las cookies de protección CSRF/XSRF (csrftoken, XSRF-TOKEN…) tienen que poder leerse desde JavaScript: no se les exige «HttpOnly». */
const NOMBRE_DE_CSRF = /csrf|xsrf/i;

export const esCookieDeSesion = (c: Cookie) => NOMBRE_DE_SESION.test(c.nombre) && !NOMBRE_DE_CSRF.test(c.nombre);

const h = hallazgoDe('cookies');

const MAX_NOMBRE = 60;

/** Un nombre de cookie hostil puede ser enorme: se muestra recortado, y el recorte se ve («…»). */
const acortar = (nombre: string) => (nombre.length > MAX_NOMBRE ? `${nombre.slice(0, MAX_NOMBRE)}…` : nombre);

/** Los primeros nombres y, si hay más, cuántos quedan sin listar (nunca se recorta sin decirlo). */
function nombres(cookies: Cookie[]): { sin: string[]; mas?: number } {
  const unicos = [...new Set(cookies.map((c) => c.nombre))].map(acortar);
  return unicos.length > MAX_NOMBRES ? { sin: unicos.slice(0, MAX_NOMBRES), mas: unicos.length - MAX_NOMBRES } : { sin: unicos };
}

export function comprobarCookies(captura: CapturaSitio): Hallazgo[] {
  if (!captura.https.ok) return [];
  const r = captura.https.respuesta;

  const crudas = [...r.redirecciones.flatMap((s) => s.setCookie), ...(r.cabeceras['set-cookie'] ?? [])];
  const cookies = crudas.map(parsearSetCookie).filter((c): c is Cookie => c !== null);

  if (cookies.length === 0) {
    return [
      h('cookies.ninguna', 'correcto', 'info', 6),
      h('cookies.secure', 'no-aplica', 'alta', 8),
      h('cookies.httponly', 'no-aplica', 'alta', 6),
      h('cookies.samesite', 'no-aplica', 'baja', 3),
    ];
  }

  const total = new Set(cookies.map((c) => c.nombre)).size;

  const sinSecure = cookies.filter((c) => !c.secure);
  const secure =
    sinSecure.length === 0
      ? h('cookies.secure', 'correcto', 'alta', 8, { total })
      : h('cookies.secure', 'fallo', 'alta', 8, { total, ...nombres(sinSecure) });

  const deSesion = cookies.filter(esCookieDeSesion);
  const sesionSinHttpOnly = deSesion.filter((c) => !c.httpOnly);
  const httponly =
    deSesion.length === 0
      ? h('cookies.httponly', 'no-aplica', 'alta', 6)
      : sesionSinHttpOnly.length === 0
        ? h('cookies.httponly', 'correcto', 'alta', 6, { total: deSesion.length })
        : h('cookies.httponly', 'fallo', 'alta', 6, { total: deSesion.length, ...nombres(sesionSinHttpOnly) });

  const sinSameSite = cookies.filter((c) => c.sameSite === null);
  const samesite =
    sinSameSite.length === 0
      ? h('cookies.samesite', 'correcto', 'baja', 3, { total })
      : h('cookies.samesite', 'mejorable', 'baja', 3, { total, ...nombres(sinSameSite) });

  return [h('cookies.ninguna', 'no-aplica', 'info', 6), secure, httponly, samesite];
}
