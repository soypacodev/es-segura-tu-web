// Comprobaciones de lo que la web cuenta sobre las tecnologías que usa.
//
// Decir «nginx/1.18.0» o «PHP/7.4.3» ayuda a quien busque fallos conocidos de
// esa versión exacta; y una versión que ya no recibe parches es un riesgo en
// sí misma, se diga o no. Solo se mira lo que la web declara: no se adivina.

import type { CapturaSitio, Hallazgo, RespuestaCapturada } from '../tipos';
import { etiquetasDe } from './html';
import { valorCabecera } from './utiles';

const h = (id: string, resultado: Hallazgo['resultado'], gravedad: Hallazgo['gravedad'], peso: number, datos?: Hallazgo['datos']): Hallazgo => ({
  id,
  categoria: 'tecnologias',
  resultado,
  gravedad,
  peso,
  ...(datos ? { datos } : {}),
});

const MAX_VALOR = 120;

/** El valor tal como llegó, o recortado con una marca explícita. */
function mostrar(valor: string): { valor: string; recortado?: true } {
  const limpio = valor.trim();
  return limpio.length > MAX_VALOR ? { valor: limpio.slice(0, MAX_VALOR), recortado: true } : { valor: limpio };
}

/** «nginx/1.18.0», «Apache/2.4.41», «PHP/7.4.3»: un nombre seguido de una versión. */
const PRODUCTO_CON_VERSION = /[A-Za-z][\w.-]*\/\d[\w.-]*/;
/** Cualquier número de versión suelto, por ejemplo «WordPress 5.8.1». */
const VERSION_SUELTA = /\b\d+\.\d+(\.\d+)?\b/;

// ------------------------------------------------------------------
// PHP: versiones que ya no reciben parches de seguridad
// ------------------------------------------------------------------

/**
 * Fin de vida de cada rama de PHP (fuente: php.net/eol.php y
 * php.net/supported-versions.php, revisado en octubre de 2026).
 * Hay que actualizar esta lista cada año.
 */
export const FIN_DE_VIDA_PHP: Readonly<Record<string, string>> = {
  '5.6': '2018-12-31',
  '7.0': '2019-01-10',
  '7.1': '2019-12-01',
  '7.2': '2020-11-30',
  '7.3': '2021-12-06',
  '7.4': '2022-11-28',
  '8.0': '2023-11-26',
  '8.1': '2025-12-31',
  '8.2': '2026-12-31',
  '8.3': '2027-12-31',
  '8.4': '2028-12-31',
  '8.5': '2029-12-31',
};

/** Rama más antigua de PHP 8 de la que todavía no hay noticia: por encima de la última conocida, se da por vigente. */
export function versionDePhp(valor: string): { version: string; rama: string } | null {
  const m = /\bPHP\/(\d+)\.(\d+)(?:\.(\d+))?/i.exec(valor);
  if (!m) return null;
  return { version: m[0].slice(m[0].indexOf('/') + 1), rama: `${m[1]}.${m[2]}` };
}

function comprobarPhp(r: RespuestaCapturada, ahora: Date): Hallazgo {
  const id = 'tecnologias.php';
  const origen = [valorCabecera(r, 'x-powered-by'), valorCabecera(r, 'server')].filter((v): v is string => v !== undefined);
  const php = origen.map(versionDePhp).find((v) => v !== null) ?? null;
  if (php === null) return h(id, 'no-aplica', 'alta', 8);

  const fin = FIN_DE_VIDA_PHP[php.rama];
  if (fin === undefined) {
    const [mayor, menor] = php.rama.split('.').map(Number);
    // Ramas antiguas que no están en la lista: caducadas. Las posteriores a la última conocida: vigentes.
    const antigua = mayor < 8 || (mayor === 8 && menor < 5);
    return antigua ? h(id, 'fallo', 'alta', 8, { version: php.version, rama: php.rama }) : h(id, 'correcto', 'alta', 8, { version: php.version });
  }
  return Date.parse(`${fin}T23:59:59Z`) < ahora.getTime()
    ? h(id, 'fallo', 'alta', 8, { version: php.version, rama: php.rama, fin })
    : h(id, 'correcto', 'alta', 8, { version: php.version, rama: php.rama, fin });
}

