// Orquesta el análisis: valida lo que se escribió, captura la web por HTTPS
// y por HTTP, aplica las comprobaciones y calcula la nota.
//
// Recibe el descargador como parámetro: con el real (`descargadorSeguro`) va
// a internet; en las pruebas se le pasa uno falso y no hay red.

import { comprobarCabeceras } from './comprobaciones/cabeceras';
import { comprobarDns } from './comprobaciones/dns';
import { capturarDns, type Resolvedor } from './dns';
import { comprobarContenido } from './comprobaciones/contenido';
import { comprobarRendimiento } from './comprobaciones/rendimiento';
import { clasificarSondeo, comprobarExposicion, MAX_BYTES_SONDEO, SONDAS } from './comprobaciones/exposicion';
import { comprobarCookies } from './comprobaciones/cookies';
import { comprobarPrivacidad } from './comprobaciones/privacidad';
import { comprobarTecnologias } from './comprobaciones/tecnologias';
import { comprobarHttps } from './comprobaciones/https';
import type { Descargador, OpcionesDescarga } from './descarga';
import { normalizarObjetivo, type MotivoObjetivo } from './objetivo';
import { calcularNota, type Nota } from './puntuacion';
import type { Aviso, CapturaSitio, Hallazgo, ResultadoCaptura, Sondeo } from './tipos';

/** Por HTTPS se sigue la cadena de redirecciones y se lee la página. */
export const OPCIONES_HTTPS: OpcionesDescarga = { seguirRedirecciones: 5, maxBytes: 1_000_000, tiempoMs: 15_000 };
/** Por HTTP solo interesa a dónde manda: no se sigue ni se lee casi nada. */
export const OPCIONES_HTTP: OpcionesDescarga = { seguirRedirecciones: 0, maxBytes: 65_536, tiempoMs: 8_000 };

/** Cada archivo del sondeo: sin seguir redirecciones (un salto no es el archivo) y con poco plazo. */
const OPCIONES_SONDEO: OpcionesDescarga = { seguirRedirecciones: 0, maxBytes: MAX_BYTES_SONDEO, tiempoMs: 4_000, cuerpo: 'bytes' };
/** Peticiones simultáneas del sondeo a una misma web. */
const SIMULTANEAS_SONDEO = 4;

export interface Informe {
  version: 1;
  objetivo: { host: string; url: string };
  nota: Nota;
  hallazgos: Hallazgo[];
  /** Cosas que el lector debe saber sobre el propio análisis. */
  avisos: Aviso[];
  analizadoEn: string;
  duracionMs: number;
}

export type ErrorAnalisis =
  | { codigo: 'objetivo-invalido'; motivo: MotivoObjetivo }
  | { codigo: 'no-existe' | 'destino-no-permitido' | 'sin-respuesta'; detalle: string };

export type ResultadoAnalisis = { ok: true; informe: Informe } | { ok: false; error: ErrorAnalisis };

/** Avances del análisis, para mostrarlos mientras se hace (no forman parte del informe). */
export type EventoProgreso = { tipo: 'captura'; via: 'https' | 'http'; ok: boolean };

export interface DependenciasAnalisis {
  descargador: Descargador;
  /** Si falta, no se mira el DNS (SPF, DMARC, CAA). */
  resolvedor?: Resolvedor;
  ahora?: () => Date;
  /** Se llama cada vez que termina una de las dos capturas. Un fallo aquí no afecta al análisis. */
  alProgreso?: (evento: EventoProgreso) => void;
  /**
   * Busca archivos que no deberían ser públicos (.env, .git, copias de seguridad…). Hace peticiones extra a la web,
   * así que solo debe activarse si quien analiza ha declarado que es responsable de ella o tiene permiso.
   */
  sondearArchivos?: boolean;
}

/** Pide cada archivo de la lista, de pocos en pocos, y anota qué se vio (sin guardar el contenido). */
export async function sondearArchivos(host: string, descargador: Descargador): Promise<Sondeo[]> {
  const resultados: Sondeo[] = new Array<Sondeo>(SONDAS.length);
  let siguiente = 0;
  const trabajador = async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= SONDAS.length) return;
      const sonda = SONDAS[i];
      const captura = await descargador(new URL(`https://${host}${sonda.ruta}`), OPCIONES_SONDEO).catch(
        (): ResultadoCaptura => ({ ok: false, error: { codigo: 'conexion', mensaje: 'fallo inesperado' } }),
      );
      resultados[i] = { grupo: sonda.grupo, ruta: sonda.ruta, estado: clasificarSondeo(sonda, captura) };
    }
  };
  await Promise.all(Array.from({ length: SIMULTANEAS_SONDEO }, trabajador));
  return resultados;
}

const AMBIGUOS: ReadonlySet<string> = new Set(['tiempo-agotado', 'redirecciones', 'respuesta-invalida']);

