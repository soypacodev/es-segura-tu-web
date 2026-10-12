// Comprobaciones de privacidad que se ven en el HTML de la página principal:
// rastreadores de terceros, aviso de cookies, tipografías de Google y
// páginas legales.
//
// Solo se lee el HTML que envía el servidor. Si un aviso o un enlace lo
// añade JavaScript después, aquí no se ve: por eso lo que falta se marca
// como «mejorable» y nunca como «fallo», y solo se concluye que falta algo
// cuando se ha leído la página entera.

import type { CapturaSitio, Hallazgo, RespuestaCapturada } from '../tipos';
import { enlacesDe } from './html';

/** Servicios de analítica, publicidad y seguimiento muy extendidos, por el dominio desde el que se cargan. */
const RASTREADORES: readonly { nombre: string; dominios: readonly string[] }[] = [
  { nombre: 'Google Analytics', dominios: ['google-analytics.com', 'analytics.google.com'] },
  { nombre: 'Google Tag Manager', dominios: ['googletagmanager.com'] },
  { nombre: 'Google Ads', dominios: ['doubleclick.net', 'googleadservices.com', 'googlesyndication.com'] },
  { nombre: 'Píxel de Meta (Facebook)', dominios: ['connect.facebook.net'] },
  { nombre: 'Hotjar', dominios: ['hotjar.com', 'hotjar.io'] },
  { nombre: 'Microsoft Clarity', dominios: ['clarity.ms'] },
  { nombre: 'Microsoft Ads', dominios: ['bat.bing.com'] },
  { nombre: 'Píxel de TikTok', dominios: ['analytics.tiktok.com'] },
  { nombre: 'LinkedIn Insight', dominios: ['snap.licdn.com'] },
  { nombre: 'HubSpot', dominios: ['hs-scripts.com', 'hs-analytics.net', 'hsforms.net'] },
  { nombre: 'Mixpanel', dominios: ['mixpanel.com'] },
  { nombre: 'Segment', dominios: ['segment.com', 'segment.io'] },
  { nombre: 'Criteo', dominios: ['criteo.com', 'criteo.net'] },
  { nombre: 'X (Twitter) Ads', dominios: ['static.ads-twitter.com', 'analytics.twitter.com'] },
];

/** Gestores de consentimiento de cookies habituales, por una pista que dejan en el HTML. */
const GESTORES_DE_AVISO: readonly { nombre: string; pista: RegExp }[] = [
  { nombre: 'Cookiebot', pista: /cookiebot/i },
  { nombre: 'OneTrust', pista: /onetrust|optanon/i },
  { nombre: 'Iubenda', pista: /iubenda/i },
  { nombre: 'CookieYes', pista: /cookieyes|cookie-law-info/i },
  { nombre: 'Complianz', pista: /complianz|cmplz/i },
  { nombre: 'Didomi', pista: /didomi/i },
  { nombre: 'Usercentrics', pista: /usercentrics/i },
  { nombre: 'Osano', pista: /osano/i },
  { nombre: 'Termly', pista: /termly/i },
  { nombre: 'Quantcast Choice', pista: /quantcast.{0,20}(choice|consensu)|consensu\.org/i },
  { nombre: 'Tarteaucitron', pista: /tarteaucitron/i },
  { nombre: 'Klaro', pista: /\bklaro\b/i },
  { nombre: 'Cookie Consent', pista: /cookieconsent/i },
];

/** Un aviso hecho a mano: marcas típicas en clases, identificadores o textos. */
const AVISO_PROPIO = /(cookie[-_ ]?(banner|notice|consent|bar|law)|gdpr[-_ ]?(banner|consent)|(aceptar|accept|rechazar|reject)(\s+todas)?(\s+las)?\s+cookies)/i;

const POLITICA = /privacidad|privacy|protecci[oó]n\s+de\s+datos|rgpd|gdpr/i;
const AVISO_LEGAL = /aviso\s+legal|legal\s+notice|imprint|impressum|\bterms\b|t[eé]rminos|condiciones\s+(de\s+)?(uso|contrataci[oó]n)/i;

const MAX_NOMBRES = 5;

const h = (id: string, resultado: Hallazgo['resultado'], gravedad: Hallazgo['gravedad'], peso: number, datos?: Hallazgo['datos']): Hallazgo => ({
  id,
  categoria: 'privacidad',
  resultado,
  gravedad,
  peso,
  ...(datos ? { datos } : {}),
});

