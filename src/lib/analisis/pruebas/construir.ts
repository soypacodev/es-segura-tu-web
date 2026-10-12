// Constructores de capturas para las pruebas de las comprobaciones.
// Parten de una web «perfecta» y cada prueba cambia solo lo que le interesa.

import type { CapturaSitio, InfoTls, ResultadoCaptura, RespuestaCapturada } from '../tipos';

export const AHORA = new Date('2026-10-12T12:00:00.000Z');

export function tls(cambios: Partial<InfoTls> = {}): InfoTls {
  return {
    protocolo: 'TLSv1.3',
    autorizado: true,
    errorAutorizacion: null,
    validoDesde: '2026-07-01T00:00:00.000Z',
    validoHasta: '2027-01-01T00:00:00.000Z', // a 81 días de AHORA
    emisor: "Let's Encrypt",
    sujeto: 'ejemplo.com',
    alternativos: ['ejemplo.com'],
    ...cambios,
  };
}

export const CABECERAS_BUENAS: Record<string, string[]> = {
  'strict-transport-security': ['max-age=63072000; includeSubDomains; preload'],
  'content-security-policy': ["default-src 'self'; script-src 'self' 'nonce-abc123'; object-src 'none'; frame-ancestors 'none'"],
  'x-content-type-options': ['nosniff'],
  'referrer-policy': ['strict-origin-when-cross-origin'],
  'permissions-policy': ['camera=(), microphone=(), geolocation=()'],
};

export function respuesta(cambios: Partial<RespuestaCapturada> = {}): RespuestaCapturada {
  return {
    urlFinal: 'https://ejemplo.com/',
    redirecciones: [],
    estado: 200,
    cabeceras: { ...CABECERAS_BUENAS },
    certificados: [{ host: 'ejemplo.com', tls: tls() }],
    cuerpo: '<!doctype html><html><body>hola<footer><a href="/privacidad">Política de privacidad</a> <a href="/aviso-legal">Aviso legal</a></footer></body></html>',
    estadoCuerpo: 'completo',
    bytesLeidos: 44,
    duracionMs: 20,
    ...cambios,
  };
}

export const bien = (r: RespuestaCapturada): ResultadoCaptura => ({ ok: true, respuesta: r });

export const mal = (codigo: Extract<ResultadoCaptura, { ok: false }>['error']['codigo'], mensaje = 'prueba'): ResultadoCaptura => ({
  ok: false,
  error: { codigo, mensaje },
});

/** Lo que devuelve un sitio que redirige HTTP → HTTPS como es debido. */
export const HTTP_REDIRIGE: ResultadoCaptura = bien(
  respuesta({
    urlFinal: 'http://ejemplo.com/',
    estado: 301,
    cabeceras: { location: ['https://ejemplo.com/'] },
    certificados: [],
    cuerpo: null,
    estadoCuerpo: 'omitido',
    bytesLeidos: 0,
  }),
);

export function sitio(cambios: Partial<CapturaSitio> = {}): CapturaSitio {
  return { host: 'ejemplo.com', https: bien(respuesta()), http: HTTP_REDIRIGE, ...cambios };
}

/** Un sitio perfecto, con una sola cabecera cambiada o quitada (valor undefined). */
export function sitioConCabeceras(cambios: Record<string, string[] | undefined>): CapturaSitio {
  const cabeceras: Record<string, string[]> = { ...CABECERAS_BUENAS };
  for (const [nombre, valor] of Object.entries(cambios)) {
    if (valor === undefined) delete cabeceras[nombre];
    else cabeceras[nombre] = valor;
  }
  return sitio({ https: bien(respuesta({ cabeceras })) });
}
