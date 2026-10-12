import { describe, expect, it } from 'vitest';
import { crearLector } from './leer-flujo';

const a = JSON.stringify({ t: 'inicio', host: 'ejemplo.com' });
const b = JSON.stringify({ t: 'captura', via: 'https', ok: true });

describe('crearLector', () => {
  it('entrega los eventos completos de cada trozo', () => {
    expect(crearLector().añadir(`${a}\n${b}\n`)).toEqual([JSON.parse(a), JSON.parse(b)]);
  });
  it('junta una línea partida en varios trozos', () => {
    const l = crearLector();
    expect(l.añadir(a.slice(0, 7))).toEqual([]);
    expect(l.añadir(`${a.slice(7)}\n${b.slice(0, 3)}`)).toEqual([JSON.parse(a)]);
    expect(l.añadir(`${b.slice(3)}\n`)).toEqual([JSON.parse(b)]);
  });
  it('ignora líneas vacías, rotas o con forma desconocida', () => {
    expect(crearLector().añadir(`\n{roto\n{"t":"otra"}\n[1]\n"x"\nnull\n${a}\n`)).toEqual([JSON.parse(a)]);
  });
  it('al terminar entrega la última línea aunque no acabe en salto', () => {
    const l = crearLector();
    expect(l.añadir(a)).toEqual([]);
    expect(l.terminar()).toEqual([JSON.parse(a)]);
    expect(l.terminar()).toEqual([]);
  });
});
