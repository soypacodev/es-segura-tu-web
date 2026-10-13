import { describe, expect, it, vi } from 'vitest';
import type { Informe } from '@/lib/analisis/analizar';
import type { Hallazgo } from '@/lib/analisis/tipos';
import { crearAlmacenMemoria, crearAlmacenSupabase, crearId, esIdValido } from './almacen';
import { leerConfigCompartir } from './config';
import { canonico, firmaValida, firmarInforme, VIGENCIA_FIRMA_MS } from './firma';
import { esCompartible, guardarInformeCompartido } from './servicio';

const SECRETO = 'x'.repeat(40);
const AHORA = new Date('2026-10-13T10:00:00Z');

function hallazgo(extra: Partial<Hallazgo> = {}): Hallazgo {
  return { id: 'https.hsts', categoria: 'https', resultado: 'correcto', gravedad: 'info', peso: 1, ...extra };
}
function informe(hallazgos: Hallazgo[] = [hallazgo()]): Informe {
  return {
    version: 1,
    objetivo: { host: 'ejemplo.com', url: 'https://ejemplo.com/' },
    nota: { letra: 'B', puntos: 80, categorias: [] },
    hallazgos,
    avisos: [],
    analizadoEn: AHORA.toISOString(),
    duracionMs: 1200,
  } as unknown as Informe;
}

