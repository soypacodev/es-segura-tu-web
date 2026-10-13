import { describe, expect, it } from 'vitest';
import { respuesta } from '../pruebas/construir';
import { MAX_NOMBRES, datosDeLista, hallazgoDe, valorCabecera } from './utiles';

describe('valorCabecera', () => {
  it('une los valores repetidos con coma, como los navegadores', () => {
    expect(valorCabecera(respuesta({ cabeceras: { vary: ['a', 'b'] } }), 'vary')).toBe('a, b');
  });
  it('sin cabecera o con lista vacía: undefined', () => {
    expect(valorCabecera(respuesta({ cabeceras: {} }), 'vary')).toBeUndefined();
    expect(valorCabecera(respuesta({ cabeceras: { vary: [] } }), 'vary')).toBeUndefined();
  });
});

describe('hallazgoDe', () => {
  const h = hallazgoDe('cookies');
  it('pone la categoría y solo incluye datos si los hay', () => {
    expect(h('cookies.x', 'fallo', 'alta', 3)).toEqual({ id: 'cookies.x', categoria: 'cookies', resultado: 'fallo', gravedad: 'alta', peso: 3 });
    expect(h('cookies.x', 'fallo', 'alta', 3, { a: 1 })).toMatchObject({ datos: { a: 1 } });
  });
});

describe('datosDeLista', () => {
  it('hasta el máximo, lista todo y no habla de «más»', () => {
    const nombres = Array.from({ length: MAX_NOMBRES }, (_, i) => `n${i}`);
    expect(datosDeLista(nombres)).toEqual({ nombres, total: MAX_NOMBRES });
  });
  it('con más, lista el máximo y dice cuántos faltan (no recorta en silencio)', () => {
    const nombres = Array.from({ length: MAX_NOMBRES + 3 }, (_, i) => `n${i}`);
    expect(datosDeLista(nombres)).toEqual({ nombres: nombres.slice(0, MAX_NOMBRES), total: MAX_NOMBRES + 3, mas: 3 });
  });
});
