import { describe, expect, it } from 'vitest';
import { AHORA, bien, respuesta, sitio } from '../pruebas/construir';
import { FIN_DE_VIDA_PHP, MAX_SCRIPTS, comprobarTecnologias, generadorDeLaPagina, leerLibrerias, versionDePhp } from './tecnologias';

const con = (cabeceras: Record<string, string[]> = {}, cuerpo?: string | null) =>
  sitio({ https: bien(respuesta({ cabeceras: { ...respuesta().cabeceras, ...cabeceras }, ...(cuerpo !== undefined ? { cuerpo } : {}) })) });
const por = (c: ReturnType<typeof sitio>, id: string, ahora = AHORA) => comprobarTecnologias(c, ahora).find((x) => x.id === id);

describe('versionDePhp', () => {
  it.each([
    ['PHP/7.4.3', '7.4.3', '7.4'],
    ['php/8.2.1', '8.2.1', '8.2'],
    ['PHP/8.3', '8.3', '8.3'],
    ['Apache/2.4.41 (Ubuntu) PHP/8.1.2-1ubuntu2', '8.1.2-1ubuntu2'.replace('-1ubuntu2', ''), '8.1'],
  ])('%s', (entrada, version, rama) => {
    expect(versionDePhp(entrada)).toEqual({ version, rama });
  });
  it.each(['Express', 'nginx/1.18.0', 'PHP', 'PHP/', 'NotPHP/7.4'])('no hay versión en %j', (e) => {
    expect(versionDePhp(e)).toBeNull();
  });
});

describe('tecnologias.php', () => {
  it('sin PHP: no aplica', () => {
    expect(por(con(), 'tecnologias.php')?.resultado).toBe('no-aplica');
  });
  it('PHP 7.4 (fin de vida en 2022) es un fallo, con la fecha', () => {
    expect(por(con({ 'x-powered-by': ['PHP/7.4.3'] }), 'tecnologias.php')).toMatchObject({
      resultado: 'fallo',
      datos: { version: '7.4.3', rama: '7.4', fin: '2022-11-28' },
    });
  });
  it('PHP 8.1 ya está caducado en octubre de 2026 y 8.2 todavía no', () => {
    expect(por(con({ 'x-powered-by': ['PHP/8.1.9'] }), 'tecnologias.php')?.resultado).toBe('fallo');
    expect(por(con({ 'x-powered-by': ['PHP/8.2.9'] }), 'tecnologias.php')?.resultado).toBe('correcto');
  });
  it('el día después del fin de vida pasa a fallo (con fecha inyectada)', () => {
    const c = con({ 'x-powered-by': ['PHP/8.2.0'] });
    expect(por(c, 'tecnologias.php', new Date('2026-12-31T23:00:00Z'))?.resultado).toBe('correcto');
    expect(por(c, 'tecnologias.php', new Date('2027-01-01T00:30:00Z'))?.resultado).toBe('fallo');
  });
  it('también lo detecta en la cabecera Server', () => {
    expect(por(con({ server: ['Apache/2.4.41 PHP/5.6.40'] }), 'tecnologias.php')?.resultado).toBe('fallo');
  });
  it('una rama antigua que no está en la lista es un fallo y una futura se da por vigente', () => {
    expect(por(con({ 'x-powered-by': ['PHP/4.4.9'] }), 'tecnologias.php')?.resultado).toBe('fallo');
    expect(por(con({ 'x-powered-by': ['PHP/9.0.1'] }), 'tecnologias.php')?.resultado).toBe('correcto');
    expect(por(con({ 'x-powered-by': ['PHP/8.9.0'] }), 'tecnologias.php')?.resultado).toBe('correcto');
  });
  it('la lista de fechas está en orden y es válida', () => {
    const fechas = Object.values(FIN_DE_VIDA_PHP).map((f) => Date.parse(f));
    expect(fechas.every(Number.isFinite)).toBe(true);
    expect([...fechas].sort((a, b) => a - b)).toEqual(fechas);
  });
});

describe('tecnologias.servidor', () => {
  it.each([['nginx/1.18.0'], ['Apache/2.4.41 (Ubuntu)'], ['Microsoft-IIS/10.0'], ['LiteSpeed/6.1']])('%s revela la versión', (v) => {
    expect(por(con({ server: [v] }), 'tecnologias.servidor')).toMatchObject({ resultado: 'mejorable', datos: { valor: v } });
  });
  it.each([['nginx'], ['Apache'], ['cloudflare'], ['Vercel']])('%s no la revela', (v) => {
    expect(por(con({ server: [v] }), 'tecnologias.servidor')?.resultado).toBe('correcto');
  });
  it('sin cabecera: correcto', () => {
    expect(por(con(), 'tecnologias.servidor')?.resultado).toBe('correcto');
  });
  it('un valor larguísimo se recorta y se marca como recortado', () => {
    const largo = `Apache/2.4.1 ${'x'.repeat(300)}`;
    const d = por(con({ server: [largo] }), 'tecnologias.servidor')?.datos as { valor: string; recortado?: boolean };
    expect(d.valor.length).toBe(120);
    expect(d.recortado).toBe(true);
  });
});

