import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Descargador } from '@/lib/analisis/descarga';
import { HTTP_REDIRIGE, bien, respuesta } from '@/lib/analisis/pruebas/construir';
import { firmaValida } from '@/lib/compartir/firma';
import type { Evento } from '@/lib/protocolo';

vi.mock('server-only', () => ({}));
const descargador = vi.fn<Descargador>();
vi.mock('@/lib/analisis/descarga', () => ({ descargadorSeguro: (...args: Parameters<Descargador>) => descargador(...args) }));
vi.mock('@/lib/analisis/dns', async (original) => ({ ...(await original<typeof import('@/lib/analisis/dns')>()), resolvedorReal: () => undefined }));

const SECRETO = 'k'.repeat(40);
let activo = true;
vi.mock('@/lib/compartir/instancia', () => ({
  obtenerCompartir: () => (activo ? { config: { secreto: SECRETO, dias: 14, almacen: { tipo: 'memoria' } }, almacen: {} } : null),
}));

let POST: typeof import('./route').POST;
beforeEach(async () => {
  vi.resetModules();
  activo = true;
  ({ POST } = await import('./route'));
  descargador.mockReset();
});

let n = 0;
const peticion = (cuerpo: unknown) =>
  new Request('http://app.test/api/analizar', {
    method: 'POST',
    headers: { host: 'app.test', origin: 'http://app.test', 'content-type': 'application/json', 'x-real-ip': `192.0.2.${++n}` },
    body: JSON.stringify(cuerpo),
  });
const eventos = async (r: Response) =>
  (await r.text())
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Evento);

function webNormal() {
  descargador.mockImplementation(async (url, opciones) => {
    if (opciones.cuerpo === 'bytes') return bien(respuesta({ estado: 404, cuerpo: null, estadoCuerpo: 'omitido', cabeceras: {} }));
    return url.protocol === 'https:' ? bien(respuesta()) : HTTP_REDIRIGE;
  });
}

describe('POST /api/analizar · oferta de compartir', () => {
  it('el informe llega con una firma válida y los días de conservación', async () => {
    webNormal();
    const final = (await eventos(await POST(peticion({ direccion: 'sitio-que-no-existe.com' })))).find((e) => e.t === 'informe');
    if (final?.t !== 'informe') throw new Error('sin informe');
    expect(final.compartir?.dias).toBe(14);
    // La firma sirve para el informe tal como llega al navegador.
    expect(firmaValida(final.informe, final.compartir!.firma, SECRETO, Date.now())).toBe(true);
  });
  it('sin compartir activado, el informe no lleva oferta', async () => {
    activo = false;
    webNormal();
    const final = (await eventos(await POST(peticion({ direccion: 'sitio-que-no-existe.com' })))).find((e) => e.t === 'informe');
    expect(final && 'compartir' in final).toBe(false);
  });
  it('un informe con archivos expuestos no lleva oferta (no se publica nunca)', async () => {
    descargador.mockImplementation(async (url, opciones) => {
      if (opciones.cuerpo === 'bytes') {
        return url.pathname === '/.env'
          ? bien(
              respuesta({
                estado: 200,
                cuerpo: 'APP_KEY=base64:abc\nDB_PASSWORD=x\n',
                estadoCuerpo: 'completo',
                cabeceras: { 'content-type': ['text/plain'] },
              }),
            )
          : bien(respuesta({ estado: 404, cuerpo: null, estadoCuerpo: 'omitido', cabeceras: {} }));
      }
      return url.protocol === 'https:' ? bien(respuesta()) : HTTP_REDIRIGE;
    });
    const final = (await eventos(await POST(peticion({ direccion: 'sitio-que-no-existe.com', permiso: true })))).find((e) => e.t === 'informe');
    if (final?.t !== 'informe') throw new Error('sin informe');
    expect(final.informe.hallazgos.some((h) => h.categoria === 'exposicion' && h.resultado === 'fallo')).toBe(true);
    expect('compartir' in final).toBe(false);
  });
});
