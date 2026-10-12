import { describe, expect, it } from 'vitest';
import { bien, respuesta, sitio } from '../pruebas/construir';
import type { EstadoCuerpo } from '../tipos';
import { MAX_RECURSOS, comprobarContenido, leerRecursos, resolverUrl } from './contenido';

const PAGINA = new URL('https://www.ejemplo.com/tienda/');
const leer = (html: string, url = PAGINA) => leerRecursos(html, url);
const con = (html: string, extra: { urlFinal?: string; estadoCuerpo?: EstadoCuerpo } = {}) =>
  comprobarContenido(sitio({ https: bien(respuesta({ cuerpo: `<html><body>${html}</body></html>`, ...extra })) }));
const por = (hs: ReturnType<typeof con>, id: string) => hs.find((x) => x.id === id)!;

describe('resolverUrl', () => {
  it.each([
    ['/a.js', 'https://www.ejemplo.com/a.js'],
    ['a.js', 'https://www.ejemplo.com/tienda/a.js'],
    ['//cdn.otra.com/x.js', 'https://cdn.otra.com/x.js'],
    ['http://viejo.com/x.png', 'http://viejo.com/x.png'],
  ])('%s', (v, esperado) => expect(resolverUrl(v, PAGINA)?.href).toBe(esperado));
  it.each(['', '  ', '#ancla', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'mailto:a@b.c', 'blob:https://x/1', 'http://'])('%j no es una web', (v) => {
    expect(resolverUrl(v, PAGINA)).toBeNull();
  });
});

describe('leerRecursos', () => {
  it('separa el contenido sin cifrar activo (scripts, estilos, marcos) del pasivo (imágenes, vídeo)', () => {
    const r = leer(`<script src="http://a.com/x.js"></script><link rel="stylesheet" href="http://b.com/x.css"><iframe src="http://c.com/"></iframe>
      <img src="http://d.com/x.png"><video src="http://e.com/v.mp4"></video><source src="http://f.com/v.webm">`);
    expect(r.mixtoActivo.sort()).toEqual(['a.com', 'b.com', 'c.com']);
    expect(r.mixtoPasivo.sort()).toEqual(['d.com', 'e.com', 'f.com']);
  });
  it('lo que va por https o con «//» no es mixto, y un «link» que no es estilo se ignora', () => {
    const r = leer(`<script src="https://a.com/x.js"></script><script src="//b.com/x.js"></script><link rel="icon" href="http://c.com/i.ico"><link rel="preload" href="http://c.com/x">`);
    expect(r.mixtoActivo).toEqual([]);
    expect(r.mixtoPasivo).toEqual([]);
  });
  it('«rel» con varios valores sigue contando como hoja de estilos', () => {
    expect(leer('<link rel="alternate stylesheet" href="http://a.com/x.css">').mixtoActivo).toEqual(['a.com']);
  });
  it('una página servida sin cifrar no tiene «contenido mixto»', () => {
    expect(leer('<script src="http://a.com/x.js"></script>', new URL('http://www.ejemplo.com/')).mixtoActivo).toEqual([]);
  });
  it('«<base href>» cambia desde dónde se resuelven las direcciones relativas', () => {
    expect(leer('<base href="http://otro.com/"><script src="x.js"></script>').mixtoActivo).toEqual(['otro.com']);
  });
  it('SRI: pide «integrity» solo a lo de otras webs; lo propio y los subdominios propios no cuentan', () => {
    const r = leer(`<script src="https://cdn.otra.com/a.js"></script><script src="https://cdn.otra.com/b.js" integrity="sha384-x" crossorigin></script>
      <link rel="stylesheet" href="https://fonts.otra2.com/c.css"><script src="/propio.js"></script><script src="https://static.ejemplo.com/p.js"></script>`);
    expect(r.sinIntegridad.sort()).toEqual(['cdn.otra.com', 'fonts.otra2.com']);
  });
  it('SRI: los servidores de seguimiento no cuentan (no pueden llevar «integrity»)', () => {
    expect(leer('<script src="https://www.googletagmanager.com/gtm.js"></script>').sinIntegridad).toEqual([]);
  });
  it('un dominio como «ejemplo.com.evil.test» no se confunde con el propio', () => {
    expect(leer('<script src="https://ejemplo.com.evil.test/a.js"></script>').scriptsAjenos).toEqual(['ejemplo.com.evil.test']);
  });
  it('cuenta los servidores ajenos con scripts, sin repetir', () => {
    const r = leer('<script src="https://a.com/1.js"></script><script src="https://a.com/2.js"></script><script src="https://b.com/1.js"></script><link rel=stylesheet href="https://c.com/x.css">');
    expect(r.scriptsAjenos.sort()).toEqual(['a.com', 'b.com']);
  });
  it('formularios: los que envían a http:// salen aparte', () => {
    const r = leer('<form action="http://a.com/enviar"></form><form action="/ok"></form><form></form>');
    expect(r).toMatchObject({ formularios: 3, formulariosSinCifrar: ['a.com'] });
  });
  it('con demasiadas etiquetas se queda en MAX_RECURSOS y lo dice', () => {
    const r = leer('<img src=/a.png>'.repeat(MAX_RECURSOS + 5));
    expect(r.completo).toBe(false);
  });
});