describe('tecnologias.cabecera', () => {
  it.each([
    ['x-powered-by', 'PHP/7.4.3'],
    ['x-powered-by', 'ASP.NET 4.0'],
    ['x-aspnet-version', '4.0.30319'],
    ['x-aspnetmvc-version', '5.2'],
  ])('%s: %s', (nombre, valor) => {
    expect(por(con({ [nombre]: [valor] }), 'tecnologias.cabecera')).toMatchObject({ resultado: 'mejorable', datos: { cabecera: nombre, valor } });
  });
  it('«Express» a secas no cuenta versión', () => {
    expect(por(con({ 'x-powered-by': ['Express'] }), 'tecnologias.cabecera')?.resultado).toBe('correcto');
  });
  it('sin cabeceras: correcto', () => {
    expect(por(con(), 'tecnologias.cabecera')?.resultado).toBe('correcto');
  });
});

describe('generadorDeLaPagina', () => {
  it.each([
    ['<meta name="generator" content="WordPress 6.4.2">', 'WordPress 6.4.2'],
    ["<meta content='Joomla! - Open Source' name='generator'>", 'Joomla! - Open Source'],
    ['<META NAME=Generator CONTENT="Drupal 10 (https://www.drupal.org)" />', 'Drupal 10 (https://www.drupal.org)'],
    ['<meta name="viewport" content="width=device-width"><meta name="generator" content="Hugo 0.120.0">', 'Hugo 0.120.0'],
  ])('%s', (html, esperado) => {
    expect(generadorDeLaPagina(html)).toBe(esperado);
  });
  it.each(['', '<meta name="description" content="generator">', '<meta name="generator">', '<p>name="generator" content="x"</p>'])('nada en %j', (html) => {
    expect(generadorDeLaPagina(html)).toBeNull();
  });
});

describe('tecnologias.generador', () => {
  it('con versión: mejorable', () => {
    expect(por(con({}, '<meta name="generator" content="WordPress 6.4.2">'), 'tecnologias.generador')).toMatchObject({
      resultado: 'mejorable',
      datos: { valor: 'WordPress 6.4.2' },
    });
  });
  it('sin versión: correcto', () => {
    expect(por(con({}, '<meta name="generator" content="WordPress">'), 'tecnologias.generador')?.resultado).toBe('correcto');
  });
  it('sin cuerpo (no era HTML o se omitió): no aplica', () => {
    expect(por(con({}, null), 'tecnologias.generador')?.resultado).toBe('no-aplica');
  });
});

describe('comprobarTecnologias', () => {
  it('sin HTTPS no hay nada que valorar', () => {
    expect(comprobarTecnologias(sitio({ https: { ok: false, error: { codigo: 'conexion', mensaje: 'x' } } }), AHORA)).toEqual([]);
  });
  it('un sitio limpio saca todo correcto salvo PHP, que no aplica', () => {
    expect(comprobarTecnologias(sitio(), AHORA).map((x) => [x.id, x.resultado])).toEqual([
      ['tecnologias.php', 'no-aplica'],
      ['tecnologias.servidor', 'correcto'],
      ['tecnologias.cabecera', 'correcto'],
      ['tecnologias.generador', 'correcto'],
      ['tecnologias.librerias', 'no-aplica'],
    ]);
  });
});

const nombres = (html: string) => leerLibrerias(html).vistas.map((v) => `${v.nombre} ${v.version}${v.obsoleta ? ' !' : ''}`).sort();
const scripts = (...src: string[]) => `<html><head>${src.map((s) => `<script src="${s}"></script>`).join('')}</head></html>`;

