import { describe, expect, it } from 'vitest';
import { generadorDeLaPagina } from './tecnologias';
import { MAX_ENLACES, MAX_ETIQUETA, enlacesDe, etiquetasDe, leerAtributos, quitarEtiquetas, type EstadoLectura } from './html';
import { leerRecursos } from './contenido';
import { leerCabecera } from './rendimiento';
import { leerLibrerias } from './tecnologias';
import { avisoDeCookies, comprobarPrivacidad, rastreadoresEnHtml, usaFuentesDeGoogle } from './privacidad';
import { bien, respuesta, sitio } from '../pruebas/construir';

describe('leerAtributos', () => {
  it('con comillas dobles, simples o sin ellas, y nombres en minúsculas', () => {
    expect(leerAtributos(` NAME="generator" content='WordPress 6.4' data-x=1 hidden`)).toEqual({ name: 'generator', content: 'WordPress 6.4', 'data-x': '1', hidden: '' });
  });
  it('si un atributo se repite, vale el primero (como en un navegador)', () => {
    expect(leerAtributos('a=1 a=2')).toEqual({ a: '1' });
  });
});

describe('etiquetasDe', () => {
  it('encuentra las etiquetas pedidas sin importar mayúsculas, y se salta el resto', () => {
    const hs = [...etiquetasDe('<DIV><Meta name=x><p><meta name=y></div>', new Set(['meta']))];
    expect(hs.map((e) => e.atributos['name'])).toEqual(['x', 'y']);
  });
  it('un «<» que no abre una etiqueta (2 < 3) se ignora', () => {
    expect([...etiquetasDe('2 < 3 <meta name=x>', new Set(['meta']))]).toHaveLength(1);
  });
  it('una etiqueta que no termina no se considera etiqueta', () => {
    expect([...etiquetasDe('<meta name=x', new Set(['meta']))]).toEqual([]);
  });
  it('una etiqueta absurdamente larga se descarta', () => {
    expect([...etiquetasDe(`<meta name=x content="${'a'.repeat(5000)}">`, new Set(['meta']))]).toEqual([]);
  });
});

describe('quitarEtiquetas', () => {
  it('deja un espacio por etiqueta y descarta lo que queda sin cerrar', () => {
    expect(quitarEtiquetas('a<b>c</b>d')).toBe('a c d');
    expect(quitarEtiquetas('hola <span')).toBe('hola  ');
    expect(quitarEtiquetas('sin etiquetas')).toBe('sin etiquetas');
  });
});

describe('enlacesDe', () => {
  it('lee solo hasta el cierre del enlace y recorta el texto', () => {
    const { enlaces } = enlacesDe(`<a href=/a>${'x'.repeat(1000)}</a><a href=/b>b</a>`);
    expect(enlaces[0].texto).toHaveLength(300);
    expect(enlaces[1]).toEqual({ href: '/b', texto: 'b' });
  });
  it('con más de MAX_ENLACES lo dice (completo: false) en vez de seguir', () => {
    const r = enlacesDe('<a href=x>y</a>'.repeat(MAX_ENLACES + 10));
    expect(r.enlaces).toHaveLength(MAX_ENLACES);
    expect(r.completo).toBe(false);
  });
});

