import { describe, expect, it } from 'vitest';
import { identificarVisitante, origenPermitido } from './peticion';

describe('origenPermitido', () => {
  it.each([
    ['https://ejemplo.com', 'ejemplo.com', true],
    ['https://EJEMPLO.com', 'ejemplo.com', true],
    ['http://localhost:3000', 'localhost:3000', true],
    ['https://otra.com', 'ejemplo.com', false],
    ['https://ejemplo.com.otra.com', 'ejemplo.com', false],
    ['https://ejemplo.com:8443', 'ejemplo.com', false],
    [null, 'ejemplo.com', false],
    ['https://ejemplo.com', null, false],
    ['no es una url', 'ejemplo.com', false],
    ['null', 'ejemplo.com', false],
  ])('%s con host %s → %s', (origin, host, esperado) => {
    expect(origenPermitido(origin, host)).toBe(esperado);
  });
});

describe('identificarVisitante', () => {
  const con = (h: Record<string, string>) => new Headers(h);
  it('prefiere x-real-ip', () => expect(identificarVisitante(con({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }))).toBe('1.2.3.4'));
  it('si no, usa la primera de x-forwarded-for', () => expect(identificarVisitante(con({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }))).toBe('5.6.7.8'));
  it('sin cabeceras, «desconocido»', () => expect(identificarVisitante(con({}))).toBe('desconocido'));
  it('recorta valores enormes', () => expect(identificarVisitante(con({ 'x-real-ip': 'a'.repeat(500) })).length).toBe(64));
});
