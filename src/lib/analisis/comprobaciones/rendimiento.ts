// Comprobaciones de rendimiento y buenas prácticas de la página principal:
// compresión, caché, peso del HTML, redirecciones, codificación de texto,
// adaptación al móvil, idioma y título.
//
// Límites (también en PLAN.md): solo se mira la página principal, sin
// ejecutar JavaScript, y no se mide la velocidad real (depende de desde dónde
// se pregunte). Tampoco se ve el protocolo HTTP/2 o HTTP/3. Lo que falta es
// «mejorable», nunca «fallo», y solo se afirma que falta algo si la página
// se leyó entera.

import type { CapturaSitio, Hallazgo, RespuestaCapturada } from '../tipos';
import { etiquetasDe, type EstadoLectura } from './html';
import { hallazgoDe } from './utiles';

/** HTML de más de esto (ya descomprimido) se considera pesado. */
export const PESO_MAX_HTML = 500_000;
/** Por debajo de esto, comprimir no compensa y no se exige. */
export const MIN_PARA_COMPRIMIR = 1_500;
export const MAX_REDIRECCIONES = 2;
/** Los navegadores solo buscan la codificación declarada dentro del HTML en los primeros 1024 bytes. */
export const LIMITE_CODIFICACION = 1_024;

const ETIQUETAS = new Set(['html', 'meta', 'title']);
const COMPRESIONES = new Set(['gzip', 'br', 'zstd', 'deflate', 'compress']);

const h = hallazgoDe('rendimiento');

/**
 * «width=device-width» adapta la página a la pantalla. Con solo «initial-scale» (sin un ancho fijo en píxeles)
 * los navegadores móviles hacen lo mismo, y hay webs grandes que lo escriben así.
 */
export function viewportAdaptable(contenido: string): boolean {
  if (/width\s*=\s*device-width/i.test(contenido)) return true;
  return /initial-scale\s*=/i.test(contenido) && !/(^|[,;\s])width\s*=\s*\d/i.test(contenido);
}

export interface Cabecera {
  /** Valor de lang en <html>, o null si no hay. */
  idioma: string | null;
  /** Hay <meta name="viewport"> que adapta la página a la pantalla. */
  viewport: boolean;
  /** Codificación declarada con <meta> dentro de los primeros 1024 bytes. */
  codificacionMeta: boolean;
  /** Texto del primer <title>, o null si no hay etiqueta (cadena vacía si está vacía). */
  titulo: string | null;
}

/** Una sola pasada por las etiquetas html, meta y title; para en cuanto tiene todo. */
export function leerCabecera(html: string, lectura?: EstadoLectura): Cabecera {
  const c: Cabecera = { idioma: null, viewport: false, codificacionMeta: false, titulo: null };
  let idiomaVisto = false;
  for (const e of etiquetasDe(html, ETIQUETAS, lectura)) {
    if (e.nombre === 'html' && !idiomaVisto) {
      idiomaVisto = true;
      const lang = (e.atributos.lang ?? e.atributos['xml:lang'] ?? '').trim();
      c.idioma = lang === '' ? null : lang;
    } else if (e.nombre === 'meta') {
      const a = e.atributos;
      if ((a.name ?? '').toLowerCase() === 'viewport' && viewportAdaptable(a.content ?? '')) c.viewport = true;
      const declara = a.charset !== undefined || ((a['http-equiv'] ?? '').toLowerCase() === 'content-type' && /charset\s*=/i.test(a.content ?? ''));
      if (declara && e.fin <= LIMITE_CODIFICACION) c.codificacionMeta = true;
    } else if (e.nombre === 'title' && c.titulo === null) {
      const resto = html.slice(e.fin, e.fin + 400);
      const cierre = resto.toLowerCase().indexOf('</title');
      // Sin cierre dentro de 400 caracteres: hay título, pero no se lee entero.
      c.titulo = (cierre === -1 ? resto : resto.slice(0, cierre)).replace(/\s+/g, ' ').trim();
    }
    if (idiomaVisto && c.viewport && c.codificacionMeta && c.titulo !== null) break;
  }
  return c;
}