// ------------------------------------------------------------------
// Cabeceras que cuentan versiones
// ------------------------------------------------------------------

function comprobarServidor(r: RespuestaCapturada): Hallazgo {
  const id = 'tecnologias.servidor';
  const valor = valorCabecera(r, 'server');
  if (valor !== undefined && PRODUCTO_CON_VERSION.test(valor)) return h(id, 'mejorable', 'baja', 4, mostrar(valor));
  return h(id, 'correcto', 'baja', 4);
}

const CABECERAS_DE_TECNOLOGIA = ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];

function comprobarCabecerasDeTecnologia(r: RespuestaCapturada): Hallazgo {
  const id = 'tecnologias.cabecera';
  for (const nombre of CABECERAS_DE_TECNOLOGIA) {
    const valor = valorCabecera(r, nombre);
    if (valor === undefined) continue;
    // «x-aspnet-version: 4.0.30319» no lleva nombre delante: la cabecera ya lo dice.
    if (PRODUCTO_CON_VERSION.test(valor) || VERSION_SUELTA.test(valor)) return h(id, 'mejorable', 'baja', 3, { cabecera: nombre, ...mostrar(valor) });
  }
  return h(id, 'correcto', 'baja', 3);
}

// ------------------------------------------------------------------
// <meta name="generator">
// ------------------------------------------------------------------

const SOLO_META = new Set(['meta']);

/** Lo que dice la etiqueta «generator» de la página (WordPress, Joomla, Drupal…), si existe. */
export function generadorDeLaPagina(html: string): string | null {
  for (const meta of etiquetasDe(html, SOLO_META)) {
    if ((meta.atributos['name'] ?? '').toLowerCase() !== 'generator') continue;
    const valor = meta.atributos['content'];
    if (valor) return valor.trim();
  }
  return null;
}

function comprobarGenerador(r: RespuestaCapturada): Hallazgo {
  const id = 'tecnologias.generador';
  if (r.cuerpo === null) return h(id, 'no-aplica', 'baja', 2);
  const valor = generadorDeLaPagina(r.cuerpo);
  if (valor !== null && VERSION_SUELTA.test(valor)) return h(id, 'mejorable', 'baja', 2, mostrar(valor));
  return h(id, 'correcto', 'baja', 2);
}

// ------------------------------------------------------------------
// Librerías de JavaScript con versión conocida y con fallos publicados
// ------------------------------------------------------------------

export const MAX_SCRIPTS = 5_000;
const MAX_LIBRERIAS = 5;
const MAX_URL = 2_000;
const SCRIPTS_Y_ESTILOS = new Set(['script', 'link']);

type Version = [number, number, number];

/** Qué librerías se reconocen en una dirección y desde qué versión dejan de tener fallos conocidos. */
interface Libreria {
  nombre: string;
  /** Nombre en la dirección (jquery-3.3.1.js, /jquery/3.3.1/, jquery@3.3.1). */
  patron: RegExp;
  /** Para jQuery de WordPress: «jquery.min.js?ver=3.6.0». */
  porParametro?: RegExp;
  /** ¿Esta versión tiene fallos publicados o ya no recibe parches? */
  obsoleta: (v: Version) => boolean;
}

const NUMERO = String.raw`(\d+\.\d+(?:\.\d+)?)`;
const SEPARADOR = String.raw`(?:[-.@/])`;

