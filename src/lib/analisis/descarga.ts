// Descarga de una web con todas las defensas puestas.
//
// Un servidor que visita las direcciones que le da cualquiera es un blanco
// clásico de SSRF (hacer que el servidor consulte sus propias redes
// internas). Por eso:
//
// - El DNS lo resolvemos nosotros y se rechaza el nombre entero si UNA sola de
//   sus direcciones no es pública. La conexión usa justo la dirección ya
//   validada: no hay una segunda resolución que un atacante pueda cambiar
//   (DNS rebinding).
// - Las direcciones IP escritas a mano (también en una redirección) no pasan
//   por el DNS, así que se validan aparte.
// - Solo http y https, solo los puertos 80 y 443, sin usuario ni contraseña.
// - Cada redirección se valida igual que la primera petición, con un máximo.
// - Un único plazo total para todo, y un máximo de bytes DESCOMPRIMIDOS (una
//   bomba de compresión no llena la memoria).
// - No se envían cookies, credenciales ni referencia.
//
// La política (qué IP y qué puertos) se puede sustituir, pero solo al crear
// el descargador: el que usa la aplicación (`descargadorSeguro`) lleva la
// política pública y no hay forma de cambiarla desde fuera. Las pruebas
// crean el suyo para hablar con servidores locales.

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import type { TLSSocket } from 'node:tls';
import zlib from 'node:zlib';
import { esIpPublica } from './ip-publica';
import type { CertificadoVisto, CodigoError, ErrorCaptura, EstadoCuerpo, InfoTls, ResultadoCaptura, SaltoRedireccion } from './tipos';

export const USER_AGENT = 'EsSeguraTuWeb/1.0 (+https://github.com/soypacodev/es-segura-tu-web)';

export interface PoliticaRed {
  ipPermitida: (ip: string) => boolean;
  puertosPermitidos: readonly number[];
}

export const POLITICA_PUBLICA: PoliticaRed = {
  ipPermitida: esIpPublica,
  puertosPermitidos: [80, 443],
};

export interface OpcionesDescarga {
  /** Redirecciones que se siguen. Con 0 se devuelve la propia respuesta 3xx. */
  seguirRedirecciones: number;
  /** Máximo de bytes del cuerpo, ya descomprimido. */
  maxBytes: number;
  /** Plazo total, redirecciones y lectura incluidas. */
  tiempoMs: number;
}

export type Descargador = (url: URL, opciones: OpcionesDescarga) => Promise<ResultadoCaptura>;

export type Resolutor = (host: string) => Promise<{ address: string; family: number }[]>;

export interface DependenciasDescarga {
  politica?: PoliticaRed;
  resolutor?: Resolutor;
}

const REDIRECCIONES = new Set([301, 302, 303, 307, 308]);

/** Lo mínimo que se necesita de un resolvedor de nombres (el de Node, o uno falso en las pruebas). */
export interface ResolvedorDeDirecciones {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
}

/** Errores de quien resuelve (servidor DNS caído o lento), distintos de «el nombre no existe». */
const FALLOS_DEL_RESOLVEDOR = new Set(['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED', 'EREFUSED', 'ECONNRESET', 'ECANCELLED', 'ENOTINITIALIZED', 'EBADRESP']);
const CODIGO_DNS_SIN_RESPUESTA = 'ERR_DNS_SIN_RESPUESTA';

/**
 * Resuelve con c-ares (el resolvedor propio de Node, asíncrono y con plazo), no con «dns.lookup»: este último
 * usa el grupo de 4 hilos del sistema y un dominio con DNS lentísimo, escogido por un atacante, los ocuparía
 * todos y dejaría sin servicio al resto (también a la lectura de archivos de la propia aplicación).
 */
export function crearResolutorDns(resolvedor: ResolvedorDeDirecciones): Resolutor {
  return async (host) => {
    const [v4, v6] = await Promise.allSettled([resolvedor.resolve4(host), resolvedor.resolve6(host)]);
    const direcciones = [
      ...(v4.status === 'fulfilled' ? v4.value.map((address) => ({ address, family: 4 })) : []),
      ...(v6.status === 'fulfilled' ? v6.value.map((address) => ({ address, family: 6 })) : []),
    ];
    if (direcciones.length > 0) return direcciones;
    const fallos = [v4, v6].flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
    const delResolvedor = fallos.find((f) => FALLOS_DEL_RESOLVEDOR.has((f as NodeJS.ErrnoException | null)?.code ?? ''));
    if (delResolvedor !== undefined)
      throw Object.assign(new Error('El DNS no respondió.'), {
        code: CODIGO_DNS_SIN_RESPUESTA,
      });
    // Los dos dicen «no hay»: el nombre no existe (o no tiene direcciones).
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  };
}

