import { describe, expect, it } from 'vitest';
import type { CapturaDns, ConsultaDns } from '../tipos';
import { sitio } from '../pruebas/construir';
import { comprobarDns, etiquetasDmarc, politicaSpf, registrosDmarc, registrosSpf } from './dns';

const ok = (...v: string[]): ConsultaDns<string> => ({ estado: 'ok', valores: v });
const VACIO: ConsultaDns<string> = { estado: 'vacio' };
const ERROR: ConsultaDns<string> = { estado: 'error' };
const CON_CORREO = ok('mx.ejemplo.com');

function con(cambios: Partial<CapturaDns>) {
  const dns: CapturaDns = { dominio: 'ejemplo.com', txt: VACIO, dmarc: VACIO, mx: VACIO, caa: VACIO, ...cambios };
  return comprobarDns(sitio({ dns }));
}
const por = (hs: ReturnType<typeof con>, id: string) => hs.find((x) => x.id === id)!;

describe('politicaSpf', () => {
  it.each([
    ['v=spf1 include:_spf.google.com -all', '-all'],
    ['v=spf1 mx ~all', '~all'],
    ['v=spf1 ?all', '?all'],
    ['v=spf1 +all', '+all'],
    ['v=spf1 all', '+all'],
    ['v=spf1 -all +all', '-all'], // gana el primer «all»: lo de detrás no se evalúa
    ['v=spf1 +all -all', '+all'],
    ['v=spf1 include:_spf.google.com ~all', '~all'],
    ['v=spf1 mx', 'sin-all'],
    ['v=spf1 redirect=_spf.ejemplo.com', 'redirect'],
    ['V=SPF1 MX -ALL', '-all'],
  ])('%s → %s', (registro, esperado) => expect(politicaSpf(registro)).toBe(esperado));
  it('un «all» dentro de otro nombre no cuenta', () => expect(politicaSpf('v=spf1 include:mall.ejemplo.com')).toBe('sin-all'));
});

describe('registros SPF y DMARC', () => {
  it('se reconocen sin importar mayúsculas y se ignora otro TXT', () => {
    expect(registrosSpf(['google-site-verification=abc', 'V=spf1 -all', 'spf1 mal'])).toEqual(['V=spf1 -all']);
    expect(registrosDmarc(['v=DMARC1; p=none', 'v=DMARC10;', 'otro'])).toEqual(['v=DMARC1; p=none']);
  });
  it('etiquetas de DMARC', () => {
    expect(etiquetasDmarc('v=DMARC1; p=Quarantine; pct=50; rua=mailto:a@b.c')).toEqual({ p: 'quarantine', pct: 50 });
    expect(etiquetasDmarc('v=DMARC1')).toEqual({ p: null, pct: null });
    expect(etiquetasDmarc('v=DMARC1; p=reject; pct=abc')).toEqual({ p: 'reject', pct: null });
  });
});

describe('dns.spf', () => {
  it('con «-all» o «~all» está bien', () => {
    expect(por(con({ txt: ok('v=spf1 mx -all') }), 'dns.spf')).toMatchObject({ resultado: 'correcto', datos: { politica: '-all' } });
    expect(por(con({ txt: ok('v=spf1 mx ~all') }), 'dns.spf').resultado).toBe('correcto');
  });
  it('sin registro: fallo si recibe correo, mejorable si no (o no se sabe)', () => {
    expect(por(con({ mx: CON_CORREO }), 'dns.spf')).toMatchObject({ resultado: 'fallo', datos: { motivo: 'sin-registro', correo: true } });
    expect(por(con({ mx: VACIO }), 'dns.spf')).toMatchObject({ resultado: 'mejorable', datos: { correo: false } });
    expect(por(con({ mx: ERROR }), 'dns.spf')).toMatchObject({ resultado: 'mejorable', datos: { correo: null } });
  });
  it('un MX nulo («0 .») cuenta como que no recibe correo', () => {
    expect(por(con({ mx: ok('.') }), 'dns.spf').resultado).toBe('mejorable');
  });
  it('dos registros SPF: fallo', () => {
    expect(por(con({ txt: ok('v=spf1 -all', 'v=spf1 mx -all') }), 'dns.spf')).toMatchObject({ resultado: 'fallo', datos: { motivo: 'duplicado', total: 2 } });
  });
  it('«+all» es fallo; «?all» o sin «all» es mejorable', () => {
    expect(por(con({ txt: ok('v=spf1 +all') }), 'dns.spf')).toMatchObject({ resultado: 'fallo', datos: { motivo: 'abierto' } });
    expect(por(con({ txt: ok('v=spf1 ?all') }), 'dns.spf').resultado).toBe('mejorable');
    expect(por(con({ txt: ok('v=spf1 mx') }), 'dns.spf').resultado).toBe('mejorable');
  });
  it('si el DNS no contesta, no aplica', () => {
    expect(por(con({ txt: ERROR }), 'dns.spf').resultado).toBe('no-aplica');
  });
});

