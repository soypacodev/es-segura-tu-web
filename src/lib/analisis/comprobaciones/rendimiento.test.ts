import { describe, expect, it } from 'vitest';
import { bien, respuesta, sitio } from '../pruebas/construir';
import type { EstadoCuerpo, RespuestaCapturada } from '../tipos';
import { LIMITE_CODIFICACION, MAX_REDIRECCIONES, MIN_PARA_COMPRIMIR, PESO_MAX_HTML, comprobarRendimiento, leerCabecera } from './rendimiento';

const completa = (cuerpo: string, extra: Partial<RespuestaCapturada> = {}) =>
  comprobarRendimiento(sitio({ https: bien(respuesta({ cuerpo, bytesLeidos: cuerpo.length, ...extra })) }));
const con = (cabeceras: Record<string, string[]>, extra: Partial<RespuestaCapturada> = {}) =>
  comprobarRendimiento(sitio({ https: bien(respuesta({ cabeceras, ...extra })) }));
const por = (hs: ReturnType<typeof completa>, id: string) => hs.find((x) => x.id === id)!;
const PERFECTA = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hola</title></head><body></body></html>';

describe('leerCabecera', () => {
  it('lee idioma, viewport, codificación y título', () => {
    expect(leerCabecera(PERFECTA)).toEqual({ idioma: 'es', viewport: true, codificacionMeta: true, titulo: 'Hola' });
  });
  it('sin nada de eso', () => {
    expect(leerCabecera('<html><body>x</body></html>')).toEqual({ idioma: null, viewport: false, codificacionMeta: false, titulo: null });
  });
  it('reconoce http-equiv Content-Type y xml:lang, sin importar mayúsculas', () => {
    const c = leerCabecera('<HTML XML:LANG="en"><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1"><TITLE>\n  Dos   líneas \n</TITLE>');
    expect(c).toMatchObject({ idioma: 'en', codificacionMeta: true, titulo: 'Dos líneas' });
  });
  it('solo con initial-scale también vale (como en wikipedia.org), salvo si fija un ancho en píxeles', () => {
    expect(leerCabecera('<meta name="viewport" content="initial-scale=1,user-scalable=yes">').viewport).toBe(true);
    expect(leerCabecera('<meta name="viewport" content="width=1024, initial-scale=1">').viewport).toBe(false);
    expect(leerCabecera('<meta name="viewport" content="initial-scale=1">').viewport).toBe(true);
  });
  it('un viewport sin width=device-width ni initial-scale no vale', () => {
    expect(leerCabecera('<meta name="viewport" content="width=1024">').viewport).toBe(false);
    expect(leerCabecera('<meta name="viewport" content="user-scalable=no">').viewport).toBe(false);
    expect(leerCabecera('<meta name="viewport" content="initial-scale=1, width = device-width">').viewport).toBe(true);
  });
  it('lang vacío cuenta como no declarado', () => {
    expect(leerCabecera('<html lang=" ">').idioma).toBeNull();
  });
  it('la codificación declarada después de 1024 bytes no la ven los navegadores', () => {
    const relleno = '<!-- ' + 'x'.repeat(LIMITE_CODIFICACION) + ' -->';
    expect(leerCabecera(`${relleno}<meta charset="utf-8">`).codificacionMeta).toBe(false);
    expect(leerCabecera('<meta charset="utf-8">').codificacionMeta).toBe(true);
  });
  it('título vacío o sin cerrar', () => {
    expect(leerCabecera('<title></title>').titulo).toBe('');
    expect(leerCabecera('<title>abierto sin cerrar').titulo).toBe('abierto sin cerrar');
  });
  it('un 1 MB hostil no tarda', () => {
    for (const trozo of ['<meta ', '<title', '<html ', '<a ']) {
      const t = performance.now();
      leerCabecera(trozo.repeat(Math.floor(1_000_000 / trozo.length)));
      expect(performance.now() - t).toBeLessThan(1500);
    }
  });
});