const resolutorDns: Resolutor = crearResolutorDns(new dns.promises.Resolver({ timeout: 3_000, tries: 2 }));

class ErrorIpNoPublica extends Error {
  readonly code = 'ERR_IP_NO_PUBLICA';
}

interface Contexto {
  politica: PoliticaRed;
  resolutor: Resolutor;
  /** Se marca cuando se rechaza una IP, para informarlo con precisión aunque Node envuelva el error. */
  registro: { ipBloqueada: boolean };
}

const error = (codigo: CodigoError, mensaje: string): { ok: false; error: ErrorCaptura } => ({
  ok: false,
  error: { codigo, mensaje },
});

const sinCorchetes = (host: string) => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);

function validarDestino(url: URL, politica: PoliticaRed): { ok: false; error: ErrorCaptura } | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return error('protocolo', `Protocolo no permitido: ${url.protocol}`);
  }
  if (url.username !== '' || url.password !== '') {
    return error('url-no-valida', 'La dirección lleva usuario o contraseña.');
  }
  const puerto = url.port !== '' ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!politica.puertosPermitidos.includes(puerto)) return error('puerto-no-permitido', `Puerto no permitido: ${puerto}`);

  // Una IP escrita a mano no pasa por el DNS ni, por tanto, por el filtro de «lookup».
  const host = sinCorchetes(url.hostname);
  if (isIP(host) !== 0 && !politica.ipPermitida(host)) {
    return error('ip-no-publica', 'La dirección es una IP que no es pública.');
  }
  // El resolvedor DNS no lee /etc/hosts, así que «localhost» no llegaría a dar una IP que filtrar: se rechaza aquí.
  const nombre = host.toLowerCase().replace(/\.$/, '');
  if ((nombre === 'localhost' || nombre.endsWith('.localhost')) && !politica.ipPermitida('127.0.0.1')) {
    return error('ip-no-publica', 'La dirección apunta a esta misma máquina.');
  }
  return null;
}

function crearLookup(contexto: Contexto): LookupFunction {
  return (hostname, opciones, devolver) => {
    contexto.resolutor(hostname).then(
      (direcciones) => {
        if (direcciones.length === 0) {
          devolver(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), '');
          return;
        }
        // Una sola dirección no pública invalida el nombre entero.
        if (direcciones.some((d) => !contexto.politica.ipPermitida(d.address))) {
          contexto.registro.ipBloqueada = true;
          devolver(new ErrorIpNoPublica('El nombre apunta a una dirección que no es pública.'), '');
          return;
        }
        const elegidas = opciones.family === 4 || opciones.family === 6 ? direcciones.filter((d) => d.family === opciones.family) : direcciones;
        if (elegidas.length === 0) {
          devolver(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), '');
        } else if (opciones.all) {
          devolver(null, elegidas);
        } else {
          devolver(null, elegidas[0].address, elegidas[0].family);
        }
      },
      (causa: unknown) => devolver(causa as NodeJS.ErrnoException, ''),
    );
  };
}

const primero = (valor: string | string[] | undefined): string | undefined => (Array.isArray(valor) ? valor[0] : valor);

const aFecha = (texto: string | undefined): string | null => {
  if (!texto) return null;
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
};

function infoTls(socket: TLSSocket): InfoTls {
  const cert = socket.getPeerCertificate(false);
  const hayCertificado = cert !== null && cert !== undefined && Object.keys(cert).length > 0;
  // En Node, «authorizationError» es el código de OpenSSL (texto) aunque los tipos digan Error.
  const causa = socket.authorizationError as unknown;
  const errorAutorizacion = socket.authorized
    ? null
    : typeof causa === 'string'
      ? causa
      : causa instanceof Error
        ? ((causa as NodeJS.ErrnoException).code ?? causa.message)
        : 'DESCONOCIDO';

  return {
    protocolo: socket.getProtocol() ?? null,
    autorizado: socket.authorized,
    errorAutorizacion,
    validoDesde: hayCertificado ? aFecha(cert.valid_from) : null,
    validoHasta: hayCertificado ? aFecha(cert.valid_to) : null,
    emisor: hayCertificado ? (primero(cert.issuer?.O) ?? primero(cert.issuer?.CN) ?? null) : null,
    sujeto: hayCertificado ? (primero(cert.subject?.CN) ?? null) : null,
    alternativos: hayCertificado
      ? (cert.subjectaltname ?? '')
          .split(',')
          .map((entrada) => entrada.trim())
          .filter((entrada) => entrada.startsWith('DNS:'))
          .map((entrada) => entrada.slice(4))
      : [],
  };
}

