import { describe, expect, it } from 'vitest';
import { generadorDeLaPagina } from './tecnologias';
import { MAX_ENLACES, enlacesDe, etiquetasDe, leerAtributos, quitarEtiquetas } from './html';
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
  };
  it.each(Object.entries(CASOS))('%s', (_nombre, html) => {
    const t = performance.now();
    generadorDeLaPagina(html);
    rastreadoresEnHtml(html);
    avisoDeCookies(html);
    usaFuentesDeGoogle(html);
    comprobarPrivacidad(sitio({ https: bien(respuesta({ cuerpo: html })) }));
    expect(performance.now() - t).toBeLessThan(1000);
  });

  it('si hay demasiados enlaces para mirarlos, no se afirma que falte la política (no aplica)', () => {
    const hs = comprobarPrivacidad(sitio({ https: bien(respuesta({ cuerpo: '<a href=x>y</a>'.repeat(MAX_ENLACES + 10) })) }));
    expect(hs.find((x) => x.id === 'privacidad.politica')?.resultado).toBe('no-aplica');
  });
});
