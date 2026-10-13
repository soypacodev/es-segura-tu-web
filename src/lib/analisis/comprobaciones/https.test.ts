import { describe, expect, it } from 'vitest';
import type { Hallazgo, InfoTls } from '../tipos';
import { AHORA, HTTP_REDIRIGE, bien, mal, respuesta, sitio, tls } from '../pruebas/construir';
import { analizarHsts, clasificarErrorCertificado, comprobarHttps, umbralesDeCaducidad } from './https';

const hallazgo = (hallazgos: Hallazgo[], id: string): Hallazgo => {
  const encontrado = hallazgos.find((x) => x.id === id);
  if (!encontrado) throw new Error(`No hay hallazgo «${id}» en: ${hallazgos.map((x) => x.id).join(', ')}`);
  return encontrado;
};

const DIA = 86_400_000;
/** Fecha de caducidad a «n» días justos de AHORA (más una hora, para no caer en el límite). */
const enDias = (n: number) => new Date(AHORA.getTime() + n * DIA + 3_600_000).toISOString();

const conCertificados = (...tlsPorHost: [string, InfoTls][]) =>
  sitio({ https: bien(respuesta({ certificados: tlsPorHost.map(([host, info]) => ({ host, tls: info })) })) });

const conHsts = (valor: string | undefined) =>
  sitio({ https: bien(respuesta({ cabeceras: valor === undefined ? {} : { 'strict-transport-security': [valor] } })) });

describe('comprobarHttps · un sitio perfecto', () => {
  it('todo correcto, incluida la precarga de HSTS', () => {
    const resultados = comprobarHttps(sitio(), AHORA);
    expect(resultados.map((x) => `${x.id}:${x.resultado}`)).toEqual([
      'https.disponible:correcto',
      'https.final.seguro:correcto',
      'https.certificado.valido:correcto',
      'https.certificado.caducidad:correcto',
      'https.tls.version:correcto',
      'https.redireccion.http:correcto',
      'https.hsts:correcto',
      'https.hsts.subdominios:correcto',
      'https.hsts.precarga:correcto',
    ]);
    expect(resultados.every((x) => x.techo === undefined)).toBe(true);
    expect(resultados.every((x) => x.categoria === 'https')).toBe(true);
  });
});

describe('comprobarHttps · disponibilidad', () => {
  it.each(['conexion', 'tiempo-agotado', 'redirecciones'] as const)('si HTTPS falla (%s) es un fallo con techo F y nada más', (codigo) => {
    const r = comprobarHttps(sitio({ https: mal(codigo) }), AHORA);
    expect(r).toEqual([
      { id: 'https.disponible', categoria: 'https', resultado: 'fallo', gravedad: 'critica', peso: 10, techo: 'F', datos: { codigo } },
    ]);
  });

  it('si la web redirige de HTTPS a HTTP, el destino final no es seguro (techo F) y no se evalúa HSTS', () => {
    const r = comprobarHttps(sitio({ https: bien(respuesta({ urlFinal: 'http://ejemplo.com/' })) }), AHORA);
    expect(hallazgo(r, 'https.final.seguro')).toMatchObject({ resultado: 'fallo', techo: 'F' });
    expect(r.some((x) => x.id.startsWith('https.hsts'))).toBe(false);
  });
});