const primero = (r: RespuestaCapturada, nombre: string) => r.cabeceras[nombre]?.[0];

function compresion(r: RespuestaCapturada): Hallazgo {
  const codificacion = (primero(r, 'content-encoding') ?? '').toLowerCase().trim();
  if (COMPRESIONES.has(codificacion)) return h('rendimiento.compresion', 'correcto', 'media', 6, { codificacion });
  if (r.estadoCuerpo === 'interrumpido' || r.bytesLeidos < MIN_PARA_COMPRIMIR) {
    return h('rendimiento.compresion', 'no-aplica', 'media', 6);
  }
  return h('rendimiento.compresion', 'mejorable', 'media', 6, { bytes: r.bytesLeidos });
}

function cache(r: RespuestaCapturada): Hallazgo {
  const hay = ['cache-control', 'etag', 'last-modified'].some((n) => (primero(r, n) ?? '').trim() !== '');
  return h('rendimiento.cache', hay ? 'correcto' : 'mejorable', 'baja', 4);
}

function peso(r: RespuestaCapturada, maxLeido: number): Hallazgo {
  if (r.estadoCuerpo === 'interrumpido') return h('rendimiento.peso', 'no-aplica', 'baja', 4);
  // Si se cortó la descarga, el HTML pesa al menos lo leído.
  const kb = Math.round(r.bytesLeidos / 1000);
  if (r.estadoCuerpo === 'recortado') return h('rendimiento.peso', 'mejorable', 'baja', 4, { kb: Math.round(maxLeido / 1000), recortado: true });
  return h('rendimiento.peso', r.bytesLeidos > PESO_MAX_HTML ? 'mejorable' : 'correcto', 'baja', 4, { kb });
}

function redirecciones(r: RespuestaCapturada): Hallazgo {
  const saltos = r.redirecciones.length;
  return h('rendimiento.redirecciones', saltos > MAX_REDIRECCIONES ? 'mejorable' : 'correcto', 'baja', 3, { saltos });
}

function codificacion(r: RespuestaCapturada, c: Cabecera, completo: boolean): Hallazgo {
  const enCabecera = /charset\s*=/i.test(primero(r, 'content-type') ?? '');
  if (enCabecera || c.codificacionMeta) return h('rendimiento.codificacion', 'correcto', 'baja', 3);
  // Esta se declara al principio del HTML: si se leyó más de 1024 bytes, su ausencia ya es segura.
  const concluyente = completo || r.bytesLeidos > LIMITE_CODIFICACION;
  return h('rendimiento.codificacion', concluyente ? 'mejorable' : 'no-aplica', 'baja', 3);
}

export function comprobarRendimiento(captura: CapturaSitio, maxLeido = 1_000_000): Hallazgo[] {
  if (!captura.https.ok) return [];
  const r = captura.https.respuesta;
  // Sin HTML (otro tipo de contenido o codificación desconocida) no hay nada que valorar.
  if (r.cuerpo === null) return [];
  const lectura: EstadoLectura = { incompleto: false };
  const c = leerCabecera(r.cuerpo, lectura);
  const completo = r.estadoCuerpo === 'completo' && !lectura.incompleto;
  const ausente = (hay: boolean, id: string, gravedad: Hallazgo['gravedad'], pesoH: number): Hallazgo =>
    hay ? h(id, 'correcto', gravedad, pesoH) : h(id, completo ? 'mejorable' : 'no-aplica', gravedad, pesoH);

  return [
    compresion(r),
    cache(r),
    peso(r, maxLeido),
    redirecciones(r),
    codificacion(r, c, completo),
    ausente(c.viewport, 'rendimiento.movil', 'media', 4),
    ausente(c.idioma !== null, 'rendimiento.idioma', 'baja', 3),
    ausente(c.titulo !== null && c.titulo !== '', 'rendimiento.titulo', 'baja', 3),
  ];
}
