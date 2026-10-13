// Comprobaciones de lo que la página principal carga y de dónde: contenido
// sin cifrar dentro de una página cifrada (contenido mixto), archivos de
// otras webs sin huella de integridad (SRI), cantidad de servidores ajenos
// de los que depende y formularios que envían sin cifrar.
//
// Solo se mira el HTML que envía el servidor. Lo que añade JavaScript
// después, o lo que carga una hoja de estilos (url(...)), no se ve. Si la
// página tiene demasiadas etiquetas para leerlas todas, no se afirma que
// no haya problemas.

import { dominioRegistrable } from '../dns';
import type { CapturaSitio, Hallazgo, RespuestaCapturada } from '../tipos';
import { etiquetasDe, type EstadoLectura } from './html';
import { esServidorDeRastreo } from './privacidad';
import { datosDeLista, hallazgoDe } from './utiles';

/** Más etiquetas de recursos que esto no se leen (cada una cuesta). Se marca como «incompleto». */
export const MAX_RECURSOS = 5_000;

const ETIQUETAS = new Set(['script', 'link', 'iframe', 'img', 'audio', 'video', 'source', 'embed', 'object', 'form']);
const SOLO_BASE = new Set(['base']);

const h = hallazgoDe('contenido');

/** Resuelve una dirección escrita en la página; null si no es una web (data:, javascript:, mailto:…) o no es válida. */
export function resolverUrl(valor: string | undefined, base: URL): URL | null {
  const v = valor?.trim();
  if (!v || v.startsWith('#')) return null;
  try {
    const u = new URL(v, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export interface Recursos {
  /** Servidores de los que se carga, sin cifrar, algo que ejecuta código o cambia la página (scripts, estilos, marcos, objetos). */
  mixtoActivo: string[];
  /** Servidores de los que se carga, sin cifrar, una imagen o un vídeo. */
  mixtoPasivo: string[];
  /** Servidores ajenos de los que se cargan scripts o estilos sin «integrity» (se excluyen los de seguimiento, que no pueden llevarla). */
  sinIntegridad: string[];
  /** Servidores ajenos de los que se carga un script. */
  scriptsAjenos: string[];
  /** Servidores a los que un formulario envía sus datos sin cifrar. */
  formulariosSinCifrar: string[];
  formularios: number;
  /** false si había demasiadas etiquetas y no se leyeron todas. */
  completo: boolean;
}

const mismoSitio = (a: string, b: string) => a === b || (dominioRegistrable(a) ?? a) === (dominioRegistrable(b) ?? b);

export function leerRecursos(html: string, urlFinal: URL): Recursos {
  const base = etiquetasDe(html, SOLO_BASE).next().value;
  const raiz = resolverUrl(base?.atributos['href'], urlFinal) ?? urlFinal;
  const hostPagina = urlFinal.hostname.toLowerCase();
  const paginaCifrada = urlFinal.protocol === 'https:';

  const r = { mixtoActivo: new Set<string>(), mixtoPasivo: new Set<string>(), sinIntegridad: new Set<string>(), scriptsAjenos: new Set<string>(), formulariosSinCifrar: new Set<string>() };
  let formularios = 0;
  let leidas = 0;
  let completo = true;
  const lectura: EstadoLectura = { incompleto: false };

  for (const e of etiquetasDe(html, ETIQUETAS, lectura)) {
    if (leidas >= MAX_RECURSOS) {
      completo = false;
      break;
    }
    leidas++;
    const a = e.atributos;
    let url: URL | null = null;
    let activo = true;
    let esScript = false;
    let esEstilo = false;
    switch (e.nombre) {
      case 'script':
        url = resolverUrl(a['src'], raiz);
        esScript = true;
        break;
      case 'link':
        if (!(a['rel'] ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) break;
        url = resolverUrl(a['href'], raiz);
        esEstilo = true;
        break;
      case 'iframe':
      case 'embed':
        url = resolverUrl(a['src'], raiz);
        break;
      case 'object':
        url = resolverUrl(a['data'], raiz);
        break;
      case 'img':
      case 'audio':
      case 'video':
      case 'source':
        url = resolverUrl(a['src'], raiz);
        activo = false;
        break;
      case 'form': {
        formularios++;
        const destino = resolverUrl(a['action'], raiz);
        if (destino?.protocol === 'http:') r.formulariosSinCifrar.add(destino.hostname.toLowerCase());
        continue;
      }
    }
    if (url === null) continue;
    const host = url.hostname.toLowerCase();
    if (paginaCifrada && url.protocol === 'http:') (activo ? r.mixtoActivo : r.mixtoPasivo).add(host);
    if (!mismoSitio(host, hostPagina)) {
      if (esScript) r.scriptsAjenos.add(host);
      if ((esScript || esEstilo) && !('integrity' in a) && !esServidorDeRastreo(host)) r.sinIntegridad.add(host);
    }
  }
  return {
    mixtoActivo: [...r.mixtoActivo],
    mixtoPasivo: [...r.mixtoPasivo],
    sinIntegridad: [...r.sinIntegridad],
    scriptsAjenos: [...r.scriptsAjenos],
    formulariosSinCifrar: [...r.formulariosSinCifrar],
    formularios,
    completo: completo && !lectura.incompleto,
  };
}

/** Máximo de servidores ajenos con código en la página para dar el punto por bueno. */
export const MAX_SCRIPTS_AJENOS = 5;

function comprobarMixto(rec: Recursos, cifrada: boolean): Hallazgo {
  const id = 'contenido.mixto';
  if (!cifrada) return h(id, 'no-aplica', 'alta', 8);
  if (rec.mixtoActivo.length > 0) return h(id, 'fallo', 'alta', 8, { ...datosDeLista(rec.mixtoActivo), pasivos: rec.mixtoPasivo.length });
  if (rec.mixtoPasivo.length > 0) return h(id, 'mejorable', 'media', 8, datosDeLista(rec.mixtoPasivo));
  return rec.completo ? h(id, 'correcto', 'alta', 8) : h(id, 'no-aplica', 'alta', 8);
}

function comprobarIntegridad(rec: Recursos): Hallazgo {
  const id = 'contenido.sri';
  if (rec.sinIntegridad.length > 0) return h(id, 'mejorable', 'media', 4, datosDeLista(rec.sinIntegridad));
  return rec.completo ? h(id, 'correcto', 'media', 4) : h(id, 'no-aplica', 'media', 4);
}

function comprobarScriptsAjenos(rec: Recursos): Hallazgo {
  const id = 'contenido.terceros';
  if (rec.scriptsAjenos.length > MAX_SCRIPTS_AJENOS) return h(id, 'mejorable', 'baja', 3, datosDeLista(rec.scriptsAjenos));
  return rec.completo ? h(id, 'correcto', 'baja', 3, { total: rec.scriptsAjenos.length }) : h(id, 'no-aplica', 'baja', 3);
}

function comprobarFormularios(rec: Recursos): Hallazgo {
  const id = 'contenido.formulario';
  if (rec.formulariosSinCifrar.length > 0) return h(id, 'fallo', 'critica', 6, datosDeLista(rec.formulariosSinCifrar));
  if (rec.formularios === 0 || !rec.completo) return h(id, 'no-aplica', 'critica', 6);
  return h(id, 'correcto', 'critica', 6);
}

export function comprobarContenido(captura: CapturaSitio): Hallazgo[] {
  if (!captura.https.ok) return [];
  const r: RespuestaCapturada = captura.https.respuesta;
  // Sin HTML (otro tipo de contenido) no hay nada que leer.
  if (r.cuerpo === null) return [];
  let urlFinal: URL;
  try {
    urlFinal = new URL(r.urlFinal);
  } catch {
    return [];
  }
  const rec = leerRecursos(r.cuerpo, urlFinal);
  // Si la página se recortó, lo que no se leyó cuenta como «incompleto».
  const recurso: Recursos = r.estadoCuerpo === 'completo' ? rec : { ...rec, completo: false };
  return [comprobarMixto(recurso, urlFinal.protocol === 'https:'), comprobarIntegridad(recurso), comprobarScriptsAjenos(recurso), comprobarFormularios(recurso)];
}