describe('comprobarHttps · certificado', () => {
  it.each([
    ['CERT_HAS_EXPIRED', 'caducado', 'D'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'autofirmado', 'F'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'autofirmado', 'F'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'nombre-no-coincide', 'F'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'cadena-incompleta', 'C'],
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'cadena-incompleta', 'C'],
    ['CERT_NOT_YET_VALID', 'aun-no-valido', 'F'],
    ['CERT_REVOKED', 'revocado', 'F'],
    ['LO_QUE_SEA', 'otro', 'F'],
  ] as const)('%s → %s (techo %s)', (codigo, motivo, techo) => {
    const r = comprobarHttps(conCertificados(['ejemplo.com', tls({ autorizado: false, errorAutorizacion: codigo })]), AHORA);
    expect(hallazgo(r, 'https.certificado.valido')).toMatchObject({
      resultado: 'fallo',
      gravedad: 'critica',
      techo,
      datos: { host: 'ejemplo.com', motivo, codigo },
    });
    // Si no es de fiar, de su caducidad no se dice nada.
    expect(hallazgo(r, 'https.certificado.caducidad').resultado).toBe('no-aplica');
  });

  it('con varios servidores, manda el peor: un autofirmado pesa más que uno caducado', () => {
    const r = comprobarHttps(
      conCertificados(
        ['ejemplo.com', tls({ autorizado: false, errorAutorizacion: 'CERT_HAS_EXPIRED' })],
        ['www.ejemplo.com', tls({ autorizado: false, errorAutorizacion: 'DEPTH_ZERO_SELF_SIGNED_CERT' })],
      ),
      AHORA,
    );
    expect(hallazgo(r, 'https.certificado.valido')).toMatchObject({ techo: 'F', datos: { host: 'www.ejemplo.com', motivo: 'autofirmado' } });
  });

  it('el motivo desconocido o sin código cae en «otro»', () => {
    expect(clasificarErrorCertificado(null)).toBe('otro');
  });
});

describe('comprobarHttps · caducidad próxima', () => {
  it.each([
    [100, 'correcto'],
    [30, 'correcto'],
    [29, 'mejorable'],
    [15, 'mejorable'],
    [14, 'fallo'],
    [1, 'fallo'],
    [0, 'fallo'],
  ] as const)('a %i días → %s', (dias, esperado) => {
    const r = comprobarHttps(conCertificados(['ejemplo.com', tls({ validoHasta: enDias(dias) })]), AHORA);
    expect(hallazgo(r, 'https.certificado.caducidad')).toMatchObject({ resultado: esperado, datos: { host: 'ejemplo.com', dias } });
  });

  it('con varios servidores avisa del que caduca antes', () => {
    const r = comprobarHttps(
      conCertificados(['ejemplo.com', tls({ validoHasta: enDias(200) })], ['www.ejemplo.com', tls({ validoHasta: enDias(10) })]),
      AHORA,
    );
    expect(hallazgo(r, 'https.certificado.caducidad')).toMatchObject({ resultado: 'fallo', datos: { host: 'www.ejemplo.com', dias: 10 } });
  });
});

describe('caducidad según la duración del certificado', () => {
  const vida = (dias: number) => ({ validoDesde: new Date(AHORA.getTime() - 1000).toISOString(), validoHasta: new Date(AHORA.getTime() - 1000 + dias * DIA).toISOString() });
  it.each([
    [90, 14, 29],
    [200, 14, 29],
    [45, 7, 15],
    [6, 1, 2],
  ])('un certificado de %i días avisa a %i (fallo) y %i (mejorable)', (dias, fallo, mejorable) => {
    expect(umbralesDeCaducidad(vida(dias))).toEqual({ fallo, mejorable });
  });
  it('sin fechas válidas, los umbrales de siempre', () => {
    expect(umbralesDeCaducidad(undefined)).toEqual({ fallo: 14, mejorable: 29 });
    expect(umbralesDeCaducidad({ validoDesde: null, validoHasta: null })).toEqual({ fallo: 14, mejorable: 29 });
    expect(umbralesDeCaducidad({ validoDesde: 'x', validoHasta: 'y' })).toEqual({ fallo: 14, mejorable: 29 });
    expect(umbralesDeCaducidad({ validoDesde: '2026-02-01T00:00:00Z', validoHasta: '2026-01-01T00:00:00Z' })).toEqual({ fallo: 14, mejorable: 29 });
  });
  it('un certificado de 6 días recién renovado (5 días de margen) no se da por «a punto de caducar»... pero a 1 día sí', () => {
    const recien = tls({ ...vida(6), validoHasta: new Date(AHORA.getTime() + 5 * DIA).toISOString() });
    expect(hallazgo(comprobarHttps(conCertificados(['ejemplo.com', recien]), AHORA), 'https.certificado.caducidad').resultado).toBe('correcto');
    const casi = tls({ validoDesde: vida(6).validoDesde, validoHasta: new Date(AHORA.getTime() + 0.5 * DIA).toISOString() });
    expect(hallazgo(comprobarHttps(conCertificados(['ejemplo.com', casi]), AHORA), 'https.certificado.caducidad').resultado).toBe('fallo');
  });
});

