import { describe, expect, it } from 'vitest';
import { calcularNota, letraPorPuntos } from './puntuacion';
import type { Hallazgo } from './tipos';

const h = (id: string, resultado: Hallazgo['resultado'], peso: number, extra: Partial<Hallazgo> = {}): Hallazgo => ({
  id,
  categoria: 'https',
  resultado,
  gravedad: 'media',
  peso,
  ...extra,
});

describe('letraPorPuntos', () => {
  it.each([
    [100, 'A+'], [97, 'A+'], [96, 'A'], [90, 'A'], [89, 'B'], [80, 'B'], [79, 'C'], [65, 'C'], [64, 'D'], [50, 'D'], [49, 'F'], [0, 'F'],
  ] as const)('%i → %s', (puntos, letra) => expect(letraPorPuntos(puntos)).toBe(letra));
});

describe('calcularNota · puntos', () => {
  it('correcto suma todo, mejorable la mitad y fallo nada', () => {
    const nota = calcularNota([h('a', 'correcto', 10), h('b', 'mejorable', 10), h('c', 'fallo', 20)]);
    expect(nota.puntos).toBe(38); // (10 + 5) / 40 = 37,5 → 38
    expect(nota.letra).toBe('F');
  });

  it('lo que no aplica y lo que pesa 0 no cuenta, ni a favor ni en contra', () => {
    const nota = calcularNota([h('a', 'correcto', 10), h('b', 'no-aplica', 50), h('c', 'fallo', 0), h('d', 'correcto', 0)]);
    expect(nota.puntos).toBe(100);
    expect(nota.letra).toBe('A+');
  });

  it('sin nada puntuable, 0 puntos', () => {
    expect(calcularNota([])).toMatchObject({ puntos: 0, letra: 'F', techo: null });
    expect(calcularNota([h('a', 'no-aplica', 10)]).puntos).toBe(0);
  });

  it('el desglose por categorías usa solo sus hallazgos, y es null si no hay ninguno', () => {
    const nota = calcularNota([h('a', 'correcto', 10), { ...h('b', 'fallo', 10), categoria: 'cabeceras' }]);
    expect(nota.categorias).toEqual([
      { id: 'https', puntos: 100 },
      { id: 'dns', puntos: null },
      { id: 'cabeceras', puntos: 0 },
      { id: 'contenido', puntos: null },
      { id: 'cookies', puntos: null },
      { id: 'privacidad', puntos: null },
      { id: 'tecnologias', puntos: null },
      { id: 'rendimiento', puntos: null },
    ]);
    expect(calcularNota([h('a', 'correcto', 10)]).categorias).toEqual([
      { id: 'https', puntos: 100 },
      { id: 'dns', puntos: null },
      { id: 'cabeceras', puntos: null },
      { id: 'contenido', puntos: null },
      { id: 'cookies', puntos: null },
      { id: 'privacidad', puntos: null },
      { id: 'tecnologias', puntos: null },
      { id: 'rendimiento', puntos: null },
    ]);
  });
});

describe('calcularNota · techos', () => {
  const perfecto = h('bien', 'correcto', 90);

  it('un fallo con techo limita la nota aunque lo demás sea perfecto', () => {
    const nota = calcularNota([perfecto, h('caducado', 'fallo', 10, { techo: 'D' })]);
    expect(nota.puntos).toBe(90);
    expect(nota.letra).toBe('D');
    expect(nota.techo).toEqual({ id: 'caducado', letra: 'D' });
  });

  it('con varios techos manda el más bajo', () => {
    const nota = calcularNota([perfecto, h('a', 'fallo', 1, { techo: 'D' }), h('b', 'fallo', 1, { techo: 'F' }), h('c', 'fallo', 1, { techo: 'C' })]);
    expect(nota.letra).toBe('F');
    expect(nota.techo).toEqual({ id: 'b', letra: 'F' });
  });

  it('un techo solo cuenta cuando el hallazgo falla', () => {
    for (const resultado of ['correcto', 'mejorable', 'no-aplica'] as const) {
      expect(calcularNota([perfecto, h('x', resultado, 1, { techo: 'F' })]).techo).toBeNull();
    }
  });

  it('si la letra por puntos ya es igual o peor que el techo, no se informa del techo', () => {
    const peor = calcularNota([h('a', 'fallo', 100, { techo: 'D' })]);
    expect(peor).toMatchObject({ letra: 'F', techo: null });
    const igual = calcularNota([h('a', 'correcto', 60), h('b', 'fallo', 40, { techo: 'C' })]);
    expect(igual).toMatchObject({ puntos: 60, letra: 'D', techo: null });
  });
});