describe('dns.dmarc', () => {
  const dmarc = (v: string, extra: Partial<CapturaDns> = {}) => por(con({ dmarc: ok(v), ...extra }), 'dns.dmarc');
  it('quarantine y reject están bien', () => {
    expect(dmarc('v=DMARC1; p=reject')).toMatchObject({ resultado: 'correcto', datos: { politica: 'reject' } });
    expect(dmarc('v=DMARC1; p=quarantine; pct=100').resultado).toBe('correcto');
  });
  it('p=none es mejorable (solo observar)', () => {
    expect(dmarc('v=DMARC1; p=none')).toMatchObject({ resultado: 'mejorable', datos: { motivo: 'solo-observar' } });
  });
  it('pct menor de 100 es mejorable', () => {
    expect(dmarc('v=DMARC1; p=reject; pct=25')).toMatchObject({ resultado: 'mejorable', datos: { motivo: 'parcial', pct: 25 } });
  });
  it('sin «p=» o con un valor raro es mejorable', () => {
    expect(dmarc('v=DMARC1; rua=mailto:a@b.c').datos).toMatchObject({ motivo: 'sin-politica' });
    expect(dmarc('v=DMARC1; p=todo').datos).toMatchObject({ motivo: 'sin-politica' });
  });
  it('sin registro: fallo si recibe correo, mejorable si no', () => {
    expect(por(con({ mx: CON_CORREO }), 'dns.dmarc').resultado).toBe('fallo');
    expect(por(con({}), 'dns.dmarc').resultado).toBe('mejorable');
  });
  it('dos registros: fallo; DNS caído: no aplica', () => {
    expect(por(con({ dmarc: ok('v=DMARC1; p=none', 'v=DMARC1; p=reject') }), 'dns.dmarc').resultado).toBe('fallo');
    expect(por(con({ dmarc: ERROR }), 'dns.dmarc').resultado).toBe('no-aplica');
  });
});

describe('dns.caa', () => {
  it('con CAA bien, sin CAA mejorable, sin saber no aplica', () => {
    expect(por(con({ caa: ok('issue letsencrypt.org') }), 'dns.caa').resultado).toBe('correcto');
    expect(por(con({ caa: VACIO }), 'dns.caa').resultado).toBe('mejorable');
    expect(por(con({ caa: ERROR }), 'dns.caa').resultado).toBe('no-aplica');
  });
});

describe('comprobarDns', () => {
  it('sin datos de DNS o sin HTTPS no devuelve nada', () => {
    expect(comprobarDns(sitio())).toEqual([]);
    expect(comprobarDns(sitio({ https: { ok: false, error: { codigo: 'conexion', mensaje: 'x' } }, dns: { dominio: 'a.com', txt: VACIO, dmarc: VACIO, mx: VACIO, caa: VACIO } }))).toEqual([]);
  });
  it('devuelve SPF, DMARC y CAA en la categoría «dns»', () => {
    const hs = con({});
    expect(hs.map((x) => x.id)).toEqual(['dns.spf', 'dns.dmarc', 'dns.caa']);
    expect(hs.every((x) => x.categoria === 'dns')).toBe(true);
  });
});
