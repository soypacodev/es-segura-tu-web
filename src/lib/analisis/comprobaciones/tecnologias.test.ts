import { describe, expect, it } from 'vitest';
import { AHORA, bien, respuesta, sitio } from '../pruebas/construir';
import { FIN_DE_VIDA_PHP, comprobarTecnologias, generadorDeLaPagina, versionDePhp } from './tecnologias';

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
    ]);
  });
});
