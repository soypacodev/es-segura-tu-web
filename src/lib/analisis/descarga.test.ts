import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  USER_AGENT,
  crearDescargador,
  descargadorSeguro,
  type DependenciasDescarga,
  type OpcionesDescarga,
} from './descarga';

const OPCIONES: OpcionesDescarga = { seguirRedirecciones: 5, maxBytes: 1_000_000, tiempoMs: 5_000 };

// «sitio.test» es el servidor local de estas pruebas; el resto de nombres
// existen solo para provocar un caso concreto.
const RESOLUCIONES: Record<string, { address: string; family: number }[]> = {
  'sitio.test': [{ address: '127.0.0.1', family: 4 }],
  'interno.test': [{ address: '10.0.0.5', family: 4 }],
  'mixto.test': [
    { address: '93.184.216.34', family: 4 },
    { address: '10.0.0.1', family: 4 },
  ],
  'metadatos.test': [{ address: '169.254.169.254', family: 4 }],
  'v6.test': [{ address: '::ffff:127.0.0.1', family: 6 }],
};

const resolutor: NonNullable<DependenciasDescarga['resolutor']> = async (host) => {
  const direcciones = RESOLUCIONES[host];
  if (!direcciones) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  return direcciones;
};

const HTML = (texto: string) => `<!doctype html><html><body>${texto}</body></html>`;
const BOMBA = zlib.gzipSync(Buffer.alloc(50 * 1024 * 1024)); // 50 MB de ceros en unos 50 KB

let servidor: http.Server;
let puerto: number;
const peticiones: http.IncomingHttpHeaders[] = [];

function manejar(req: http.IncomingMessage, res: http.ServerResponse) {
  peticiones.push(req.headers);
  const html = { 'content-type': 'text/html; charset=utf-8' };
  const ruta = req.url ?? '/';
  const aqui = `http://sitio.test:${puerto}`;

  switch (ruta) {
    case '/html':
      res.writeHead(200, { ...html, 'set-cookie': ['a=1; Secure', 'b=2; HttpOnly'], 'x-prueba': 'hola' });
      return res.end(HTML('hola'));
    case '/json':
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"a":1}');
    case '/204':
      res.writeHead(204);
      return res.end();
    case '/a':
      res.writeHead(302, { location: '/b', 'set-cookie': 'salto=1' });
      return res.end();
    case '/b':
      res.writeHead(301, { location: `${aqui}/c` });
      return res.end();
    case '/c':
      res.writeHead(200, html);
      return res.end(HTML('fin'));
    case '/bucle':
      res.writeHead(302, { location: '/bucle' });
      return res.end();
    case '/sin-location':
      res.writeHead(302);
      return res.end();
    case '/a-ftp':
      res.writeHead(302, { location: 'ftp://sitio.test/x' });
      return res.end();
    case '/a-clave':
      res.writeHead(302, { location: `http://usuario:clave@sitio.test:${puerto}/` });
      return res.end();
    case '/a-ip-interna':
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      return res.end();
    case '/a-ip-decimal':
      res.writeHead(302, { location: 'http://2852039166/' /* 169.254.169.254 en decimal */ });
      return res.end();
    case '/a-ipv6':
      res.writeHead(302, { location: 'http://[::1]/' });
      return res.end();
    case '/a-otro-puerto':
      res.writeHead(302, { location: 'http://sitio.test:1234/' });
      return res.end();
    case '/a-host-interno':
      res.writeHead(302, { location: `http://interno.test:${puerto}/` });
      return res.end();
    case '/grande':
      res.writeHead(200, html);
      return res.end('a'.repeat(2_000_000));
    case '/exacto':
      res.writeHead(200, html);
      return res.end('a'.repeat(1000));
    case '/bomba':
      res.writeHead(200, { ...html, 'content-encoding': 'gzip' });
      return res.end(BOMBA);
    case '/gzip':
      res.writeHead(200, { ...html, 'content-encoding': 'gzip' });
      return res.end(zlib.gzipSync(HTML('comprimido')));
    case '/brotli':
      res.writeHead(200, { ...html, 'content-encoding': 'br' });
      return res.end(zlib.brotliCompressSync(HTML('brotli')));
    case '/gzip-roto':
      res.writeHead(200, { ...html, 'content-encoding': 'gzip' });
      return res.end(Buffer.from('esto no es gzip'));
    case '/zstd':
      res.writeHead(200, { ...html, 'content-encoding': 'zstd' });
      return res.end('datos');
    case '/colgado':
      return; // no responde nunca
    case '/lento':
      res.writeHead(200, html);
      res.write('<html>parte');
      return; // no termina
    default:
      res.writeHead(404, html);
      return res.end(HTML('no existe'));
  }
}