const escapar = (d: string) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rastreadores cuyo dominio aparece en el HTML (en etiquetas o en el código de la página). */
export function rastreadoresEnHtml(html: string): string[] {
  const minusculas = html.toLowerCase();
  return RASTREADORES.filter((r) =>
    r.dominios.some((d) => new RegExp(`(^|[^a-z0-9-])${escapar(d)}($|[^a-z0-9-])`).test(minusculas)),
  ).map((r) => r.nombre);
}

/** Nombre del gestor de avisos de cookies detectado, «propio» si parece un aviso hecho a mano, o null. */
export function avisoDeCookies(html: string): string | null {
  for (const g of GESTORES_DE_AVISO) if (g.pista.test(html)) return g.nombre;
  return AVISO_PROPIO.test(html) ? 'propio' : null;
}

export function usaFuentesDeGoogle(html: string): boolean {
  return /fonts\.(googleapis|gstatic)\.com/i.test(html);
}

/** «sí» si algún enlace encaja, «no» si ninguno, «no se sabe» si hubo demasiados enlaces para mirarlos todos. */
function buscarEnlace(html: string, patron: RegExp): 'si' | 'no' | 'no-se-sabe' {
  const { enlaces, completo } = enlacesDe(html);
  if (enlaces.some((e) => patron.test(e.texto) || patron.test(safe(e.href)))) return 'si';
  return completo ? 'no' : 'no-se-sabe';
}

function safe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Con la página entera se puede afirmar que algo falta; si se recortó, solo se afirma lo que sí se vio. */
const paginaCompleta = (r: RespuestaCapturada) => r.cuerpo !== null && r.estadoCuerpo === 'completo';

function lista(nombres: string[]): Hallazgo['datos'] {
  const mostrados = nombres.slice(0, MAX_NOMBRES);
  return { nombres: mostrados, total: nombres.length, ...(nombres.length > MAX_NOMBRES ? { mas: nombres.length - MAX_NOMBRES } : {}) };
}

function comprobarRastreadores(r: RespuestaCapturada): Hallazgo {
  const id = 'privacidad.rastreadores';
  if (r.cuerpo === null) return h(id, 'no-aplica', 'media', 4);
  const vistos = rastreadoresEnHtml(r.cuerpo);
  if (vistos.length > 0) return h(id, 'mejorable', 'media', 4, lista(vistos));
  return paginaCompleta(r) ? h(id, 'correcto', 'media', 4) : h(id, 'no-aplica', 'media', 4);
}

function comprobarConsentimiento(r: RespuestaCapturada): Hallazgo {
  const id = 'privacidad.consentimiento';
  if (r.cuerpo === null) return h(id, 'no-aplica', 'alta', 8);
  const vistos = rastreadoresEnHtml(r.cuerpo);
  if (vistos.length === 0) return h(id, 'no-aplica', 'alta', 8);
  const aviso = avisoDeCookies(r.cuerpo);
  if (aviso !== null) return h(id, 'correcto', 'alta', 8, { gestor: aviso });
  return paginaCompleta(r) ? h(id, 'mejorable', 'alta', 8, lista(vistos)) : h(id, 'no-aplica', 'alta', 8);
}

function comprobarFuentes(r: RespuestaCapturada): Hallazgo {
  const id = 'privacidad.fuentes';
  if (r.cuerpo === null) return h(id, 'no-aplica', 'baja', 2);
  if (usaFuentesDeGoogle(r.cuerpo)) return h(id, 'mejorable', 'baja', 2);
  return paginaCompleta(r) ? h(id, 'correcto', 'baja', 2) : h(id, 'no-aplica', 'baja', 2);
}

function comprobarEnlaceLegal(r: RespuestaCapturada, id: string, patron: RegExp, gravedad: Hallazgo['gravedad'], peso: number): Hallazgo {
  if (r.cuerpo === null) return h(id, 'no-aplica', gravedad, peso);
  const hay = buscarEnlace(r.cuerpo, patron);
  if (hay === 'si') return h(id, 'correcto', gravedad, peso);
  return hay === 'no' && paginaCompleta(r) ? h(id, 'mejorable', gravedad, peso) : h(id, 'no-aplica', gravedad, peso);
}

export function comprobarPrivacidad(captura: CapturaSitio): Hallazgo[] {
  if (!captura.https.ok) return [];
  const r = captura.https.respuesta;
  return [
    comprobarRastreadores(r),
    comprobarConsentimiento(r),
    comprobarFuentes(r),
    comprobarEnlaceLegal(r, 'privacidad.politica', POLITICA, 'media', 5),
    comprobarEnlaceLegal(r, 'privacidad.avisolegal', AVISO_LEGAL, 'baja', 3),
  ];
}
