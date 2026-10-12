import { describe, expect, it } from 'vitest';
import { calcularNota } from './analisis/puntuacion';
import type { Hallazgo } from './analisis/tipos';
import { ordenarPorUrgencia, sePuedeArreglar, simular } from './simulacion';

const h = (id: string, resultado: Hallazgo['resultado'], peso: number, techo?: Hallazgo['techo']): Hallazgo => ({
  id,
  categoria: 'https',
  resultado,
  gravedad: 'media',
  peso,
  ...(techo ? { techo } : {}),
});

describe('simular', () => {
  const base = [h('a', 'correcto', 50), h('b', 'fallo', 30), h('c', 'mejorable', 20)];

  it('sin arreglos da la misma nota que el cálculo real', () => {
    expect(simular(base, new Set())).toEqual(calcularNota(base));
  });
  it('arreglar un fallo suma todos sus puntos', () => {
    expect(simular(base, new Set(['b'])).puntos).toBe(90);
  });
  it('arreglar algo mejorable suma la otra mitad', () => {
    expect(simular(base, new Set(['c'])).puntos).toBe(60 + 10);
  });
  it('arreglarlo todo da 100 y A+', () => {
    expect(simular(base, new Set(['b', 'c']))).toMatchObject({ puntos: 100, letra: 'A+' });
  });
  it('arreglar el fallo que pone techo lo quita', () => {
    const con = [h('a', 'correcto', 90), h('x', 'fallo', 10, 'F')];
    expect(simular(con, new Set()).letra).toBe('F');
    expect(simular(con, new Set(['x'])).letra).toBe('A+');
  });
  it('ignora ids que no existen o que ya están bien, y no modifica los datos de entrada', () => {
    const copia = JSON.parse(JSON.stringify(base));
    expect(simular(base, new Set(['a', 'zzz'])).puntos).toBe(calcularNota(base).puntos);
    expect(base).toEqual(copia);
  });
  it('lo que no cuenta para la nota no se puede simular', () => {
    expect(sePuedeArreglar(h('i', 'mejorable', 0))).toBe(false);
    expect(sePuedeArreglar(h('n', 'no-aplica', 5))).toBe(false);
    expect(sePuedeArreglar(h('c', 'correcto', 5))).toBe(false);
  });
});

describe('ordenarPorUrgencia', () => {
  it('primero lo que pone techo, luego lo que más puntos devuelve', () => {
    const lista = [h('poco', 'fallo', 4), h('mucho', 'fallo', 14), h('techo', 'fallo', 6, 'F'), h('medio', 'mejorable', 20), h('bien', 'correcto', 30)];
    expect(ordenarPorUrgencia(lista).map((x) => x.id)).toEqual(['techo', 'mucho', 'medio', 'poco']);
  });
  it('un techo que ya no limita (hallazgo no fallido) no adelanta', () => {
    const lista = [h('a', 'mejorable', 30, 'F'), h('b', 'fallo', 31)];
    expect(ordenarPorUrgencia(lista).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('conserva el orden original en empates', () => {
    const lista = [h('a', 'fallo', 5), h('b', 'fallo', 5)];
    expect(ordenarPorUrgencia(lista).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