describe('HTML hostil de 1 MB: nada tarda más de un segundo', () => {
  const N = 1_000_000;
  const CASOS: Record<string, string> = {
    '«<a » sin cerrar': '<a '.repeat(N / 3),
    'enlaces sin cierre': '<a href=x>'.repeat(N / 10),
    'enlaces anidados': '<a>'.repeat(N / 3),
    '«<meta » sin «>»': '<meta '.repeat(N / 6),
    'meta sin contenido': '<meta name=generator '.repeat(N / 22),
    'comillas sin cerrar': '<a href="'.repeat(N / 9),
    'enlace y mil «<» seguidos': ('<a>' + '<'.repeat(1200)).repeat(N / 1203),
    'solo «<»': '<'.repeat(N),
    'espacios tras «accept»': `accept${' '.repeat(N)}`,
    'muchos «accept»': 'accept '.repeat(N / 7),
    'script con comillas sin cerrar': '<script a="'.repeat(N / 11),
    'varios script sin cierre': '<script src=a>'.repeat(N / 14),
    'comentarios sin cerrar': '<!--'.repeat(N / 4),
    'comentarios y scripts alternos': '<!-- x --><script>1</script>'.repeat(N / 28),
    'comillas dobles y simples alternas': `<img src="a' b="c" '`.repeat(N / 20),
    'atributos con «>» y comillas': '<img data-x=">" src=">"'.repeat(N / 22),
    'etiquetas de 3999 y 4001 caracteres': (`<img alt="${'x'.repeat(3980)}">` + `<img alt="${'x'.repeat(4000)}">`).repeat(N / 8000),
  };
  it.each(Object.entries(CASOS))('%s', (_nombre, html) => {
    const t = performance.now();
    generadorDeLaPagina(html);
    rastreadoresEnHtml(html);
    avisoDeCookies(html);
    usaFuentesDeGoogle(html);
    comprobarPrivacidad(sitio({ https: bien(respuesta({ cuerpo: html })) }));
    leerRecursos(html, new URL('https://ejemplo.com/'));
    leerCabecera(html);
    leerLibrerias(html);
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it('si hay demasiados enlaces para mirarlos, no se afirma que falte la política (no aplica)', () => {
    const hs = comprobarPrivacidad(sitio({ https: bien(respuesta({ cuerpo: '<a href=x>y</a>'.repeat(MAX_ENLACES + 10) })) }));
    expect(hs.find((x) => x.id === 'privacidad.politica')?.resultado).toBe('no-aplica');
  });
});

const nombres = (html: string, quienes: string[], estado?: EstadoLectura) => [...etiquetasDe(html, new Set(quienes), estado)].map((e) => `${e.nombre}:${e.atributos['src'] ?? e.atributos['href'] ?? ''}`);

describe('etiquetasDe se comporta como un navegador', () => {
  it('no mira dentro de comentarios, ni de condicionales de IE', () => {
    expect(nombres('<!-- <script src="http://viejo.com/a.js"></script> --><script src="/b.js"></script>', ['script'])).toEqual(['script:/b.js']);
    expect(nombres('<!--[if IE]><script src="/ie.js"></script><![endif]--><p>', ['script'])).toEqual([]);
  });
  it('un comentario sin cerrar se come el resto (como en un navegador)', () => {
    expect(nombres('<script src="/a.js"></script><!-- <script src="/b.js"></script>', ['script'])).toEqual(['script:/a.js']);
  });
  it('no mira dentro del contenido de script, style, textarea, title ni template', () => {
    const html = `<script>document.write('<img src="http://x.test/a.png">')</script>
      <style>/* <img src="http://x.test/b.png"> */</style><textarea><img src="http://x.test/c.png"></textarea>
      <title><img src="http://x.test/d.png"></title><template><img src="http://x.test/e.png"></template><img src="/real.png">`;
    expect(nombres(html, ['img'])).toEqual(['img:/real.png']);
  });
  it('el script en sí sí se lee, y lo que hay detrás también', () => {
    expect(nombres('<script src="/a.js">var x = "<img src=/dentro.png>"</script><img src="/fuera.png">', ['script', 'img'])).toEqual(['script:/a.js', 'img:/fuera.png']);
  });
  it('el cierre de script se reconoce sin importar mayúsculas ni espacios', () => {
    expect(nombres('<SCRIPT>x</SCRIPT ><img src="/a.png">', ['img'])).toEqual(['img:/a.png']);
    expect(nombres('<script>x</scriptx><img src="/dentro.png"></script><img src="/fuera.png">', ['img'])).toEqual(['img:/fuera.png']);
  });
  it('un «>» dentro de comillas no termina la etiqueta', () => {
    expect(nombres('<script data-x="a>b" src="http://cdn.test/a.js"></script>', ['script'])).toEqual(['script:http://cdn.test/a.js']);
    expect(nombres("<img alt='1 > 0' src='/a.png'>", ['img'])).toEqual(['img:/a.png']);
  });
  it('una comilla suelta (don\'t) no abre un valor', () => {
    expect(nombres("<img alt=don't src=/a.png>", ['img'])).toEqual(['img:/a.png']);
  });
  it('lo que no es una etiqueta pedida no se lee con comillas, pero tampoco rompe nada', () => {
    expect(nombres('<div title="a>b"><img src="/a.png"></div>', ['img'])).toEqual(['img:/a.png']);
  });
  it('una etiqueta pedida demasiado larga se salta y se anota como lectura incompleta', () => {
    const estado: EstadoLectura = { incompleto: false };
    const larga = `<img alt="${'x'.repeat(MAX_ETIQUETA)}" src="/a.png"><img src="/b.png">`;
    expect(nombres(larga, ['img'], estado)).toEqual(['img:/b.png']);
    expect(estado.incompleto).toBe(true);
  });
  it('una de tamaño normal no marca nada', () => {
    const estado: EstadoLectura = { incompleto: false };
    nombres('<img src="/a.png"><a href=x>y</a>', ['img', 'a'], estado);
    expect(estado.incompleto).toBe(false);
  });
  it('un comentario o un script cuyo cierre falta no rompe lo anterior', () => {
    expect(nombres('<img src="/a.png"><!-- sin cerrar', ['img'])).toEqual(['img:/a.png']);
    expect(nombres('<img src="/a.png"><script>sin cerrar', ['img'])).toEqual(['img:/a.png']);
  });
});
