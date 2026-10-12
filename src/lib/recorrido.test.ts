import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Hallazgo, Resultado } from './analisis/tipos';
import { PARADAS, calcularRecorrido, paradaDeHallazgo } from './recorrido';

const h = (id: string, resultado: Resultado, peso = 5): Hallazgo => ({
  id,
  categoria: id.startsWith('https')
    ? 'https'
    : id.startsWith('cabeceras')
      ? 'cabeceras'
      : id.startsWith('cookies')
        ? 'cookies'
        : 'tecnologias',
  resultado,
  gravedad: 'media',
  peso,
});
const estado = (hs: Hallazgo[], id: string, arreglados = new Set<string>()) => calcularRecorrido(hs, arreglados).find((p) => p.id === id)!;

describe('paradas del recorrido', () => {
  it('cada hallazgo que el motor puede emitir pertenece a una sola parada', () => {
    const carpeta = join(__dirname, 'analisis/comprobaciones');
    const ids = new Set<string>();
    for (const f of readdirSync(carpeta).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      for (const m of readFileSync(join(carpeta, f), 'utf8').matchAll(/'((?:https|cabeceras|cookies|tecnologias|privacidad|dns|contenido|rendimiento)\.[a-z]+(?:\.[a-z]+)*)'/g))
        ids.add(m[1]);
    }
    expect(ids.size).toBeGreaterThanOrEqual(22);
    for (const id of ids) {
      const dueñas = PARADAS.filter((p) => paradaDeHallazgo(id) === p.id);
      expect(dueñas, id).toHaveLength(1);
    }
  });

  it('un identificador desconocido no pertenece a ninguna parada', () => {
    expect(paradaDeHallazgo('otra.cosa')).toBeNull();
  });
  it('las subcomprobaciones van con su familia (HSTS en el servidor, caducidad en el canal)', () => {
    expect(paradaDeHallazgo('https.hsts.subdominios')).toBe('servidor');
    expect(paradaDeHallazgo('https.certificado.caducidad')).toBe('canal');
  });
});

describe('estado de cada parada', () => {
  it('es el peor de sus hallazgos', () => {
    expect(
      estado([h('cabeceras.csp', 'fallo'), h('cabeceras.nosniff', 'correcto'), h('cabeceras.referrer', 'mejorable')], 'navegador'),
    ).toEqual({
      id: 'navegador',
      estado: 'fallo',
      pendientes: 2,
    });
    expect(estado([h('cabeceras.csp', 'mejorable'), h('cabeceras.nosniff', 'correcto')], 'navegador').estado).toBe('mejorable');
    expect(estado([h('cabeceras.csp', 'correcto')], 'navegador')).toMatchObject({ estado: 'correcto', pendientes: 0 });
  });

  it('sin hallazgos que cuenten, la parada queda sin datos', () => {
    expect(estado([], 'cookies').estado).toBe('sin-datos');
    expect(estado([h('cookies.secure', 'no-aplica')], 'cookies').estado).toBe('sin-datos');
  });

  it('lo informativo (peso 0) no cambia el estado', () => {
    expect(estado([h('https.hsts', 'correcto'), h('https.hsts.precarga', 'mejorable', 0)], 'servidor').estado).toBe('correcto');
  });

  it('lo marcado como arreglado cuenta como bien, y lo que no se puede arreglar no cambia', () => {
    const hs = [h('cabeceras.csp', 'fallo'), h('cabeceras.nosniff', 'correcto')];
    expect(estado(hs, 'navegador', new Set(['cabeceras.csp']))).toMatchObject({
      estado: 'correcto',
      pendientes: 0,
    });
    expect(estado(hs, 'navegador', new Set(['cabeceras.nosniff'])).estado).toBe('fallo');
  });

  it('reúne hallazgos de varias familias en una misma parada', () => {
    const hs = [h('https.hsts', 'correcto'), h('tecnologias.php', 'fallo')];
    expect(estado(hs, 'servidor')).toMatchObject({
      estado: 'fallo',
      pendientes: 1,
    });
  });

  it('devuelve las seis paradas en orden', () => {
    expect(calcularRecorrido([]).map((p) => p.id)).toEqual(['dominio', 'direccion', 'canal', 'servidor', 'navegador', 'cookies']);
  });
});
