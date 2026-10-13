import { describe, expect, it } from 'vitest';
import type { Hallazgo } from '../tipos';
import { mal, sitio, sitioConCabeceras } from '../pruebas/construir';
import { comprobarCabeceras, parsearCsp, problemasCsp } from './cabeceras';

const hallazgo = (hallazgos: Hallazgo[], id: string): Hallazgo => {
  const encontrado = hallazgos.find((x) => x.id === id);
  if (!encontrado) throw new Error(`No hay hallazgo «${id}»`);
  return encontrado;
};

const evaluar = (id: string, cabeceras: Record<string, string[] | undefined>) => hallazgo(comprobarCabeceras(sitioConCabeceras(cabeceras)), id);

describe('comprobarCabeceras · generales', () => {
  it('con las cabeceras bien puestas, todo es correcto', () => {
    const r = comprobarCabeceras(sitio());
    expect(r.map((x) => `${x.id}:${x.resultado}`)).toEqual([
      'cabeceras.csp:correcto',
      'cabeceras.clickjacking:correcto',
      'cabeceras.nosniff:correcto',
      'cabeceras.referrer:correcto',
      'cabeceras.permisos:correcto',
    ]);
    expect(r.every((x) => x.categoria === 'cabeceras')).toBe(true);
  });

  it('si no hay página por HTTPS no hay cabeceras que evaluar', () => {
    expect(comprobarCabeceras(sitio({ https: mal('conexion') }))).toEqual([]);
  });

  it('sin ninguna cabecera, falla lo que tiene que fallar', () => {
    const r = comprobarCabeceras(sitioConCabeceras({
      'content-security-policy': undefined,
      'x-content-type-options': undefined,
      'referrer-policy': undefined,
      'permissions-policy': undefined,
    }));
    expect(r.map((x) => `${x.id}:${x.resultado}`)).toEqual([
      'cabeceras.csp:fallo',
      'cabeceras.clickjacking:fallo',
      'cabeceras.nosniff:fallo',
      'cabeceras.referrer:mejorable',
      'cabeceras.permisos:mejorable',
    ]);
  });
});

describe('parsearCsp y problemasCsp', () => {
  it('lee directivas, ignora vacías y se queda con la primera repetida', () => {
    const [politica] = parsearCsp("default-src 'self';; SCRIPT-SRC 'self' cdn.ejemplo.com; script-src 'none'");
    expect(politica.get('default-src')).toEqual(["'self'"]);
    expect(politica.get('script-src')).toEqual(["'self'", 'cdn.ejemplo.com']);
  });

  it('varias políticas separadas por coma se leen por separado', () => {
    expect(parsearCsp("default-src 'self', script-src 'none'")).toHaveLength(2);
    expect(parsearCsp(' , ; ')).toEqual([]);
  });

  it.each([
    ["default-src 'self'", []],
    ["script-src 'self'; object-src 'none'", []],
    ["script-src 'self' 'nonce-abc'; object-src 'none'", []],
    ["script-src 'unsafe-inline' 'nonce-abc'; object-src 'none'", []], // con nonce, unsafe-inline se ignora
    ["script-src 'unsafe-inline' 'sha256-xyz='; object-src 'none'", []],
    ["script-src 'unsafe-inline' 'strict-dynamic'; object-src 'none'", []],
    ["script-src 'strict-dynamic' https: http:; object-src 'none'", []], // con strict-dynamic, las listas se ignoran
    ["script-src 'unsafe-inline'; object-src 'none'", ['unsafe-inline']],
    ["script-src 'self' 'UNSAFE-EVAL'; object-src 'none'", ['unsafe-eval']],
    ["script-src * ; object-src 'none'", ['comodin']],
    ["script-src https:; object-src 'none'", ['comodin']],
    ["script-src data:; object-src 'none'", ['comodin']],
    ["script-src 'unsafe-inline' 'unsafe-eval' *; object-src 'none'", ['unsafe-inline', 'unsafe-eval', 'comodin']],
    ["script-src 'self'", ['sin-object-src']],
    ["img-src 'self'", ['sin-script-src', 'sin-object-src']],
    ["default-src 'unsafe-inline'", ['unsafe-inline']],
  ])('«%s» → %j', (politica, problemas) => {
    expect(problemasCsp(parsearCsp(politica)[0])).toEqual(problemas);
  });
});

describe('comprobarCabeceras · CSP', () => {
  it('ausente es un fallo; en modo «solo informe» también, y lo dice', () => {
    expect(evaluar('cabeceras.csp', { 'content-security-policy': undefined })).toMatchObject({ resultado: 'fallo', gravedad: 'alta', peso: 14 });
    expect(evaluar('cabeceras.csp', { 'content-security-policy': undefined, 'content-security-policy-report-only': ["default-src 'self'"] })).toMatchObject({
      resultado: 'fallo',
      datos: { soloInforme: true },
    });
  });

  it('una cabecera vacía o ilegible cuenta como ausente', () => {
    expect(evaluar('cabeceras.csp', { 'content-security-policy': [' ; '] }).resultado).toBe('fallo');
  });

  it('presente pero débil es mejorable y dice por qué', () => {
    expect(evaluar('cabeceras.csp', { 'content-security-policy': ["script-src 'unsafe-inline' *; object-src 'none'"] })).toMatchObject({
      resultado: 'mejorable',
      datos: { problemas: ['unsafe-inline', 'comodin'] },
    });
  });

  it('con varias políticas basta con que una proteja bien', () => {
    const doble = ["script-src 'unsafe-inline'; object-src 'none', script-src 'self'; object-src 'none'"];
    expect(evaluar('cabeceras.csp', { 'content-security-policy': doble }).resultado).toBe('correcto');
  });

  it('la misma cabecera repetida se trata como varias políticas', () => {
    const repetida = ["script-src 'unsafe-inline'; object-src 'none'", "script-src 'self'; object-src 'none'"];
    expect(evaluar('cabeceras.csp', { 'content-security-policy': repetida }).resultado).toBe('correcto');
  });
});