describe('comprobarRendimiento', () => {
  it('una web perfecta: todo correcto y 8 hallazgos de la categoría', () => {
    const r = completa(PERFECTA);
    expect(r.map((x) => [x.id, x.resultado])).toEqual([
      ['rendimiento.compresion', 'correcto'],
      ['rendimiento.cache', 'correcto'],
      ['rendimiento.peso', 'correcto'],
      ['rendimiento.redirecciones', 'correcto'],
      ['rendimiento.codificacion', 'correcto'],
      ['rendimiento.movil', 'correcto'],
      ['rendimiento.idioma', 'correcto'],
      ['rendimiento.titulo', 'correcto'],
    ]);
    expect(new Set(r.map((x) => x.categoria))).toEqual(new Set(['rendimiento']));
    expect(r.reduce((t, x) => t + x.peso, 0)).toBe(30);
    expect(r.some((x) => x.resultado === 'fallo')).toBe(false);
  });

  it('sin respuesta HTTPS, o sin HTML que leer, no hay nada que valorar', () => {
    expect(comprobarRendimiento(sitio({ https: { ok: false, error: { codigo: 'conexion', mensaje: 'x' } } }))).toEqual([]);
    expect(completa('', { cuerpo: null, estadoCuerpo: 'omitido' })).toEqual([]);
  });

  describe('compresión', () => {
    const grande = PERFECTA + ' '.repeat(MIN_PARA_COMPRIMIR);
    it.each(['gzip', 'br', 'zstd', 'deflate', ' GZIP '])('«%s» es correcta', (c) => {
      expect(por(con({ 'content-encoding': [c] }), 'rendimiento.compresion').resultado).toBe('correcto');
    });
    it('sin comprimir y grande: mejorable, con el tamaño', () => {
      const r = completa(grande, { cabeceras: {} });
      expect(por(r, 'rendimiento.compresion')).toMatchObject({ resultado: 'mejorable', datos: { bytes: grande.length } });
    });
    it('sin comprimir pero diminuta: no aplica', () => {
      expect(por(completa(PERFECTA, { cabeceras: {} }), 'rendimiento.compresion').resultado).toBe('no-aplica');
    });
    it('cortada la conexión: no aplica', () => {
      expect(por(completa(grande, { cabeceras: {}, estadoCuerpo: 'interrumpido' }), 'rendimiento.compresion').resultado).toBe('no-aplica');
    });
  });

  describe('caché', () => {
    it.each([['cache-control', 'no-store'], ['etag', '"abc"'], ['last-modified', 'Mon, 12 Oct 2026 10:00:00 GMT']])('%s basta', (n, v) => {
      expect(por(con({ [n]: [v] }), 'rendimiento.cache').resultado).toBe('correcto');
    });
    it('sin ninguna: mejorable, nunca fallo', () => {
      expect(por(con({}), 'rendimiento.cache').resultado).toBe('mejorable');
      expect(por(con({ etag: ['  '] }), 'rendimiento.cache').resultado).toBe('mejorable');
    });
  });

  describe('peso', () => {
    it('en el límite exacto es correcto; un byte más, mejorable', () => {
      expect(por(completa(PERFECTA, { bytesLeidos: PESO_MAX_HTML }), 'rendimiento.peso').resultado).toBe('correcto');
      expect(por(completa(PERFECTA, { bytesLeidos: PESO_MAX_HTML + 1 }), 'rendimiento.peso')).toMatchObject({ resultado: 'mejorable', datos: { kb: 500 } });
    });
    it('recortada: mejorable y se dice hasta dónde se leyó (no se recorta en silencio)', () => {
      const r = completa(PERFECTA, { estadoCuerpo: 'recortado', bytesLeidos: 1_000_000 });
      expect(por(r, 'rendimiento.peso')).toMatchObject({ resultado: 'mejorable', datos: { kb: 1000, recortado: true } });
    });
    it('interrumpida: no aplica', () => {
      expect(por(completa(PERFECTA, { estadoCuerpo: 'interrumpido' }), 'rendimiento.peso').resultado).toBe('no-aplica');
    });
  });

  describe('redirecciones', () => {
    const salto = { url: 'https://ejemplo.com/', estado: 301, ubicacion: '/', setCookie: [] };
    it('hasta el máximo es correcto; más, mejorable', () => {
      const ok = completa(PERFECTA, { redirecciones: Array(MAX_REDIRECCIONES).fill(salto) });
      expect(por(ok, 'rendimiento.redirecciones')).toMatchObject({ resultado: 'correcto', datos: { saltos: MAX_REDIRECCIONES } });
      const mal = completa(PERFECTA, { redirecciones: Array(MAX_REDIRECCIONES + 1).fill(salto) });
      expect(por(mal, 'rendimiento.redirecciones')).toMatchObject({ resultado: 'mejorable', datos: { saltos: MAX_REDIRECCIONES + 1 } });
    });
  });

  describe('codificación', () => {
    it('vale la de la cabecera HTTP', () => {
      const r = completa('<html></html>', { cabeceras: { 'content-type': ['text/html; charset=UTF-8'] } });
      expect(por(r, 'rendimiento.codificacion').resultado).toBe('correcto');
    });
    it('vale la del meta', () => {
      expect(por(completa(PERFECTA, { cabeceras: { 'content-type': ['text/html'] } }), 'rendimiento.codificacion').resultado).toBe('correcto');
    });
    it('sin ninguna: mejorable', () => {
      expect(por(completa('<html></html>', { cabeceras: { 'content-type': ['text/html'] } }), 'rendimiento.codificacion').resultado).toBe('mejorable');
    });
    it('sin ninguna en una página cortada a medias: solo se concluye si ya se leyó pasado el kilobyte', () => {
      const corta = completa('<html>', { cabeceras: { 'content-type': ['text/html'] }, estadoCuerpo: 'interrumpido', bytesLeidos: 6 });
      expect(por(corta, 'rendimiento.codificacion').resultado).toBe('no-aplica');
      const larga = completa('<html>' + 'x'.repeat(2000), { cabeceras: { 'content-type': ['text/html'] }, estadoCuerpo: 'recortado', bytesLeidos: 2006 });
      expect(por(larga, 'rendimiento.codificacion').resultado).toBe('mejorable');
    });
  });

  describe('móvil, idioma y título', () => {
    const sin = '<html><head></head><body></body></html>';
    it('faltan: mejorables, nunca fallo', () => {
      const r = completa(sin);
      for (const id of ['rendimiento.movil', 'rendimiento.idioma', 'rendimiento.titulo']) expect(por(r, id).resultado).toBe('mejorable');
    });
    it('título vacío cuenta como falta', () => {
      expect(por(completa('<title> </title>'), 'rendimiento.titulo').resultado).toBe('mejorable');
    });
    it.each<EstadoCuerpo>(['recortado', 'interrumpido'])('con la página %s no se afirma que falten', (estadoCuerpo) => {
      const r = completa(sin, { estadoCuerpo });
      for (const id of ['rendimiento.movil', 'rendimiento.idioma', 'rendimiento.titulo']) expect(por(r, id).resultado).toBe('no-aplica');
    });
    it.each<EstadoCuerpo>(['recortado', 'interrumpido'])('pero si aparecen en la parte leída, valen (%s)', (estadoCuerpo) => {
      const r = completa(PERFECTA, { estadoCuerpo });
      for (const id of ['rendimiento.movil', 'rendimiento.idioma', 'rendimiento.titulo']) expect(por(r, id).resultado).toBe('correcto');
    });
  });
});