export const LIBRERIAS: readonly Libreria[] = [
  // jQuery < 3.5.0: XSS al procesar HTML (CVE-2020-11022 y CVE-2020-11023).
  { nombre: 'jQuery', patron: new RegExp(String.raw`(?:^|[/_.-])jquery${SEPARADOR}${NUMERO}`, 'i'), porParametro: /(?:^|\/)jquery(?:\.min)?\.js$/i, obsoleta: (v) => v[0] < 3 || (v[0] === 3 && v[1] < 5) },
  // Bootstrap < 3.4.1 y 4.x < 4.3.1: XSS en tooltips y popovers (CVE-2019-8331).
  { nombre: 'Bootstrap', patron: new RegExp(String.raw`(?:^|[/_.-])bootstrap${SEPARADOR}${NUMERO}`, 'i'), obsoleta: (v) => v[0] < 3 || (v[0] === 3 && (v[1] < 4 || (v[1] === 4 && v[2] < 1))) || (v[0] === 4 && (v[1] < 3 || (v[1] === 3 && v[2] < 1))) },
  // AngularJS (1.x): sin soporte desde el 31 de diciembre de 2021.
  { nombre: 'AngularJS', patron: new RegExp(String.raw`(?:^|[/_.-])angular(?:js)?${SEPARADOR}${NUMERO}`, 'i'), obsoleta: (v) => v[0] === 1 },
];

function aVersion(texto: string): Version {
  const [a, b, c] = texto.split('.').map(Number);
  return [a, b, c ?? 0];
}

export interface LibreriaVista {
  nombre: string;
  version: string;
  obsoleta: boolean;
}

/** Librerías con versión que se ven en las direcciones de scripts y estilos de la página. Una sola pasada. */
export function leerLibrerias(html: string): { vistas: LibreriaVista[]; completo: boolean } {
  const vistas = new Map<string, LibreriaVista>();
  let revisadas = 0;
  let completo = true;
  for (const e of etiquetasDe(html, SCRIPTS_Y_ESTILOS)) {
    const direccion = e.nombre === 'script' ? e.atributos['src'] : e.atributos['href'];
    if (!direccion) continue;
    if (++revisadas > MAX_SCRIPTS) {
      completo = false;
      break;
    }
    const url = direccion.trim().slice(0, MAX_URL);
    const ruta = url.split(/[?#]/)[0];
    for (const lib of LIBRERIAS) {
      let version = lib.patron.exec(ruta)?.[1];
      if (version === undefined && lib.porParametro?.test(ruta)) version = /[?&](?:ver|v)=(\d+\.\d+(?:\.\d+)?)/i.exec(url)?.[1];
      if (version === undefined) continue;
      const clave = `${lib.nombre} ${version}`;
      if (!vistas.has(clave)) vistas.set(clave, { nombre: lib.nombre, version, obsoleta: lib.obsoleta(aVersion(version)) });
    }
  }
  return { vistas: [...vistas.values()], completo };
}

function comprobarLibrerias(r: RespuestaCapturada): Hallazgo {
  const id = 'tecnologias.librerias';
  if (r.cuerpo === null) return h(id, 'no-aplica', 'alta', 6);
  const { vistas } = leerLibrerias(r.cuerpo);
  const malas = vistas.filter((v) => v.obsoleta);
  if (malas.length > 0) {
    const lista = malas.slice(0, MAX_LIBRERIAS).map((v) => `${v.nombre} ${v.version}`);
    return h(id, 'fallo', 'alta', 6, { lista, ...(malas.length > MAX_LIBRERIAS ? { mas: malas.length - MAX_LIBRERIAS } : {}) });
  }
  // Sin ninguna librería reconocida no se puede decir nada: no es un «todo bien».
  return vistas.length === 0 ? h(id, 'no-aplica', 'alta', 6) : h(id, 'correcto', 'alta', 6, { total: vistas.length });
}

// ------------------------------------------------------------------

export function comprobarTecnologias(captura: CapturaSitio, ahora: Date): Hallazgo[] {
  if (!captura.https.ok) return [];
  const r = captura.https.respuesta;
  return [comprobarPhp(r, ahora), comprobarServidor(r), comprobarCabecerasDeTecnologia(r), comprobarGenerador(r), comprobarLibrerias(r)];
}
