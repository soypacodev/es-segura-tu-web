import { describe, expect, it } from 'vitest';
import { comoPuntos, ejesConNota, puntoDeEje } from './radar';

describe('puntoDeEje', () => {
  const casi = (a: { x: number; y: number }, x: number, y: number) => {
    expect(a.x).toBeCloseTo(x, 6);
    expect(a.y).toBeCloseTo(y, 6);
  };
  it('el primer eje apunta hacia arriba (y menor)', () => casi(puntoDeEje(0, 4, 1, 100, 50), 100, 50));
  it('con 4 ejes: arriba, derecha, abajo, izquierda', () => {
    casi(puntoDeEje(1, 4, 1, 100, 50), 150, 100);
    casi(puntoDeEje(2, 4, 1, 100, 50), 100, 150);
    casi(puntoDeEje(3, 4, 1, 100, 50), 50, 100);
  });
  it('una fracción 0 es el centro y 0,5 la mitad del radio', () => {
    casi(puntoDeEje(2, 4, 0, 100, 50), 100, 100);
    casi(puntoDeEje(1, 4, 0.5, 100, 50), 125, 100);
  });
  it('con 3 ejes forma un triángulo equilátero (mismo radio en los tres)', () => {
    const d = [0, 1, 2].map((i) => Math.hypot(puntoDeEje(i, 3, 1, 0, 10).x, puntoDeEje(i, 3, 1, 0, 10).y));
    d.forEach((x) => expect(x).toBeCloseTo(10, 6));
  });
});

describe('comoPuntos', () => {
  it('formatea para el atributo points de un polígono', () => {
    expect(comoPuntos([{ x: 1, y: 2 }, { x: 3.14159, y: 4 }])).toBe('1.0,2.0 3.1,4.0');
  });
});

describe('ejesConNota', () => {
  it('quita las categorías sin nota y conserva el resto en su orden', () => {
    expect(ejesConNota([{ id: 'a', puntos: 10 }, { id: 'b', puntos: null }, { id: 'c', puntos: 0 }])).toEqual([
      { id: 'a', puntos: 10 },
      { id: 'c', puntos: 0 },
    ]);
  });
});
