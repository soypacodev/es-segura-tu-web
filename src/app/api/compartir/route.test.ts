import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Informe } from '@/lib/analisis/analizar';
import { crearAlmacenMemoria } from '@/lib/compartir/almacen';
import { firmarInforme } from '@/lib/compartir/firma';

vi.mock('server-only', () => ({}));

const SECRETO = 'z'.repeat(40);
const almacen = crearAlmacenMemoria();
let activo = true;
vi.mock('@/lib/compartir/instancia', () => ({
  obtenerCompartir: () => (activo ? { config: { secreto: SECRETO, dias: 30, almacen: { tipo: 'memoria' } }, almacen } : null),
}));

type Ruta = typeof import('./route');
let POST: Ruta['POST'];

beforeEach(async () => {
  vi.resetModules();
  activo = true;
  ({ POST } = await import('./route'));
});

const informe = {
  version: 1,
  objetivo: { host: 'ejemplo.com', url: 'https://ejemplo.com/' },
  nota: { letra: 'B', puntos: 80, categorias: [] },
  hallazgos: [{ id: 'https.hsts', categoria: 'https', resultado: 'correcto', gravedad: 'info', peso: 1 }],
  avisos: [],
  analizadoEn: '2026-10-13T10:00:00.000Z',
  duracionMs: 10,
} as unknown as Informe;

let contador = 0;
function peticion(cuerpo: unknown, cabeceras: Record<string, string> = {}, ip = `198.51.100.${++contador}`) {
  return new Request('http://app.test/api/compartir', {
    method: 'POST',
    headers: { host: 'app.test', origin: 'http://app.test', 'content-type': 'application/json', 'x-real-ip': ip, ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}
const valida = () => ({ informe, firma: firmarInforme(informe, SECRETO, Date.now()) });

describe('POST /api/compartir', () => {
  it('guarda un informe firmado: 201 con id y caducidad, sin caché', async () => {
    const r = await POST(peticion(valida()));
    expect(r.status).toBe(201);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const { id, caduca } = (await r.json()) as { id: string; caduca: string };
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Date.parse(caduca)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect((await almacen.leer(id, new Date()))?.informe.objetivo.host).toBe('ejemplo.com');
  });
  it('sin origen o con origen ajeno: 403', async () => {
    expect((await POST(peticion(valida(), { origin: '' }))).status).toBe(403);
    expect((await POST(peticion(valida(), { origin: 'http://mala.test' }))).status).toBe(403);
  });
  it('si no es JSON: 415', async () => {
    expect((await POST(peticion('x', { 'content-type': 'text/plain' }))).status).toBe(415);
  });
  it('si está desactivado: 404 «no-disponible»', async () => {
    activo = false;
    const r = await POST(peticion(valida()));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: { codigo: 'no-disponible' } });
  });
  it('cuerpo demasiado grande: 413 (por cabecera y por lo realmente recibido)', async () => {
    expect((await POST(peticion(valida(), { 'content-length': '999999' }))).status).toBe(413);
    expect((await POST(peticion({ ...valida(), relleno: 'a'.repeat(200_000) }))).status).toBe(413);
  });
  it('formato incorrecto: 400', async () => {
    for (const malo of ['no json', {}, { informe: 'x', firma: 'y' }, { informe: {}, firma: 1 }, { ...valida(), extra: 1 }, [1]]) {
      expect((await POST(peticion(malo))).status).toBe(400);
    }
  });
  it('informe inventado o modificado: 400 «firma»', async () => {
    const falso = { ...valida(), informe: { ...informe, nota: { ...informe.nota, letra: 'A+' } } };
    const r = await POST(peticion(falso));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { codigo: 'firma' } });
  });
  it('firma de otro servidor: 400', async () => {
    expect((await POST(peticion({ informe, firma: firmarInforme(informe, 'o'.repeat(40), Date.now()) }))).status).toBe(400);
  });
  it('informe con archivos expuestos: 422 «no-compartible»', async () => {
    const con = { ...informe, hallazgos: [{ id: 'exposicion.env', categoria: 'exposicion', resultado: 'fallo', gravedad: 'critica', peso: 8 }] };
    const r = await POST(peticion({ informe: con, firma: firmarInforme(con, SECRETO, Date.now()) }));
    expect(r.status).toBe(422);
  });
  it('límite de uso: el undécimo en una hora da 429 con Retry-After', async () => {
    const ip = '198.51.100.250';
    for (let i = 0; i < 10; i++) expect((await POST(peticion(valida(), {}, ip))).status).toBe(201);
    const r = await POST(peticion(valida(), {}, ip));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await POST(peticion(valida(), {}, '198.51.100.251'))).status).toBe(201);
  });
});