describe('comprobarContenido', () => {
  it('una página sin nada raro lo tiene todo bien y los formularios no aplican', () => {
    expect(con('<p>hola</p>').map((x) => [x.id, x.resultado])).toEqual([
      ['contenido.mixto', 'correcto'],
      ['contenido.sri', 'correcto'],
      ['contenido.terceros', 'correcto'],
      ['contenido.formulario', 'no-aplica'],
    ]);
  });
  it('mixto activo es fallo, pasivo es mejorable, y los hosts van en los datos', () => {
    expect(por(con('<script src="http://a.com/x.js"></script><img src="http://b.com/x.png">'), 'contenido.mixto')).toMatchObject({
      resultado: 'fallo',
      gravedad: 'alta',
      datos: { nombres: ['a.com'], total: 1, pasivos: 1 },
    });
    expect(por(con('<img src="http://b.com/x.png">'), 'contenido.mixto')).toMatchObject({ resultado: 'mejorable', datos: { nombres: ['b.com'] } });
  });
  it('sin HTTPS en la página final, el contenido mixto no aplica', () => {
    expect(por(con('<img src="http://b.com/x.png">', { urlFinal: 'http://ejemplo.com/' }), 'contenido.mixto').resultado).toBe('no-aplica');
  });
  it('SRI mejorable con scripts ajenos sin huella; correcto con huella', () => {
    expect(por(con('<script src="https://cdn.a.com/x.js"></script>'), 'contenido.sri')).toMatchObject({ resultado: 'mejorable', datos: { nombres: ['cdn.a.com'] } });
    expect(por(con('<script src="https://cdn.a.com/x.js" integrity="sha384-x"></script>'), 'contenido.sri').resultado).toBe('correcto');
  });
  it('más de cinco servidores ajenos con código es mejorable; cinco es correcto', () => {
    const scripts = (n: number) => Array.from({ length: n }, (_, i) => `<script src="https://s${i}.otra${i}.com/x.js" integrity="x"></script>`).join('');
    expect(por(con(scripts(5)), 'contenido.terceros').resultado).toBe('correcto');
    expect(por(con(scripts(6)), 'contenido.terceros')).toMatchObject({ resultado: 'mejorable', datos: { total: 6 } });
  });
  it('un formulario que envía sin cifrar es fallo crítico; con envío cifrado, correcto', () => {
    expect(por(con('<form action="http://x.com/login"><input type=password></form>'), 'contenido.formulario')).toMatchObject({ resultado: 'fallo', gravedad: 'critica' });
    expect(por(con('<form action="/login"></form>'), 'contenido.formulario').resultado).toBe('correcto');
  });
  it('si la página se recortó no se afirma que esté bien, pero sí lo que se vio', () => {
    const hs = con('<script src="http://a.com/x.js"></script>', { estadoCuerpo: 'recortado' });
    expect(por(hs, 'contenido.mixto').resultado).toBe('fallo');
    const limpia = con('<p>hola</p>', { estadoCuerpo: 'recortado' });
    expect(limpia.map((x) => x.resultado)).toEqual(['no-aplica', 'no-aplica', 'no-aplica', 'no-aplica']);
  });
  it('sin HTML o sin HTTPS no devuelve nada', () => {
    expect(comprobarContenido(sitio({ https: bien(respuesta({ cuerpo: null, estadoCuerpo: 'omitido' })) }))).toEqual([]);
    expect(comprobarContenido(sitio({ https: { ok: false, error: { codigo: 'conexion', mensaje: 'x' } } }))).toEqual([]);
  });
});

describe('contenido con HTML hostil de 1 MB', () => {
  it.each([
    ['etiquetas sin cerrar', '<script src='.repeat(80_000)],
    ['miles de imágenes', '<img src=http://a.com/x.png>'.repeat(35_000)],
    ['direcciones larguísimas', `<script src="http://${'a'.repeat(900_000)}.com/x.js"></script>`],
    ['formularios sin fin', '<form action=http://a.com>'.repeat(38_000)],
  ])('%s', (_n, html) => {
    const t = performance.now();
    con(html);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