describe('leerLibrerias', () => {
  it.each([
    ['/js/jquery-1.12.4.min.js', ['jQuery 1.12.4 !']],
    ['https://code.jquery.com/jquery-3.4.1.min.js', ['jQuery 3.4.1 !']],
    ['https://code.jquery.com/jquery-3.5.0.min.js', ['jQuery 3.5.0']],
    ['https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js', ['jQuery 3.7.1']],
    ['https://cdn.jsdelivr.net/npm/jquery@2.2.4/dist/jquery.min.js', ['jQuery 2.2.4 !']],
    ['/wp-includes/js/jquery/jquery.min.js?ver=3.6.0', ['jQuery 3.6.0']],
    ['/wp-includes/js/jquery/jquery.min.js?ver=1.12.4-wp', ['jQuery 1.12.4 !']],
    ['https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js', ['Bootstrap 3.3.7 !']],
    ['https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js', ['Bootstrap 3.4.1']],
    ['/bootstrap-4.3.0.min.js', ['Bootstrap 4.3.0 !']],
    ['/bootstrap-4.3.1.min.js', ['Bootstrap 4.3.1']],
    ['/bootstrap-5.0.0.min.js', ['Bootstrap 5.0.0']],
    ['https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js', ['AngularJS 1.8.2 !']],
    ['/vendor/angular-1.5.8.min.js', ['AngularJS 1.5.8 !']],
  ])('%s', (src, esperado) => expect(nombres(scripts(src))).toEqual(esperado));

  it.each([
    '/jquery.min.js', // sin versión
    '/jquery-ui-1.12.1.min.js', // otra librería
    '/jquery-migrate-3.0.0.min.js',
    '/jquery.mobile-1.4.5.min.js',
    '/bootstrap-icons/1.11.0/font.css',
    '/bootstrap-select-1.13.0.js',
    '/js/mijquery-1.2.3.js',
    'https://cdn.jsdelivr.net/npm/@angular/core@16.0.0/index.js', // Angular moderno, no AngularJS
    '/angular-material@1.2.0.js',
    '/otra.js?ver=3.6.0', // el parámetro solo se mira en jquery(.min).js
  ])('no confunde %s', (src) => expect(nombres(scripts(src))).toEqual([]));

  it('solo la rama 1 de AngularJS está sin soporte', () => {
    expect(nombres(scripts('/angular-2.0.0.js'))).toEqual(['AngularJS 2.0.0']);
  });
  it('mira también las hojas de estilo y no repite la misma librería', () => {
    const html = '<link rel="stylesheet" href="/bootstrap-3.3.7.min.css"><script src="/bootstrap-3.3.7.min.js"></script>';
    expect(nombres(html)).toEqual(['Bootstrap 3.3.7 !']);
  });
  it('varias versiones de la misma librería cuentan por separado', () => {
    expect(nombres(scripts('/jquery-1.12.4.js', '/jquery-3.7.1.js'))).toEqual(['jQuery 1.12.4 !', 'jQuery 3.7.1']);
  });
  it('lee solo scripts y estilos con src o href, y tolera comillas simples y mayúsculas', () => {
    expect(nombres(`<SCRIPT SRC='/JQuery-1.9.1.JS'></SCRIPT><img src="/jquery-1.2.3.png"><a href="/jquery-1.2.3.html">x</a>`)).toEqual(['jQuery 1.9.1 !']);
  });
  it('con más etiquetas de las que se leen avisa de que no es completo', () => {
    const relleno = '<script src="/a.js"></script>'.repeat(MAX_SCRIPTS + 1);
    expect(leerLibrerias(relleno).completo).toBe(false);
    expect(leerLibrerias('<script src="/a.js"></script>'.repeat(MAX_SCRIPTS)).completo).toBe(true);
  });
  it('direcciones enormes y 1 MB hostil no tardan', () => {
    for (const html of ['<script src="' + 'jquery-'.repeat(150_000) + '"></script>', '<script '.repeat(125_000), '<link href="/jquery-'.repeat(50_000)]) {
      const t = performance.now();
      leerLibrerias(html);
      expect(performance.now() - t).toBeLessThan(1500);
    }
  });
});

describe('tecnologias.librerias', () => {
  const cuerpo = (...src: string[]) => con({}, scripts(...src));
  it('una librería con fallos publicados es un fallo importante, con su nombre y versión', () => {
    expect(por(cuerpo('/jquery-1.12.4.min.js', '/bootstrap-3.3.7.js'), 'tecnologias.librerias')).toMatchObject({
      resultado: 'fallo',
      gravedad: 'alta',
      peso: 6,
      datos: { lista: ['jQuery 1.12.4', 'Bootstrap 3.3.7'] },
    });
  });
  it('con más de cinco lista cinco y dice cuántas faltan (no recorta en silencio)', () => {
    const src = Array.from({ length: 7 }, (_, i) => `/jquery-1.${i}.0.js`);
    const h = por(cuerpo(...src), 'tecnologias.librerias');
    expect(h?.datos).toMatchObject({ mas: 2 });
    expect((h?.datos?.lista as string[]).length).toBe(5);
  });
  it('si todas las que se ven están al día, correcto', () => {
    expect(por(cuerpo('/jquery-3.7.1.min.js'), 'tecnologias.librerias')).toMatchObject({ resultado: 'correcto', datos: { total: 1 } });
  });
  it('si hay una buena y una mala, manda la mala', () => {
    expect(por(cuerpo('/jquery-3.7.1.min.js', '/angular-1.8.2.js'), 'tecnologias.librerias')?.resultado).toBe('fallo');
  });
  it('sin ninguna reconocida, no aplica (no se presume que esté bien)', () => {
    expect(por(cuerpo('/app.js'), 'tecnologias.librerias')?.resultado).toBe('no-aplica');
  });
  it('sin HTML que leer, no aplica', () => {
    expect(por(con({}, null), 'tecnologias.librerias')?.resultado).toBe('no-aplica');
  });
});
