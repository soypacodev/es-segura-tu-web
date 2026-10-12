import { describe, expect, it } from 'vitest';
import { bien, respuesta, sitio } from '../pruebas/construir';
import { comprobarCookies, esCookieDeSesion, parsearSetCookie } from './cookies';

const conCookies = (...valores: string[]) => sitio({ https: bien(respuesta({ cabeceras: { 'set-cookie': valores } })) });
const por = (hs: ReturnType<typeof comprobarCookies>, id: string) => hs.find((x) => x.id === id);

describe('parsearSetCookie', () => {
  it('lee el nombre y los atributos sin importar mayúsculas ni orden', () => {
    expect(parsearSetCookie('sid=abc123; Path=/; SECURE; httponly; SameSite=Lax')).toEqual({
      nombre: 'sid',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
    });
  });
  it('sin atributos', () => {
    expect(parsearSetCookie('a=1')).toEqual({ nombre: 'a', secure: false, httpOnly: false, sameSite: null });
  });
  it('el valor nunca aparece en el resultado', () => {
    expect(JSON.stringify(parsearSetCookie('sesion=SECRETO-QUE-NO-DEBE-SALIR; Secure'))).not.toContain('SECRETO');
  });
  it('tolera valores con «=» y comillas, y atributos con espacios', () => {
    expect(parsearSetCookie('t="a=b=c" ;  Secure ;SameSite = None')).toEqual({ nombre: 't', secure: true, httpOnly: false, sameSite: 'none' });
  });
  it('SameSite vacío cuenta como no declarado', () => {
    expect(parsearSetCookie('a=1; SameSite=')?.sameSite).toBeNull();
  });
  it.each(['', ';', '=valor', '  =x; Secure'])('descarta lo que no es una cookie: %j', (v) => {
    expect(parsearSetCookie(v)).toBeNull();
  });
  it('«Secure» y «HttpOnly» dentro de un valor no cuentan como atributos', () => {
    expect(parsearSetCookie('a=Secure; Path=/')).toMatchObject({ secure: false });
  });
});

describe('esCookieDeSesion', () => {
  it.each(['PHPSESSID', 'sessionid', 'connect.sid', 'auth_token', 'jwt', 'wordpress_logged_in_x', 'XSRF-TOKEN', 'csrftoken'])('%s sí', (n) => {
    expect(esCookieDeSesion({ nombre: n, secure: false, httpOnly: false, sameSite: null })).toBe(true);
  });
  it.each(['_ga', 'idioma', 'tema', 'carrito', 'cookie_aviso'])('%s no', (n) => {
    expect(esCookieDeSesion({ nombre: n, secure: false, httpOnly: false, sameSite: null })).toBe(false);
  });
});

describe('comprobarCookies', () => {
  it('sin cookies: «cookies.ninguna» correcto y el resto no aplica', () => {
    const r = comprobarCookies(sitio());
    expect(r.map((x) => [x.id, x.resultado])).toEqual([
      ['cookies.ninguna', 'correcto'],
      ['cookies.secure', 'no-aplica'],
      ['cookies.httponly', 'no-aplica'],
      ['cookies.samesite', 'no-aplica'],
    ]);
  });

  it('cookies bien puestas: todo correcto y «ninguna» no aplica', () => {
    const r = comprobarCookies(conCookies('PHPSESSID=x; Secure; HttpOnly; SameSite=Lax', 'tema=oscuro; Secure; SameSite=Strict'));
    expect(r.map((x) => [x.id, x.resultado])).toEqual([
      ['cookies.ninguna', 'no-aplica'],
      ['cookies.secure', 'correcto'],
      ['cookies.httponly', 'correcto'],
      ['cookies.samesite', 'correcto'],
    ]);
    expect(por(r, 'cookies.secure')?.datos).toEqual({ total: 2 });
  });

  it('sin Secure: fallo con los nombres que lo incumplen (y solo esos)', () => {
    const r = comprobarCookies(conCookies('a=1; Secure; SameSite=Lax', 'b=1; SameSite=Lax', 'c=1; SameSite=Lax'));
    expect(por(r, 'cookies.secure')).toMatchObject({ resultado: 'fallo', datos: { total: 3, sin: ['b', 'c'] } });
  });

  it('con más de cinco cookies sin Secure lista cinco y dice cuántas faltan (no recorta en silencio)', () => {
    const r = comprobarCookies(conCookies(...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => `${n}=1; SameSite=Lax`)));
    expect(por(r, 'cookies.secure')?.datos).toEqual({ total: 7, sin: ['a', 'b', 'c', 'd', 'e'], mas: 2 });
  });

  it('un nombre repetido se cuenta una vez', () => {
    const r = comprobarCookies(conCookies('a=1; SameSite=Lax', 'a=2; SameSite=Lax'));
    expect(por(r, 'cookies.secure')?.datos).toEqual({ total: 1, sin: ['a'] });
  });

  it('HttpOnly solo se exige a las de sesión', () => {
    const sinSesion = comprobarCookies(conCookies('idioma=es; Secure; SameSite=Lax'));
    expect(por(sinSesion, 'cookies.httponly')?.resultado).toBe('no-aplica');
    const mal = comprobarCookies(conCookies('PHPSESSID=x; Secure; SameSite=Lax', 'idioma=es; Secure; SameSite=Lax'));
    expect(por(mal, 'cookies.httponly')).toMatchObject({ resultado: 'fallo', datos: { total: 1, sin: ['PHPSESSID'] } });
  });

  it('sin SameSite es «mejorable», no un fallo', () => {
    const r = comprobarCookies(conCookies('a=1; Secure'));
    expect(por(r, 'cookies.samesite')).toMatchObject({ resultado: 'mejorable', datos: { sin: ['a'] } });
  });

  it('también cuentan las cookies que se ponen en una redirección', () => {
    const redir = { url: 'https://ejemplo.com/', estado: 302, ubicacion: '/inicio', setCookie: ['PHPSESSID=x'] };
    const r = comprobarCookies(sitio({ https: bien(respuesta({ redirecciones: [redir] })) }));
    expect(por(r, 'cookies.secure')).toMatchObject({ resultado: 'fallo', datos: { sin: ['PHPSESSID'] } });
  });

  it('sin respuesta por HTTPS no hay nada que valorar', () => {
    expect(comprobarCookies(sitio({ https: { ok: false, error: { codigo: 'conexion', mensaje: 'x' } } }))).toEqual([]);
  });

  it('todas son de la categoría «cookies» y los pesos suman lo esperado', () => {
    const r = comprobarCookies(conCookies('a=1'));
    expect(new Set(r.map((x) => x.categoria))).toEqual(new Set(['cookies']));
    expect(r.reduce((t, x) => t + x.peso, 0)).toBe(23);
  });
});