interface Salto {
  res: http.IncomingMessage;
  tls: InfoTls | null;
}

function pedirUnaVez(url: URL, senal: AbortSignal, contexto: Contexto): Promise<Salto> {
  return new Promise((resolver, rechazar) => {
    const esHttps = url.protocol === 'https:';
    const host = sinCorchetes(url.hostname);
    const opciones: https.RequestOptions = {
      method: 'GET',
      host,
      port: url.port !== '' ? Number(url.port) : esHttps ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'es,en;q=0.5',
        connection: 'close',
      },
      lookup: crearLookup(contexto),
      signal: senal,
      agent: false,
    };
    if (esHttps) {
      // Un analizador tiene que poder ver lo que está mal: se acepta el
      // certificado aunque no sea válido y se anota qué le pasa. Se permiten
      // protocolos antiguos solo para poder avisar de que el servidor los usa.
      // No se envía nada sensible, así que no hay nada que proteger aquí.
      Object.assign(opciones, {
        rejectUnauthorized: false,
        minVersion: 'TLSv1',
        ciphers: 'DEFAULT:@SECLEVEL=0',
        servername: isIP(host) === 0 ? host : undefined,
      });
    }
    const peticion = (esHttps ? https : http).request(opciones, (res) => {
      resolver({ res, tls: esHttps ? infoTls(res.socket as TLSSocket) : null });
    });
    peticion.once('error', rechazar);
    peticion.end();
  });
}

function crearDecodificador(codificacion: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null | 'desconocida' {
  switch ((codificacion ?? '').trim().toLowerCase()) {
    case '':
    case 'identity':
      return null;
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      return 'desconocida';
  }
}

interface CuerpoLeido {
  cuerpo: string | null;
  estadoCuerpo: EstadoCuerpo;
  bytesLeidos: number;
}

/**
 * Pasa los bytes de la página a texto con la codificación que declara: primero la cabecera «Content-Type»,
 * después un «<meta charset>» de los primeros 1024 bytes (como hace un navegador), y si no hay ninguna, UTF-8.
 * Una web antigua en ISO-8859-1 leída como UTF-8 llena el texto de «�» y rompe, por ejemplo, el reconocimiento
 * de «Política de privacidad».
 */
export function decodificarHtml(bytes: Buffer, contentType: string | undefined): string {
  const declarada =
    /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType ?? '')?.[1] ??
    /<meta[^>]{0,200}?charset\s*=\s*["']?([\w:.-]+)/i.exec(bytes.subarray(0, 1024).toString('latin1'))?.[1];
  if (declarada !== undefined) {
    try {
      return new TextDecoder(declarada.toLowerCase(), { fatal: false }).decode(bytes);
    } catch {
      // Una codificación que Node no conoce: se lee como UTF-8.
    }
  }
  return bytes.toString('utf8');
}

const OMITIDO: CuerpoLeido = {
  cuerpo: null,
  estadoCuerpo: 'omitido',
  bytesLeidos: 0,
};

async function leerCuerpo(res: http.IncomingMessage, estado: number, cabeceras: Record<string, string[]>, maxBytes: number): Promise<CuerpoLeido> {
  const tipo = (cabeceras['content-type']?.[0] ?? '').toLowerCase();
  const esHtml = tipo.includes('text/html') || tipo.includes('application/xhtml+xml');
  if (estado < 200 || estado > 299 || !esHtml) return OMITIDO;

  const decodificador = crearDecodificador(cabeceras['content-encoding']?.[0]);
  if (decodificador === 'desconocida') return OMITIDO;

  let origen: Readable = res;
  if (decodificador) {
    res.once('error', (causa) => decodificador.destroy(causa));
    origen = res.pipe(decodificador);
  }

  const trozos: Buffer[] = [];
  let bytes = 0;
  let recortado = false;
  let interrumpido = false;
  try {
    for await (const trozo of origen) {
      const datos = trozo as Buffer;
      if (bytes + datos.length > maxBytes) {
        trozos.push(datos.subarray(0, maxBytes - bytes));
        bytes = maxBytes;
        recortado = true;
        break;
      }
      trozos.push(datos);
      bytes += datos.length;
    }
  } catch {
    // Corte de la conexión, plazo agotado o datos comprimidos corruptos: se conserva lo leído.
    interrumpido = true;
  } finally {
    origen.destroy();
    res.destroy();
  }

  return {
    cuerpo: decodificarHtml(Buffer.concat(trozos), cabeceras['content-type']?.[0]),
    estadoCuerpo: interrumpido ? 'interrumpido' : recortado ? 'recortado' : 'completo',
    bytesLeidos: bytes,
  };
}

const CODIGOS_DNS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'EAI_NODATA', 'EAI_NONAME']);