/**
 * Cuando no hay forma de ver la web, no se pone nota: un «F» por una web
 * que no existe o que no responde sería engañoso.
 */
function noAnalizable(https: ResultadoCaptura, http: ResultadoCaptura): ErrorAnalisis | null {
  for (const captura of [https, http]) {
    if (!captura.ok && captura.error.codigo === 'ip-no-publica') {
      return { codigo: 'destino-no-permitido', detalle: captura.error.mensaje };
    }
  }
  // Un plazo agotado, un bucle de redirecciones o una respuesta ininteligible no demuestran que la web no
  // tenga HTTPS: pueden ser lentitud, o un cortafuegos que bloquea a los analizadores. Eso no merece una «F».
  if (!https.ok && AMBIGUOS.has(https.error.codigo)) return { codigo: 'sin-respuesta', detalle: https.error.mensaje };
  if (!https.ok && !http.ok) {
    return https.error.codigo === 'dns'
      ? { codigo: 'no-existe', detalle: https.error.mensaje }
      : { codigo: 'sin-respuesta', detalle: https.error.mensaje };
  }
  return null;
}

function avisosDe(captura: CapturaSitio, maxBytes: number): Aviso[] {
  if (!captura.https.ok) return [];
  const r = captura.https.respuesta;
  const avisos: Aviso[] = [];
  // Una página de error o de bloqueo (403, 429, 503…) no es la web: sus cabeceras no dicen cómo está configurada.
  if (r.estado >= 400) avisos.push({ id: 'respuesta.error', datos: { estado: r.estado } });
  if (r.estadoCuerpo === 'recortado') avisos.push({ id: 'cuerpo.recortado', datos: { maxBytes } });
  if (r.estadoCuerpo === 'interrumpido') avisos.push({ id: 'cuerpo.interrumpido', datos: { bytesLeidos: r.bytesLeidos } });
  try {
    const hostFinal = new URL(r.urlFinal).hostname;
    if (hostFinal !== captura.host) avisos.push({ id: 'redireccion.otro-host', datos: { desde: captura.host, hasta: hostFinal } });
  } catch {
    // La URL final la construye la descarga: siempre es válida.
  }
  return avisos;
}

export async function analizarSitio(entrada: string, dependencias: DependenciasAnalisis): Promise<ResultadoAnalisis> {
  const inicio = performance.now();
  const ahora = dependencias.ahora ?? (() => new Date());

  const objetivo = normalizarObjetivo(entrada);
  if (!objetivo.ok) return { ok: false, error: { codigo: 'objetivo-invalido', motivo: objetivo.motivo } };

  const { host, url } = objetivo;
  const ruta = `${url.pathname}${url.search}`;
  const urlHttps = new URL(`https://${host}${ruta}`);
  const urlHttp = new URL(`http://${host}${ruta}`);

  const avisar = (via: 'https' | 'http', resultado: ResultadoCaptura) => {
    try {
      dependencias.alProgreso?.({ tipo: 'captura', via, ok: resultado.ok });
    } catch {
      // Quien escucha el progreso no puede romper el análisis.
    }
    return resultado;
  };
  const dnsPendiente = dependencias.resolvedor
    ? capturarDns(host, dependencias.resolvedor).catch(() => null)
    : Promise.resolve(null);
  const sondeosPendientes = dependencias.sondearArchivos ? sondearArchivos(host, dependencias.descargador) : Promise.resolve(undefined);
  const [https, http] = await Promise.all([
    dependencias.descargador(urlHttps, OPCIONES_HTTPS).then((r) => avisar('https', r)),
    dependencias.descargador(urlHttp, OPCIONES_HTTP).then((r) => avisar('http', r)),
  ]);

  const error = noAnalizable(https, http);
  if (error) return { ok: false, error };

  const [dnsCapturado, sondeos] = await Promise.all([dnsPendiente, sondeosPendientes]);
  const captura: CapturaSitio = { host, https, http, ...(dnsCapturado ? { dns: dnsCapturado } : {}), ...(sondeos ? { sondeos } : {}) };
  const momento = ahora();
  const hallazgos = [
    ...comprobarHttps(captura, momento),
    ...comprobarDns(captura),
    ...comprobarCabeceras(captura),
    ...comprobarContenido(captura),
    ...comprobarCookies(captura),
    ...comprobarTecnologias(captura, momento),
    ...comprobarPrivacidad(captura),
    ...comprobarRendimiento(captura, OPCIONES_HTTPS.maxBytes),
    ...comprobarExposicion(captura),
  ];

  return {
    ok: true,
    informe: {
      version: 1,
      objetivo: { host, url: urlHttps.href },
      nota: calcularNota(hallazgos),
      hallazgos,
      avisos: avisosDe(captura, OPCIONES_HTTPS.maxBytes),
      analizadoEn: momento.toISOString(),
      duracionMs: Math.round(performance.now() - inicio),
    },
  };
}