describe('comprobarHttps · versión de TLS', () => {
  it.each([
    ['TLSv1.3', 'correcto'],
    ['TLSv1.2', 'correcto'],
    ['TLSv1.1', 'fallo'],
    ['TLSv1', 'fallo'],
    ['SSLv3', 'fallo'],
  ] as const)('%s → %s', (protocolo, esperado) => {
    const r = comprobarHttps(conCertificados(['ejemplo.com', tls({ protocolo })]), AHORA);
    expect(hallazgo(r, 'https.tls.version')).toMatchObject({ resultado: esperado, datos: { protocolo } });
  });

  it('sin protocolo conocido, no aplica; con varios servidores manda el más antiguo', () => {
    expect(hallazgo(comprobarHttps(conCertificados(['ejemplo.com', tls({ protocolo: null })]), AHORA), 'https.tls.version').resultado).toBe('no-aplica');
    const r = comprobarHttps(conCertificados(['ejemplo.com', tls()], ['www.ejemplo.com', tls({ protocolo: 'TLSv1.1' })]), AHORA);
    expect(hallazgo(r, 'https.tls.version')).toMatchObject({ resultado: 'fallo', datos: { host: 'www.ejemplo.com', protocolo: 'TLSv1.1' } });
  });
});

describe('comprobarHttps · de HTTP a HTTPS', () => {
  const conHttp = (http: Parameters<typeof sitio>[0] extends infer T ? (T extends { http?: infer H } ? H : never) : never) =>
    hallazgo(comprobarHttps(sitio({ http }), AHORA), 'https.redireccion.http');
  const redirige = (estado: number, ubicacion?: string) =>
    bien(respuesta({ estado, cabeceras: ubicacion === undefined ? {} : { location: [ubicacion] }, certificados: [], cuerpo: null, estadoCuerpo: 'omitido' }));

  it('301 y 308 hacia https son correctos', () => {
    expect(conHttp(HTTP_REDIRIGE).resultado).toBe('correcto');
    expect(conHttp(redirige(308, 'https://ejemplo.com/')).resultado).toBe('correcto');
  });

  it('302, 303 y 307 hacia https son mejorables (temporales)', () => {
    for (const estado of [302, 303, 307]) {
      expect(conHttp(redirige(estado, 'https://ejemplo.com/'))).toMatchObject({ resultado: 'mejorable', datos: { estado, permanente: false } });
    }
  });

  it('a https pero de otro dominio es mejorable (el dominio de origen queda sin HSTS); al mismo dominio, con o sin www, es correcto', () => {
    expect(conHttp(redirige(301, 'https://www.ejemplo.com/'))).toMatchObject({ resultado: 'correcto' });
    expect(conHttp(redirige(301, 'https://otro-dominio.com/'))).toMatchObject({ resultado: 'mejorable', datos: { otroDominio: 'otro-dominio.com' } });
    expect(conHttp(redirige(301, 'https://ejemplo.com.falso.net/'))).toMatchObject({ resultado: 'mejorable' });
  });

  it('una redirección que sigue en http, o sin destino, es un fallo', () => {
    expect(conHttp(redirige(301, 'http://ejemplo.com/otra'))).toMatchObject({ resultado: 'fallo', datos: { destino: 'http' } });
    expect(conHttp(redirige(301, '/inicio'))).toMatchObject({ resultado: 'fallo', datos: { destino: 'http' } });
    expect(conHttp(redirige(301))).toMatchObject({ resultado: 'fallo', datos: { destino: 'ninguno' } });
  });

  it('servir la página en http sin redirigir es un fallo', () => {
    expect(conHttp(redirige(200))).toMatchObject({ resultado: 'fallo', datos: { sirveContenido: true } });
  });

  it('un error 4xx/5xx en http, o ninguna respuesta, es mejorable', () => {
    expect(conHttp(redirige(404)).resultado).toBe('mejorable');
    expect(conHttp(mal('conexion'))).toMatchObject({ resultado: 'mejorable', datos: { motivo: 'conexion' } });
  });
});

