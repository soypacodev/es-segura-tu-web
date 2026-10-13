import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Descargador } from '@/lib/analisis/descarga';
import { HTTP_REDIRIGE, bien, respuesta } from '@/lib/analisis/pruebas/construir';
import type { Evento } from '@/lib/protocolo';

vi.mock('server-only', () => ({}));
// Sin red de verdad: el descargador y el DNS son falsos.
const descargador = vi.fn<Descargador>();
vi.mock('@/lib/analisis/descarga', () => ({ descargadorSeguro: (...args: Parameters<Descargador>) => descargador(...args) }));
vi.mock('@/lib/analisis/dns', async (original) => ({ ...(await original<typeof import('@/lib/analisis/dns')>()), resolvedorReal: () => undefined }));

type Ruta = typeof import('./route');
let POST: Ruta['POST'];

beforeEach(async () => {
  // Un módulo nuevo en cada prueba: así el límite de uso empieza de cero.
  vi.resetModules();
  ({ POST } = await import('./route'));
  descargador.mockReset();
  descargador.mockImplementation(async (url, opciones) => {
    if (opciones.cuerpo === 'bytes') return bien(respuesta({ estado: 404, cuerpo: null, estadoCuerpo: 'omitido', cabeceras: {} }));
    return url.protocol === 'https:' ? bien(respuesta()) : HTTP_REDIRIGE;
  });
});

let contador = 0;
function peticion(cuerpo: unknown, cabeceras: Record<string, string> = {}, ip = `203.0.113.${++contador}`) {
  const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  return new Request('http://app.test/api/analizar', {
    method: 'POST',
    headers: { host: 'app.test', origin: 'http://app.test', 'content-type': 'application/json', 'x-real-ip': ip, ...cabeceras },
    body: texto,
  });
}

async function eventos(r: Response): Promise<Evento[]> {
  return (await r.text())
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Evento);
}