describe('comprobarCabeceras · clickjacking', () => {
  const clic = (cabeceras: Readonly<Record<string, readonly string[] | undefined>>) =>
    evaluar('cabeceras.clickjacking', {
      'content-security-policy': undefined,
      ...Object.fromEntries(Object.entries(cabeceras).map(([nombre, valor]) => [nombre, valor ? [...valor] : undefined])),
    });

  it.each([
    [{ 'x-frame-options': ['DENY'] }, 'correcto'],
    [{ 'x-frame-options': ['sameorigin'] }, 'correcto'],
    [{ 'x-frame-options': [' SAMEORIGIN '] }, 'correcto'],
    [{ 'x-frame-options': ['ALLOW-FROM https://otra.com'] }, 'mejorable'],
    [{ 'x-frame-options': ['TALVEZ'] }, 'fallo'],
    [{ 'x-frame-options': ['DENY, DENY'] }, 'correcto'], // repetida por un proxy
    [{ 'x-frame-options': ['DENY, SAMEORIGIN'] }, 'fallo'], // contradictoria: el navegador la ignora
    [{ 'content-security-policy': ['frame-ancestors https:'] }, 'fallo'], // cualquier web https puede incrustarla
    [{ 'content-security-policy': ['frame-ancestors http: https:'] }, 'fallo'],
    [{ 'content-security-policy': ['frame-ancestors https://*'] }, 'fallo'],
    [{ 'content-security-policy': ["frame-ancestors 'self' https://*.socio.com"] }, 'correcto'],
    [{ 'content-security-policy': ["frame-ancestors 'none'"] }, 'correcto'],
    [{ 'content-security-policy': ["default-src 'self'; frame-ancestors 'self' https://socio.com"] }, 'correcto'],
    [{ 'content-security-policy': ['frame-ancestors *'] }, 'fallo'],
    [{ 'content-security-policy': ['frame-ancestors *'], 'x-frame-options': ['DENY'] }, 'correcto'],
    [{ 'content-security-policy': ["default-src 'self'"] }, 'fallo'], // CSP sin frame-ancestors
    [{}, 'fallo'],
  ] as const)('%j → %s', (cabeceras, esperado) => {
    expect(clic(cabeceras).resultado).toBe(esperado);
  });
});

describe('comprobarCabeceras · nosniff, referrer y permisos', () => {
  it.each([
    [['nosniff'], 'correcto'],
    [['NOSNIFF'], 'correcto'],
    [['nosniff, nosniff'], 'correcto'],
    [['nosniff', 'nosniff'], 'correcto'],
    [[''], 'fallo'],
    [['sniff'], 'fallo'],
    [undefined, 'fallo'],
  ] as const)('x-content-type-options %j → %s', (valor, esperado) => {
    expect(evaluar('cabeceras.nosniff', { 'x-content-type-options': valor ? [...valor] : undefined }).resultado).toBe(esperado);
  });

  it.each([
    [undefined, 'mejorable'],
    ['no-referrer', 'correcto'],
    ['same-origin', 'correcto'],
    ['strict-origin-when-cross-origin', 'correcto'],
    ['origin, strict-origin', 'correcto'],
    ['strict-origin, basura', 'correcto'], // el navegador usa la última que reconoce
    ['strict-origin, unsafe-url', 'fallo'],
    ['unsafe-url', 'fallo'],
    ['no-referrer-when-downgrade', 'mejorable'],
    ['basura', 'mejorable'],
    ['', 'mejorable'],
  ] as const)('referrer-policy %j → %s', (valor, esperado) => {
    expect(evaluar('cabeceras.referrer', { 'referrer-policy': valor ? [valor] : undefined }).resultado).toBe(esperado);
  });

  it('un valor que ningún navegador reconoce se anota como desconocido, no como una política concreta', () => {
    expect(evaluar('cabeceras.referrer', { 'referrer-policy': ['basura'] }).datos).toEqual({ desconocida: true });
  });

  it('permisos: vale Permissions-Policy o la antigua Feature-Policy', () => {
    expect(evaluar('cabeceras.permisos', { 'permissions-policy': undefined }).resultado).toBe('mejorable');
    expect(evaluar('cabeceras.permisos', { 'permissions-policy': undefined, 'feature-policy': ["camera 'none'"] }).resultado).toBe('correcto');
    expect(evaluar('cabeceras.permisos', { 'permissions-policy': ['camera=()'] }).resultado).toBe('correcto');
  });
});
