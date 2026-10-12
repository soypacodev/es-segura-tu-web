// Orquesta el análisis: valida lo que se escribió, captura la web por HTTPS
// y por HTTP, aplica las comprobaciones y calcula la nota.
//
// Recibe el descargador como parámetro: con el real (`descargadorSeguro`) va
// a internet; en las pruebas se le pasa uno falso y no hay red.

import { comprobarCabeceras } from './comprobaciones/cabeceras';
import { comprobarHttps } from './comprobaciones/https';
import type { Descargador, OpcionesDescarga } from './descarga';
import { normalizarObjetivo, type MotivoObjetivo } from './objetivo';
import { calcularNota, type Nota } from './puntuacion';
import type { Aviso, CapturaSitio, Hallazgo, ResultadoCaptura } from './tipos';

/** Por HTTPS se sigue la cadena de redirecciones y se lee la página. */
export const OPCIONES_HTTPS: OpcionesDescarga = { seguirRedirecciones: 5, maxBytes: 1_000_000, tiempoMs: 15_000 };
/** Por HTTP solo interesa a dónde manda: no se sigue ni se lee casi nada. */
export const OPCIONES_HTTP: OpcionesDescarga = { seguirRedirecciones: 0, maxBytes: 65_536, tiempoMs: 8_000 };

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

export interface DependenciasAnalisis {
  descargador: Descargador;
  ahora?: () => Date;
}

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

  const [https, http] = await Promise.all([
    dependencias.descargador(urlHttps, OPCIONES_HTTPS),
    dependencias.descargador(urlHttp, OPCIONES_HTTP),
  ]);

  const error = noAnalizable(https, http);
  if (error) return { ok: false, error };

  const captura: CapturaSitio = { host, https, http };
  const hallazgos = [...comprobarHttps(captura, ahora()), ...comprobarCabeceras(captura)];

  return {
    ok: true,
    informe: {
      version: 1,
      objetivo: { host, url: urlHttps.href },
      nota: calcularNota(hallazgos),
      hallazgos,
      avisos: avisosDe(captura, OPCIONES_HTTPS.maxBytes),
      analizadoEn: ahora().toISOString(),
      duracionMs: Math.round(performance.now() - inicio),
    },
  };
}
