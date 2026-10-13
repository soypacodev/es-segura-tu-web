import { describe, expect, it, vi } from 'vitest';
import { capturarDns, combinarCaa, consultar, dominioRegistrable } from './dns';
import type { ConsultaDns } from './tipos';
import { errorDns, resolvedorFalso } from './pruebas/construir';

describe('dominioRegistrable', () => {
  it.each([
    ['ejemplo.com', 'ejemplo.com'],
    ['www.tienda.ejemplo.co.uk', 'ejemplo.co.uk'],
    ['blog.ejemplo.es', 'ejemplo.es'],
    // Alojamiento compartido: cada subdominio es de un dueño distinto.
    ['miweb.vercel.app', 'miweb.vercel.app'],
    ['www.miweb.vercel.app', 'miweb.vercel.app'],
    ['usuario.github.io', 'usuario.github.io'],
    ['tienda.netlify.app', 'tienda.netlify.app'],
    ['diario.blogspot.com', 'diario.blogspot.com'],
  ])('%s → %s', (host, esperado) => expect(dominioRegistrable(host)).toBe(esperado));
  it.each(['localhost', '192.0.2.1', 'com', 'vercel.app', 'github.io'])('%s no tiene dominio registrable', (host) => expect(dominioRegistrable(host)).toBeNull());
});

describe('consultar', () => {
  it('con registros: ok', async () => expect(await consultar(async () => ['a'])).toEqual({ estado: 'ok', valores: ['a'] }));
  it('lista vacía: vacío', async () => expect(await consultar(async () => [])).toEqual({ estado: 'vacio' }));
  it.each(['ENODATA', 'ENOTFOUND'])('%s significa que no hay registros', async (c) => {
    expect(await consultar(() => Promise.reject(errorDns(c)))).toEqual({ estado: 'vacio' });
  });
  it.each(['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED'])('%s significa que no se sabe', async (c) => {
    expect(await consultar(() => Promise.reject(errorDns(c)))).toEqual({ estado: 'error' });
  });
  it('un error sin código también es «no se sabe»', async () => {
    expect(await consultar(() => Promise.reject(new Error('x')))).toEqual({ estado: 'error' });
  });
});

describe('combinarCaa', () => {
  const ok: ConsultaDns<string> = { estado: 'ok', valores: ['issue x'] };
  const vacio: ConsultaDns<string> = { estado: 'vacio' };
  const error: ConsultaDns<string> = { estado: 'error' };
  it('manda el del nombre; si no hay, el del dominio', () => {
    expect(combinarCaa(ok, vacio)).toBe(ok);
    expect(combinarCaa(vacio, { estado: 'ok', valores: ['issue y'] })).toEqual({ estado: 'ok', valores: ['issue y'] });
  });
  it('sin ninguno: vacío; si algo no se pudo preguntar y no hay nada: error', () => {
    expect(combinarCaa(vacio, vacio)).toEqual(vacio);
    expect(combinarCaa(error, vacio)).toEqual(error);
    expect(combinarCaa(vacio, error)).toEqual(error);
  });
  it('si hay CAA en alguno, un error en el otro no lo borra', () => {
    expect(combinarCaa(error, { estado: 'ok', valores: ['issue y'] })).toEqual({ estado: 'ok', valores: ['issue y'] });
  });
});

describe('capturarDns', () => {
  it('pregunta por el dominio registrable, no por el subdominio, y une los trozos de cada TXT', async () => {
    const r = resolvedorFalso({
      txt: { 'ejemplo.co.uk': [['v=spf1 include:a', '.com -all']], '_dmarc.ejemplo.co.uk': [['v=DMARC1; p=reject']] },
      mx: { 'ejemplo.co.uk': [{ exchange: 'mx.ejemplo.co.uk', priority: 10 }] },
      caa: { 'www.ejemplo.co.uk': [{ issue: 'letsencrypt.org' }] },
    });
    expect(await capturarDns('www.ejemplo.co.uk', r)).toEqual({
      dominio: 'ejemplo.co.uk',
      txt: { estado: 'ok', valores: ['v=spf1 include:a.com -all'] },
      dmarc: { estado: 'ok', valores: ['v=DMARC1; p=reject'] },
      mx: { estado: 'ok', valores: ['mx.ejemplo.co.uk'] },
      caa: { estado: 'ok', valores: ['issue letsencrypt.org'] },
    });
  });
  it('si la web está en el propio dominio, el CAA se pregunta una sola vez', async () => {
    const r = resolvedorFalso();
    const caa = vi.spyOn(r, 'caa');
    await capturarDns('ejemplo.com', r);
    expect(caa).toHaveBeenCalledTimes(1);
  });
  it('si no aparecen los servidores de nombres, el DNS no es de fiar y todo queda en «no se sabe»', async () => {
    const r = resolvedorFalso({ ns: { 'ejemplo.com': 'ENODATA' }, mx: { 'ejemplo.com': [{ exchange: 'mx.ejemplo.com', priority: 10 }] } });
    expect(await capturarDns('ejemplo.com', r)).toEqual({
      dominio: 'ejemplo.com',
      txt: { estado: 'error' },
      dmarc: { estado: 'error' },
      mx: { estado: 'error' },
      caa: { estado: 'error' },
    });
  });
  it('sin dominio registrable (una IP) no consulta nada', async () => {
    const r = resolvedorFalso();
    const txt = vi.spyOn(r, 'txt');
    expect(await capturarDns('192.0.2.1', r)).toBeNull();
    expect(txt).not.toHaveBeenCalled();
  });
});