beforeAll(async () => {
  servidor = http.createServer(manejar);
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  puerto = (servidor.address() as AddressInfo).port;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

const local = () =>
  crearDescargador({
    // El 80 también va permitido, como en producción: así los destinos con IP
    // interna se rechazan por la IP y no por el puerto.
    politica: { ipPermitida: (ip) => ip === '127.0.0.1', puertosPermitidos: [puerto, 80] },
    resolutor,
  });
const dir = (ruta: string) => new URL(`http://sitio.test:${puerto}${ruta}`);

async function exito(ruta: string, opciones: Partial<OpcionesDescarga> = {}) {
  const r = await local()(dir(ruta), { ...OPCIONES, ...opciones });
  if (!r.ok) throw new Error(`Se esperaba éxito en ${ruta}: ${r.error.codigo} · ${r.error.mensaje}`);
  return r.respuesta;
}

async function fallo(ruta: string, opciones: Partial<OpcionesDescarga> = {}) {
  const r = await local()(dir(ruta), { ...OPCIONES, ...opciones });
  if (r.ok) throw new Error(`Se esperaba un fallo en ${ruta}, pero respondió ${r.respuesta.estado}`);
  return r.error;
}

describe('descarga · respuestas normales', () => {
  it('captura estado, cabeceras repetidas y el HTML', async () => {
    const r = await exito('/html');
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toContain('hola');
    expect(r.estadoCuerpo).toBe('completo');
    expect(r.cabeceras['x-prueba']).toEqual(['hola']);
    expect(r.cabeceras['set-cookie']).toEqual(['a=1; Secure', 'b=2; HttpOnly']);
    expect(r.redirecciones).toEqual([]);
    expect(r.certificados).toEqual([]);
    expect(r.urlFinal).toBe(dir('/html').href);
  });

  it('se identifica y no envía cookies, credenciales ni referencia', async () => {
    await exito('/html');
    const enviadas = peticiones[peticiones.length - 1];
    expect(enviadas['user-agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^EsSeguraTuWeb\/\d/);
    for (const prohibida of ['cookie', 'authorization', 'referer', 'proxy-authorization']) {
      expect(enviadas[prohibida]).toBeUndefined();
    }
    expect(enviadas.host).toBe(`sitio.test:${puerto}`);
  });

  it('no lee el cuerpo si no es HTML', async () => {
    const r = await exito('/json');
    expect(r.cuerpo).toBeNull();
    expect(r.estadoCuerpo).toBe('omitido');
    expect(r.bytesLeidos).toBe(0);
  });

  it('no lee el cuerpo de una respuesta que no es 2xx', async () => {
    const r = await exito('/no-existe');
    expect(r.estado).toBe(404);
    expect(r.cuerpo).toBeNull();
    expect(r.estadoCuerpo).toBe('omitido');
  });

  it('una respuesta sin contenido (204) se devuelve sin cuerpo', async () => {
    const r = await exito('/204');
    expect(r.estado).toBe(204);
    expect(r.estadoCuerpo).toBe('omitido');
  });

  it('descomprime gzip y brotli', async () => {
    expect((await exito('/gzip')).cuerpo).toContain('comprimido');
    expect((await exito('/brotli')).cuerpo).toContain('brotli');
  });

  it('una codificación desconocida se omite en lugar de leer basura', async () => {
    const r = await exito('/zstd');
    expect(r.cuerpo).toBeNull();
    expect(r.estadoCuerpo).toBe('omitido');
  });

  it('un gzip corrupto no tumba la captura: se marca como interrumpido', async () => {
    const r = await exito('/gzip-roto');
    expect(r.estado).toBe(200);
    expect(r.estadoCuerpo).toBe('interrumpido');
  });
});

describe('descarga · redirecciones', () => {
  it('sigue la cadena (relativas y absolutas) y la anota', async () => {
    const r = await exito('/a');
    expect(r.urlFinal).toBe(dir('/c').href);
    expect(r.cuerpo).toContain('fin');
    expect(r.redirecciones).toEqual([
      { url: dir('/a').href, estado: 302, ubicacion: '/b', setCookie: ['salto=1'] },
      { url: dir('/b').href, estado: 301, ubicacion: `http://sitio.test:${puerto}/c`, setCookie: [] },
    ]);
  });

  it('con 0 redirecciones devuelve la propia respuesta 3xx (comprobación de HTTP)', async () => {
    const r = await exito('/a', { seguirRedirecciones: 0 });
    expect(r.estado).toBe(302);
    expect(r.cabeceras['location']).toEqual(['/b']);
    expect(r.redirecciones).toEqual([]);
    expect(r.estadoCuerpo).toBe('omitido');
  });

  it('un bucle termina con error «redirecciones»', async () => {
    expect((await fallo('/bucle', { seguirRedirecciones: 3 })).codigo).toBe('redirecciones');
  });

  it('el límite es exacto: con 2 saltos y límite 2 pasa, con límite 1 no', async () => {
    expect((await exito('/a', { seguirRedirecciones: 2 })).redirecciones).toHaveLength(2);
    expect((await fallo('/a', { seguirRedirecciones: 1 })).codigo).toBe('redirecciones');
  });

  it('una 3xx sin Location se devuelve tal cual', async () => {
    const r = await exito('/sin-location');
    expect(r.estado).toBe(302);
    expect(r.redirecciones).toEqual([]);
  });
});

describe('descarga · SSRF a través de redirecciones y DNS', () => {
  it.each([
    ['/a-ftp', 'protocolo'],
    ['/a-clave', 'url-no-valida'],
    ['/a-otro-puerto', 'puerto-no-permitido'],
    ['/a-ip-interna', 'ip-no-publica'],
    ['/a-ip-decimal', 'ip-no-publica'],
    ['/a-ipv6', 'ip-no-publica'],
    ['/a-host-interno', 'ip-no-publica'],
  ])('%s → %s', async (ruta, codigo) => {
    expect((await fallo(ruta)).codigo).toBe(codigo);
  });

  it.each(['interno.test', 'metadatos.test', 'v6.test', 'mixto.test'])(
    'el nombre %s no se alcanza: apunta (aunque sea en parte) a una IP no pública',
    async (host) => {
      // Política pública real: ni siquiera se intenta conectar.
      const descargador = crearDescargador({ resolutor });
      const r = await descargador(new URL(`http://${host}/`), OPCIONES);
      expect(r).toMatchObject({ ok: false, error: { codigo: 'ip-no-publica' } });
    },
  );

  it('el descargador de la aplicación rechaza loopback, IP internas y puertos raros', async () => {
    const casos: [string, string][] = [
      ['http://127.0.0.1/', 'ip-no-publica'],
      ['http://[::1]/', 'ip-no-publica'],
      ['http://169.254.169.254/', 'ip-no-publica'],
      ['https://10.0.0.1/', 'ip-no-publica'],
      ['http://localhost/', 'ip-no-publica'],
      ['http://ejemplo.com:8080/', 'puerto-no-permitido'],
      ['http://ejemplo.com:22/', 'puerto-no-permitido'],
      ['ftp://ejemplo.com/', 'protocolo'],
      ['file:///etc/passwd', 'protocolo'],
      ['http://usuario:clave@ejemplo.com/', 'url-no-valida'],
    ];
    for (const [direccion, codigo] of casos) {
      const r = await descargadorSeguro(new URL(direccion), OPCIONES);
      expect(r, direccion).toMatchObject({ ok: false, error: { codigo } });
    }
  });
});

describe('descarga · límites', () => {
  it('recorta el cuerpo en el máximo y lo dice', async () => {
    const r = await exito('/grande', { maxBytes: 1000 });
    expect(r.estadoCuerpo).toBe('recortado');
    expect(r.cuerpo).toHaveLength(1000);
    expect(r.bytesLeidos).toBe(1000);
  });

  it('un cuerpo que mide justo el máximo no cuenta como recortado', async () => {
    const r = await exito('/exacto', { maxBytes: 1000 });
    expect(r.estadoCuerpo).toBe('completo');
    expect(r.cuerpo).toHaveLength(1000);
  });

  it('una bomba de compresión (50 MB en 50 KB) se corta en el máximo, ya descomprimida', async () => {
    const inicio = performance.now();
    const r = await exito('/bomba', { maxBytes: 10_000 });
    expect(r.estadoCuerpo).toBe('recortado');
    expect(r.cuerpo).toHaveLength(10_000);
    expect(performance.now() - inicio).toBeLessThan(2000);
  });

  it('si la web no responde, falla por plazo', async () => {
    const e = await fallo('/colgado', { tiempoMs: 300 });
    expect(e.codigo).toBe('tiempo-agotado');
  });

  it('si el plazo se agota leyendo el cuerpo, conserva lo recibido y lo marca como interrumpido', async () => {
    const r = await exito('/lento', { tiempoMs: 400 });
    expect(r.estado).toBe(200);
    expect(r.estadoCuerpo).toBe('interrumpido');
    expect(r.cuerpo).toBe('<html>parte');
  });
});

describe('descarga · fallos de red', () => {
  it('un nombre que no existe es un fallo de DNS', async () => {
    const descargador = crearDescargador({ resolutor, politica: { ipPermitida: () => true, puertosPermitidos: [80] } });
    const r = await descargador(new URL('http://noexiste.test/'), OPCIONES);
    expect(r).toMatchObject({ ok: false, error: { codigo: 'dns' } });
  });

  it('un puerto cerrado es un fallo de conexión', async () => {
    const libre = await new Promise<number>((listo) => {
      const temporal = http.createServer().listen(0, '127.0.0.1', () => {
        const { port } = temporal.address() as AddressInfo;
        temporal.close(() => listo(port));
      });
    });
    const descargador = crearDescargador({
      resolutor,
      politica: { ipPermitida: (ip) => ip === '127.0.0.1', puertosPermitidos: [libre] },
    });
    const r = await descargador(new URL(`http://sitio.test:${libre}/`), OPCIONES);
    expect(r).toMatchObject({ ok: false, error: { codigo: 'conexion' } });
  });
});

// ------------------------------------------------------------------
// TLS real, con un certificado autofirmado que se genera al vuelo.
// Si no hay «openssl» (por ejemplo, en Windows), estas pruebas se saltan.
// ------------------------------------------------------------------

function generarCertificado(): { directorio: string; clave: string; cert: string } | null {
  try {
    const directorio = mkdtempSync(path.join(tmpdir(), 'esw-cert-'));
    const claveRuta = path.join(directorio, 'clave.pem');
    const certRuta = path.join(directorio, 'cert.pem');
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
        '-keyout', claveRuta, '-out', certRuta, '-days', '2',
        '-subj', '/CN=sitio.test', '-addext', 'subjectAltName=DNS:sitio.test',
      ],
      { stdio: 'ignore' },
    );
    return { directorio, clave: readFileSync(claveRuta, 'utf8'), cert: readFileSync(certRuta, 'utf8') };
  } catch {
    return null;
  }
}

const credenciales = generarCertificado();

describe.skipIf(!credenciales)('descarga · TLS real con certificado autofirmado', () => {
  let servidorTls: https.Server;
  let puertoTls: number;

  beforeAll(async () => {
    servidorTls = https.createServer({ key: credenciales!.clave, cert: credenciales!.cert }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'strict-transport-security': 'max-age=63072000' });
      res.end(HTML('seguro'));
    });
    await new Promise<void>((listo) => servidorTls.listen(0, '127.0.0.1', listo));
    puertoTls = (servidorTls.address() as AddressInfo).port;
  });

  afterAll(async () => {
    servidorTls.closeAllConnections();
    await new Promise<void>((listo) => servidorTls.close(() => listo()));
    rmSync(credenciales!.directorio, { recursive: true, force: true });
  });

  it('no se queda en el error: devuelve la respuesta y explica qué le pasa al certificado', async () => {
    const descargador = crearDescargador({
      resolutor,
      politica: { ipPermitida: (ip) => ip === '127.0.0.1', puertosPermitidos: [puertoTls] },
    });
    const r = await descargador(new URL(`https://sitio.test:${puertoTls}/`), OPCIONES);
    if (!r.ok) throw new Error(`${r.error.codigo}: ${r.error.mensaje}`);

    expect(r.respuesta.estado).toBe(200);
    expect(r.respuesta.cuerpo).toContain('seguro');
    expect(r.respuesta.cabeceras['strict-transport-security']).toEqual(['max-age=63072000']);
    expect(r.respuesta.certificados).toHaveLength(1);

    const { host, tls } = r.respuesta.certificados[0];
    expect(host).toBe('sitio.test');
    expect(tls.autorizado).toBe(false);
    expect(tls.errorAutorizacion).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    expect(tls.protocolo).toMatch(/^TLSv1\.[23]$/);
    expect(tls.sujeto).toBe('sitio.test');
    expect(tls.alternativos).toContain('sitio.test');
    expect(new Date(tls.validoHasta as string).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(tls.validoDesde as string).getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });
});