describe('canonico', () => {
  it('no depende del orden de las claves', () => {
    expect(canonico({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canonico({ a: [{ c: 2, d: 1 }], b: 1 }));
  });
  it('ignora lo que JSON ignora (undefined en propiedades)', () => {
    expect(canonico({ a: 1, b: undefined })).toBe(canonico(JSON.parse(JSON.stringify({ a: 1, b: undefined }))));
  });
  it('distingue valores distintos', () => {
    expect(canonico({ a: 1 })).not.toBe(canonico({ a: '1' }));
    expect(canonico([1, 2])).not.toBe(canonico([2, 1]));
  });
});

describe('firma', () => {
  const i = informe();
  const firma = firmarInforme(i, SECRETO, AHORA.getTime());
  it('vale para el mismo informe aunque vuelva del navegador', () => {
    expect(firmaValida(JSON.parse(JSON.stringify(i)), firma, SECRETO, AHORA.getTime() + 1000)).toBe(true);
  });
  it('no vale si se cambia el informe', () => {
    const tocado = informe();
    tocado.nota.puntos = 100;
    expect(firmaValida(tocado, firma, SECRETO, AHORA.getTime())).toBe(false);
  });
  it('no vale con otro secreto', () => {
    expect(firmaValida(i, firma, 'y'.repeat(40), AHORA.getTime())).toBe(false);
  });
  it('caduca a la hora y no vale una firma del futuro', () => {
    expect(firmaValida(i, firma, SECRETO, AHORA.getTime() + VIGENCIA_FIRMA_MS)).toBe(true);
    expect(firmaValida(i, firma, SECRETO, AHORA.getTime() + VIGENCIA_FIRMA_MS + 1)).toBe(false);
    expect(firmaValida(i, firma, SECRETO, AHORA.getTime() - 120_000)).toBe(false);
  });
  it('rechaza firmas con mal formato', () => {
    for (const mala of ['', 'abc', `${AHORA.getTime()}.${'g'.repeat(64)}`, `${AHORA.getTime()}.abcd`, `.${'a'.repeat(64)}`]) {
      expect(firmaValida(i, mala, SECRETO, AHORA.getTime())).toBe(false);
    }
  });
});

describe('config', () => {
  const dev = () => 'secreto-de-desarrollo-'.padEnd(40, '0');
  const supabase = { SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'clave', INFORME_SECRETO: SECRETO };
  it('sin nada, está desactivado', () => {
    expect(leerConfigCompartir({}, dev)).toBeNull();
    expect(leerConfigCompartir({ NODE_ENV: 'production' }, dev)).toBeNull();
  });
  it('con Supabase y secreto, usa Supabase (sin barra final) y 30 días', () => {
    expect(leerConfigCompartir(supabase, dev)).toEqual({
      secreto: SECRETO,
      dias: 30,
      almacen: { tipo: 'supabase', url: 'https://abc.supabase.co', clave: 'clave' },
    });
  });
  it('exige secreto largo y https', () => {
    expect(leerConfigCompartir({ ...supabase, INFORME_SECRETO: 'corto' }, dev)).toBeNull();
    expect(leerConfigCompartir({ ...supabase, INFORME_SECRETO: undefined }, dev)).toBeNull();
    expect(leerConfigCompartir({ ...supabase, SUPABASE_URL: 'http://abc.supabase.co' }, dev)).toBeNull();
    expect(leerConfigCompartir({ ...supabase, SUPABASE_URL: 'https://u:p@abc.supabase.co' }, dev)).toBeNull();
    expect(leerConfigCompartir({ ...supabase, SUPABASE_URL: 'no es una url' }, dev)).toBeNull();
  });
  it('en desarrollo sin Supabase usa memoria', () => {
    expect(leerConfigCompartir({ NODE_ENV: 'development' }, dev)).toMatchObject({ almacen: { tipo: 'memoria' }, secreto: dev() });
  });
  it('los días: entero de 1 a 365, si no el valor por defecto', () => {
    const dias = (v: string) => leerConfigCompartir({ ...supabase, INFORME_DIAS: v }, dev)?.dias;
    expect(dias('7')).toBe(7);
    expect(dias('365')).toBe(365);
    for (const malo of ['0', '366', '-3', '2.5', 'mucho', '']) expect(dias(malo)).toBe(30);
  });
});

describe('identificadores', () => {
  it('son de 22 caracteres, URL-seguros y distintos', () => {
    const ids = new Set(Array.from({ length: 200 }, crearId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(esIdValido(id)).toBe(true);
  });
  it('rechaza lo que no tiene ese formato', () => {
    for (const malo of ['', 'corto', 'a'.repeat(23), `${'a'.repeat(21)}/`, `${'a'.repeat(21)}.`, `${'a'.repeat(20)}%20a`, '../../etc/passwd'.padEnd(22, 'a')])
      expect(esIdValido(malo)).toBe(false);
  });
});

describe('almacén en memoria', () => {
  it('guarda, lee y olvida al caducar', async () => {
    const a = crearAlmacenMemoria();
    const id = crearId();
    await a.guardar(id, informe(), AHORA, new Date(AHORA.getTime() + 1000));
    expect((await a.leer(id, AHORA))?.informe.objetivo.host).toBe('ejemplo.com');
    expect(await a.leer(id, new Date(AHORA.getTime() + 1000))).toBeNull();
    expect(await a.leer(crearId(), AHORA)).toBeNull();
  });
});

describe('almacén Supabase', () => {
  const clave = 'eyJ.clave.de-servicio';
  const caduca = new Date(AHORA.getTime() + 86_400_000);
  it('guarda con POST a la tabla «informes» y la clave de servicio', async () => {
    const peticion = vi.fn(async () => new Response(null, { status: 201 }));
    const id = crearId();
    await crearAlmacenSupabase('https://abc.supabase.co', clave, peticion).guardar(id, informe(), AHORA, caduca);
    const [url, init] = peticion.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://abc.supabase.co/rest/v1/informes');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: clave, Authorization: `Bearer ${clave}`, Prefer: 'return=minimal' });
    expect(JSON.parse(init.body as string)).toMatchObject({ id, caduca: caduca.toISOString(), informe: { objetivo: { host: 'ejemplo.com' } } });
  });
  it('con una clave nueva (no JWT) envía solo «apikey»; con una JWT antigua, también «Authorization»', async () => {
    const peticion = vi.fn(async () => new Response(null, { status: 201 }));
    await crearAlmacenSupabase('https://abc.supabase.co', 'sb_secret_abc', peticion).guardar(crearId(), informe(), AHORA, caduca);
    const [, nueva] = peticion.mock.calls[0] as unknown as [string, RequestInit];
    expect(nueva.headers).toEqual(expect.objectContaining({ apikey: 'sb_secret_abc' }));
    expect(nueva.headers).not.toHaveProperty('Authorization');
    await crearAlmacenSupabase('https://abc.supabase.co', 'eyJ.x.y', peticion).guardar(crearId(), informe(), AHORA, caduca);
    const [, vieja] = peticion.mock.calls[1] as unknown as [string, RequestInit];
    expect(vieja.headers).toMatchObject({ Authorization: 'Bearer eyJ.x.y' });
  });
  it('falla (sin filtrar el cuerpo de la respuesta) si Supabase rechaza', async () => {
    const peticion = vi.fn(async () => new Response('secreto-del-servidor', { status: 401 }));
    await expect(crearAlmacenSupabase('https://abc.supabase.co', clave, peticion).guardar(crearId(), informe(), AHORA, caduca)).rejects.toThrow(
      /^almacen-guardar-401$/,
    );
  });
  it('lee pidiendo solo ese id y solo lo no caducado', async () => {
    const peticion = vi.fn(async () => Response.json([{ informe: informe(), creado: AHORA.toISOString(), caduca: caduca.toISOString() }]));
    const id = crearId();
    const leido = await crearAlmacenSupabase('https://abc.supabase.co', clave, peticion).leer(id, AHORA);
    expect(leido?.caduca).toBe(caduca.toISOString());
    const url = new URL((peticion.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/rest/v1/informes');
    expect(url.searchParams.get('id')).toBe(`eq.${id}`);
    expect(url.searchParams.get('caduca')).toBe(`gt.${AHORA.toISOString()}`);
    expect(url.searchParams.get('limit')).toBe('1');
  });
  it('sin filas o con filas raras: null', async () => {
    for (const cuerpo of [[], {}, [{}], [{ informe: informe() }]]) {
      const peticion = vi.fn(async () => Response.json(cuerpo));
      expect(await crearAlmacenSupabase('https://abc.supabase.co', clave, peticion).leer(crearId(), AHORA)).toBeNull();
    }
  });
  it('un id con mal formato ni siquiera se consulta', async () => {
    const peticion = vi.fn(async () => Response.json([]));
    expect(await crearAlmacenSupabase('https://abc.supabase.co', clave, peticion).leer('x&select=*', AHORA)).toBeNull();
    expect(peticion).not.toHaveBeenCalled();
  });
  it('comprobar hace una consulta mínima (un id, una fila) y falla si Supabase falla', async () => {
    const bien = vi.fn(async () => Response.json([]));
    await crearAlmacenSupabase('https://abc.supabase.co', clave, bien).comprobar();
    const url = new URL((bien.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/rest/v1/informes');
    expect(url.searchParams.get('select')).toBe('id');
    expect(url.searchParams.get('limit')).toBe('1');
    const mal = vi.fn(async () => new Response('', { status: 503 }));
    await expect(crearAlmacenSupabase('https://abc.supabase.co', clave, mal).comprobar()).rejects.toThrow(/almacen-comprobar-503/);
  });
  it('si Supabase falla al leer, lanza error (no se confunde con «no existe»)', async () => {
    const peticion = vi.fn(async () => new Response('', { status: 500 }));
    await expect(crearAlmacenSupabase('https://abc.supabase.co', clave, peticion).leer(crearId(), AHORA)).rejects.toThrow(/almacen-leer-500/);
  });
});

describe('esCompartible', () => {
  it('permite un informe normal', () => expect(esCompartible(informe())).toBe(true));
  it('permite exposición sin hallazgos o con todo correcto', () => {
    expect(esCompartible(informe([hallazgo({ categoria: 'exposicion', id: 'exposicion.ninguno', resultado: 'correcto' })]))).toBe(true);
  });
  it('rechaza si hay archivos expuestos (fallo o mejorable)', () => {
    expect(esCompartible(informe([hallazgo({ categoria: 'exposicion', id: 'exposicion.env', resultado: 'fallo' })]))).toBe(false);
    expect(esCompartible(informe([hallazgo({ categoria: 'exposicion', id: 'exposicion.env', resultado: 'mejorable' })]))).toBe(false);
  });
});

describe('guardarInformeCompartido', () => {
  const dep = () => ({ almacen: crearAlmacenMemoria(), secreto: SECRETO, dias: 30, ahora: () => AHORA });
  it('guarda un informe bien firmado y devuelve la fecha de caducidad', async () => {
    const d = dep();
    const i = informe();
    const r = await guardarInformeCompartido({ informe: JSON.parse(JSON.stringify(i)), firma: firmarInforme(i, SECRETO, AHORA.getTime()) }, d);
    expect(r).toMatchObject({ ok: true, caduca: new Date(AHORA.getTime() + 30 * 86_400_000).toISOString() });
    if (r.ok) expect((await d.almacen.leer(r.id, AHORA))?.informe.nota.letra).toBe('B');
  });
  it('rechaza un informe inventado o modificado', async () => {
    const d = dep();
    const firma = firmarInforme(informe(), SECRETO, AHORA.getTime());
    const falso = informe();
    falso.nota.letra = 'A+';
    expect(await guardarInformeCompartido({ informe: falso, firma }, d)).toEqual({ ok: false, motivo: 'firma' });
  });
  it('rechaza un informe con exposición aunque esté bien firmado', async () => {
    const d = dep();
    const i = informe([hallazgo({ categoria: 'exposicion', id: 'exposicion.env', resultado: 'fallo' })]);
    expect(await guardarInformeCompartido({ informe: i, firma: firmarInforme(i, SECRETO, AHORA.getTime()) }, d)).toEqual({
      ok: false,
      motivo: 'no-compartible',
    });
  });
  it('si el almacén falla, lo dice sin lanzar', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = { ...dep(), almacen: { guardar: async () => Promise.reject(new Error('caído')), leer: async () => null, comprobar: async () => undefined } };
    const i = informe();
    expect(await guardarInformeCompartido({ informe: i, firma: firmarInforme(i, SECRETO, AHORA.getTime()) }, d)).toEqual({ ok: false, motivo: 'almacen' });
    error.mockRestore();
  });
});
