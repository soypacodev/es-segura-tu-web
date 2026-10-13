import { describe, expect, it } from 'vitest';
import { identificarVisitante, leerCuerpoLimitado, normalizarIp, origenPermitido } from './peticion';

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
  it('recorta valores enormes', () => expect(identificarVisitante(con({ 'x-real-ip': 'a'.repeat(500) })).length).toBeLessThanOrEqual(64));
  it('una cabecera vacía o de espacios cuenta como ausente', () => {
    expect(identificarVisitante(con({ 'x-real-ip': '  ', 'x-forwarded-for': ' ' }))).toBe('desconocido');
  });
});

describe('normalizarIp', () => {
  it('deja las IPv4 como están', () => expect(normalizarIp('203.0.113.7')).toBe('203.0.113.7'));
  it('una IPv4 escrita como IPv6 cuenta como esa IPv4', () => {
    expect(normalizarIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizarIp('::FFFF:203.0.113.7')).toBe('203.0.113.7');
  });
  it('las IPv6 de un mismo /64 son el mismo visitante, escritas como se escriban', () => {
    const a = normalizarIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(normalizarIp('2001:0db8:0001:0002::1')).toBe(a);
    expect(normalizarIp('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe(a);
  });
  it('otro /64 es otro visitante', () => expect(normalizarIp('2001:db8:1:3::1')).not.toBe(normalizarIp('2001:db8:1:2::1')));
  it('expande «::» en cualquier posición', () => {
    expect(normalizarIp('::1')).toBe('0:0:0:0::/64');
    expect(normalizarIp('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(normalizarIp('fe80::1')).toBe('fe80:0:0:0::/64');
  });
  it('lo que no es una IP válida se queda como texto (en minúsculas, sin pasar de 64)', () => {
    expect(normalizarIp('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
    expect(normalizarIp('a::b::c')).toBe('a::b::c');
    expect(normalizarIp('zz:1')).toBe('zz:1');
    expect(normalizarIp(`${'f'.repeat(100)}:1`).length).toBe(64);
  });
});

describe('leerCuerpoLimitado', () => {
  const flujo = (...trozos: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const t of trozos) c.enqueue(new TextEncoder().encode(t));
        c.close();
      },
    });
  it('devuelve el texto, también si llega en trozos', async () => {
    expect(await leerCuerpoLimitado(flujo('{"a":', '"ñ"}'), 100)).toBe('{"a":"ñ"}');
  });
  it('sin cuerpo, cadena vacía', async () => expect(await leerCuerpoLimitado(null, 10)).toBe(''));
  it('en el límite exacto pasa; un byte más, null', async () => {
    expect(await leerCuerpoLimitado(flujo('1234567890'), 10)).toBe('1234567890');
    expect(await leerCuerpoLimitado(flujo('12345678901'), 10)).toBeNull();
  });
  it('cuenta bytes, no caracteres', async () => {
    expect(await leerCuerpoLimitado(flujo('ñññññ'), 10)).toBe('ñññññ');
    expect(await leerCuerpoLimitado(flujo('ññññññ'), 10)).toBeNull();
  });
  it('corta sin leer lo que falta: un flujo infinito no se bufferiza entero', async () => {
    let enviados = 0;
    let cancelado = false;
    const infinito = new ReadableStream<Uint8Array>({
      pull(c) {
        enviados++;
        c.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelado = true;
      },
    });
    expect(await leerCuerpoLimitado(infinito, 4096)).toBeNull();
    expect(cancelado).toBe(true);
    expect(enviados).toBeLessThan(20);
  });
});