describe('analizarHsts', () => {
  it.each([
    ['max-age=31536000', { maxAge: 31536000, subdominios: false, precarga: false }],
    ['max-age=31536000; includeSubDomains; preload', { maxAge: 31536000, subdominios: true, precarga: true }],
    ['MAX-AGE=100; INCLUDESUBDOMAINS', { maxAge: 100, subdominios: true, precarga: false }],
    ['max-age="600"', { maxAge: 600, subdominios: false, precarga: false }],
    ['  max-age = 600 ;preload ', { maxAge: 600, subdominios: false, precarga: true }],
    ['max-age=abc', { maxAge: null, subdominios: false, precarga: false }],
    ['max-age=-5', { maxAge: null, subdominios: false, precarga: false }],
    ['includeSubDomains', { maxAge: null, subdominios: true, precarga: false }],
    ['max-age=10; max-age=20', { maxAge: 10, subdominios: false, precarga: false }],
    ['', { maxAge: null, subdominios: false, precarga: false }],
  ])('«%s»', (valor, esperado) => expect(analizarHsts(valor)).toEqual(esperado));
});

describe('comprobarHttps · HSTS', () => {
  const principal = (valor: string | undefined) => hallazgo(comprobarHttps(conHsts(valor), AHORA), 'https.hsts');

  it('sin cabecera es un fallo y lo demás de HSTS no aplica', () => {
    const r = comprobarHttps(conHsts(undefined), AHORA);
    expect(hallazgo(r, 'https.hsts').resultado).toBe('fallo');
    expect(hallazgo(r, 'https.hsts.subdominios').resultado).toBe('no-aplica');
    expect(hallazgo(r, 'https.hsts.precarga').resultado).toBe('no-aplica');
  });

  it.each([
    ['max-age=0', 'fallo', { motivo: 'max-age-cero' }],
    ['max-age=abc', 'fallo', { motivo: 'sin-max-age' }],
    ['includeSubDomains', 'fallo', { motivo: 'sin-max-age' }],
    ['max-age=3600', 'mejorable', { maxAge: 3600 }],
    ['max-age=15551999', 'mejorable', { maxAge: 15551999 }],
    ['max-age=15552000', 'correcto', { maxAge: 15552000 }],
    ['MAX-AGE=63072000', 'correcto', { maxAge: 63072000 }],
  ] as const)('«%s» → %s', (valor, esperado, datos) => {
    expect(principal(valor)).toMatchObject({ resultado: esperado, datos });
  });

  it('includeSubDomains: correcto si está, mejorable si falta, no aplica si HSTS falla', () => {
    const sub = (valor: string) => hallazgo(comprobarHttps(conHsts(valor), AHORA), 'https.hsts.subdominios').resultado;
    expect(sub('max-age=31536000; includeSubDomains')).toBe('correcto');
    expect(sub('max-age=31536000')).toBe('mejorable');
    expect(sub('max-age=0; includeSubDomains')).toBe('no-aplica');
  });

  it('precarga: solo se evalúa si se pide, y exige subdominios y un año; nunca puntúa', () => {
    const pre = (valor: string) => hallazgo(comprobarHttps(conHsts(valor), AHORA), 'https.hsts.precarga');
    expect(pre('max-age=31536000; includeSubDomains').resultado).toBe('no-aplica');
    expect(pre('max-age=31536000; includeSubDomains; preload')).toMatchObject({ resultado: 'correcto', peso: 0 });
    expect(pre('max-age=31536000; preload')).toMatchObject({ resultado: 'mejorable', datos: { subdominios: false } });
    expect(pre('max-age=15552000; includeSubDomains; preload').resultado).toBe('mejorable');
  });
});