function codigoDe(causa: unknown): string | undefined {
  if (typeof causa !== 'object' || causa === null) return undefined;
  const directo = (causa as NodeJS.ErrnoException).code;
  if (directo) return directo;
  // Con varias direcciones, Node agrupa los fallos en un AggregateError.
  const internos = (causa as { errors?: unknown[] }).errors;
  return Array.isArray(internos) && internos.length > 0 ? codigoDe(internos[0]) : undefined;
}

function traducirError(causa: unknown, contexto: Contexto, senal: AbortSignal): ErrorCaptura {
  if (contexto.registro.ipBloqueada) {
    return {
      codigo: 'ip-no-publica',
      mensaje: 'El nombre apunta a una dirección que no es pública.',
    };
  }
  const codigo = codigoDe(causa);
  if (senal.aborted || codigo === 'ABORT_ERR' || codigo === CODIGO_DNS_SIN_RESPUESTA) {
    return {
      codigo: 'tiempo-agotado',
      mensaje: 'La web no respondió dentro del plazo.',
    };
  }
  if (codigo && CODIGOS_DNS.has(codigo)) {
    return { codigo: 'dns', mensaje: 'El nombre no se encuentra en el DNS.' };
  }
  return {
    codigo: 'conexion',
    mensaje: `No se pudo conectar (${codigo ?? 'error de red'}).`,
  };
}

const aCabeceras = (res: http.IncomingMessage): Record<string, string[]> =>
  Object.fromEntries(Object.entries(res.headersDistinct).filter((par): par is [string, string[]] => par[1] !== undefined));

export function crearDescargador(dependencias: DependenciasDescarga = {}): Descargador {
  const politica = dependencias.politica ?? POLITICA_PUBLICA;
  const resolutor = dependencias.resolutor ?? resolutorDns;

  return async (urlInicial, opciones) => {
    const inicio = performance.now();
    const senal = AbortSignal.timeout(opciones.tiempoMs);
    const contexto: Contexto = {
      politica,
      resolutor,
      registro: { ipBloqueada: false },
    };

    const redirecciones: SaltoRedireccion[] = [];
    const certificados: CertificadoVisto[] = [];
    let actual = urlInicial;

    try {
      for (;;) {
        const invalido = validarDestino(actual, politica);
        if (invalido) return invalido;

        const { res, tls } = await pedirUnaVez(actual, senal, contexto);
        if (tls && !certificados.some((c) => c.host === actual.hostname)) {
          certificados.push({ host: actual.hostname, tls });
        }

        const estado = res.statusCode ?? 0;
        const cabeceras = aCabeceras(res);
        const ubicacion = cabeceras['location']?.[0] ?? null;

        if (REDIRECCIONES.has(estado) && ubicacion !== null && opciones.seguirRedirecciones > 0) {
          res.destroy();
          if (redirecciones.length >= opciones.seguirRedirecciones) {
            return error('redirecciones', `Más de ${opciones.seguirRedirecciones} redirecciones seguidas.`);
          }
          redirecciones.push({
            url: actual.href,
            estado,
            ubicacion,
            setCookie: cabeceras['set-cookie'] ?? [],
          });
          try {
            actual = new URL(ubicacion, actual);
          } catch {
            return error('respuesta-invalida', 'La redirección lleva una dirección que no se entiende.');
          }
          continue;
        }

        const cuerpo = await leerCuerpo(res, estado, cabeceras, opciones.maxBytes);
        res.destroy();
        return {
          ok: true,
          respuesta: {
            urlFinal: actual.href,
            redirecciones,
            estado,
            cabeceras,
            certificados,
            ...cuerpo,
            duracionMs: Math.round(performance.now() - inicio),
          },
        };
      }
    } catch (causa) {
      return { ok: false, error: traducirError(causa, contexto, senal) };
    }
  };
}

/** El que usa la aplicación: política pública, sin forma de cambiarla. */
export const descargadorSeguro: Descargador = crearDescargador();