describe('POST /api/analizar · rechazos antes de analizar', () => {
  it('sin origen o con un origen ajeno: 403', async () => {
    expect((await POST(peticion({ direccion: 'ejemplo.com' }, { origin: '' }))).status).toBe(403);
    expect((await POST(peticion({ direccion: 'ejemplo.com' }, { origin: 'http://mala.test' }))).status).toBe(403);
    expect(descargador).not.toHaveBeenCalled();
  });
  it('si no es JSON: 415', async () => {
    expect((await POST(peticion('direccion=ejemplo.com', { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await POST(peticion('{}', { 'content-type': '' }))).status).toBe(415);
  });
  it('cuerpo demasiado grande: 413, tanto si lo dice la cabecera como si no', async () => {
    const grande = { direccion: 'a'.repeat(5000) };
    expect((await POST(peticion(grande))).status).toBe(413);
    // Sin «content-length» fiable: se cuenta lo que llega de verdad.
    const mentirosa = peticion(grande, { 'content-length': '10' });
    expect((await POST(mentirosa)).status).toBe(413);
  });
  it.each([
    ['JSON roto', '{"direccion":'],
    ['no es un objeto', '"ejemplo.com"'],
    ['falta la dirección', '{}'],
    ['dirección que no es texto', '{"direccion":5}'],
    ['campo de más', '{"direccion":"ejemplo.com","extra":1}'],
    ['permiso que no es booleano', '{"direccion":"ejemplo.com","permiso":"si"}'],
  ])('%s: 400', async (_nombre, cuerpo) => {
    const r = await POST(peticion(cuerpo));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { codigo: 'formato' } });
  });
  it.each(['', '   ', 'ftp://ejemplo.com', 'http://usuario:clave@ejemplo.com', '127.0.0.1', 'localhost', 'ejemplo.com:8080'])(
    'una dirección que no vale («%s»): 422 sin descargar nada ni gastar cupo',
    async (direccion) => {
      const ip = '198.51.100.9';
      for (let i = 0; i < 20; i++) {
        const r = await POST(peticion({ direccion }, {}, ip));
        expect(r.status).toBe(422);
      }
      expect(descargador).not.toHaveBeenCalled();
      // Tras 20 rechazos, el mismo visitante aún puede analizar.
      expect((await POST(peticion({ direccion: 'ejemplo.com' }, {}, ip))).status).toBe(200);
    },
  );
  it('todas las respuestas de error llevan Cache-Control: no-store', async () => {
    const r = await POST(peticion({}));
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/analizar · análisis', () => {
  it('devuelve NDJSON: inicio, las dos capturas y el informe', async () => {
    const r = await POST(peticion({ direccion: 'https://Ejemplo.com/' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const ev = await eventos(r);
    expect(ev[0]).toEqual({ t: 'inicio', host: 'ejemplo.com' });
    expect(ev.filter((e) => e.t === 'captura')).toHaveLength(2);
    const final = ev[ev.length - 1];
    expect(final, JSON.stringify(final)).toHaveProperty('t', 'informe');
  });
  it('sin permiso no se piden archivos privados; con permiso, sí', async () => {
    await (await POST(peticion({ direccion: 'ejemplo.com' }))).text();
    expect(descargador.mock.calls.filter(([, o]) => o.cuerpo === 'bytes')).toHaveLength(0);

    const r = await POST(peticion({ direccion: 'ejemplo.com', permiso: true }));
    const ev = await eventos(r);
    expect(descargador.mock.calls.filter(([, o]) => o.cuerpo === 'bytes')).toHaveLength(17);
    const informe = ev.find((e) => e.t === 'informe');
    expect(informe?.t === 'informe' && informe.informe.hallazgos.some((h) => h.categoria === 'exposicion')).toBe(true);
  });
  it('«permiso: false» equivale a no darlo', async () => {
    await (await POST(peticion({ direccion: 'ejemplo.com', permiso: false }))).text();
    expect(descargador.mock.calls.filter(([, o]) => o.cuerpo === 'bytes')).toHaveLength(0);
  });
  it('una web que no existe se cuenta como error del análisis, no como fallo del servidor', async () => {
    descargador.mockResolvedValue({ ok: false, error: { codigo: 'dns', mensaje: 'no está' } });
    const ev = await eventos(await POST(peticion({ direccion: 'sitio-que-no-existe.com' })));
    expect(ev[ev.length - 1]).toMatchObject({ t: 'error', error: { codigo: 'no-existe' } });
  });
  it('un fallo interno no filtra detalles al cliente', async () => {
    descargador.mockRejectedValue(new Error('secreto interno: /etc/passwd'));
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const texto = await (await POST(peticion({ direccion: 'ejemplo.com' }))).text();
    expect(texto).not.toContain('passwd');
    const ev = texto.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Evento);
    expect(ev[ev.length - 1]).toEqual({ t: 'error', error: { codigo: 'sin-respuesta', detalle: 'fallo-interno' } });
    consola.mockRestore();
  });
});

describe('POST /api/analizar · límite de uso', () => {
  it('tras 12 análisis en la ventana, el visitante recibe 429 con Retry-After; otro visitante no', async () => {
    const ip = '192.0.2.77';
    for (let i = 0; i < 12; i++) {
      const r = await POST(peticion({ direccion: 'ejemplo.com' }, {}, ip));
      expect(r.status).toBe(200);
      await r.text();
    }
    const r = await POST(peticion({ direccion: 'ejemplo.com' }, {}, ip));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await r.json()).toMatchObject({ error: { codigo: 'demasiados-analisis' } });
    expect((await POST(peticion({ direccion: 'ejemplo.com' }, {}, '192.0.2.78'))).status).toBe(200);
  });
  it('las IPv6 de un mismo /64 comparten cupo', async () => {
    for (let i = 0; i < 12; i++) await (await POST(peticion({ direccion: 'ejemplo.com' }, {}, `2001:db8:1:2::${i + 1}`))).text();
    expect((await POST(peticion({ direccion: 'ejemplo.com' }, {}, '2001:db8:1:2:ffff::9'))).status).toBe(429);
  });
});
