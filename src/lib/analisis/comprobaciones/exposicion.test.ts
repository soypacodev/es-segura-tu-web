import { describe, expect, it } from 'vitest';
import { bien, mal, respuesta, sitio } from '../pruebas/construir';
import type { Sondeo } from '../tipos';
import { SONDAS, clasificarSondeo, comprobarExposicion, type Sonda } from './exposicion';

const sonda = (ruta: string): Sonda => {
  const s = SONDAS.find((x) => x.ruta === ruta);
  if (!s) throw new Error(`no hay sonda para ${ruta}`);
  return s;
};

/** Respuesta 200 de un archivo con ese tipo y contenido. */
const archivo = (cuerpo: string, tipo = 'text/plain', extra: Partial<Parameters<typeof respuesta>[0]> = {}) =>
  bien(respuesta({ estado: 200, cabeceras: { 'content-type': [tipo] }, cuerpo, ...extra }));

const veredicto = (ruta: string, captura: ReturnType<typeof archivo>) => clasificarSondeo(sonda(ruta), captura);

describe('lista de sondas', () => {
  it('es fija y corta: el formulario promete «unas 17 peticiones»', () => {
    expect(SONDAS).toHaveLength(17);
  });
  it('todas las rutas son de la raíz, sin repetirse ni llevar parámetros', () => {
    const rutas = SONDAS.map((s) => s.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const ruta of rutas) expect(ruta).toMatch(/^\/[\w.~/-]+$/);
  });
});

describe('clasificarSondeo · firmas que sí son el archivo', () => {
  it.each([
    ['/.env', 'APP_KEY=base64:abc\nDB_PASSWORD=secreto\n', 'text/plain'],
    ['/.env', 'export API_TOKEN="x"', 'application/octet-stream'],
    ['/.git/HEAD', 'ref: refs/heads/main\n', 'text/plain'],
    ['/.git/config', '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n', 'text/plain'],
    ['/wp-config.php.bak', "<?php\ndefine( 'DB_PASSWORD', 'x' );", 'application/octet-stream'],
    ['/backup.sql', '-- MySQL dump 10.13  Distrib 8.0\n', 'application/sql'],
    ['/dump.sql', 'DROP TABLE x;\nCREATE TABLE `usuarios` (id int);', 'text/plain'],
    ['/backup.zip', 'PK\x03\x04\x14\x00', 'application/zip'],
    ['/backup.tar.gz', '\x1f\x8b\x08\x00', 'application/gzip'],
    ['/phpinfo.php', '<html><head><title>phpinfo()</title></head>', 'text/html; charset=UTF-8'],
    ['/info.php', '<h1 class="p">PHP Version 8.2.1</h1>', 'text/html'],
    ['/.DS_Store', '\x00\x00\x00\x01Bud1\x00\x00', 'application/octet-stream'],
    ['/server-status', '<h1>Apache Server Status for ejemplo.com</h1>', 'text/html'],
    ['/server-info', '<h1>Apache Server Information</h1>', 'text/html'],
  ])('%s con «%s» está expuesto', (ruta, cuerpo, tipo) => {
    expect(veredicto(ruta, archivo(cuerpo, tipo))).toBe('expuesto');
  });
});

describe('clasificarSondeo · lo que NO es el archivo', () => {
  const SPA = '<!doctype html><html><head><title>Mi app</title></head><body><div id="root"></div></body></html>';

  it('una web que contesta 200 con su página a todo no da falsos positivos', () => {
    for (const s of SONDAS) expect(clasificarSondeo(s, archivo(SPA, 'text/html; charset=utf-8'))).toBe('limpio');
  });
  it('lo mismo aunque no declare que es HTML', () => {
    for (const s of SONDAS) expect(clasificarSondeo(s, archivo(SPA, 'text/plain'))).toBe('limpio');
  });
  it('un HTML que menciona el nombre no cuenta', () => {
    expect(veredicto('/.env', archivo('<html><body>APP_KEY=abc</body></html>', 'text/html'))).toBe('limpio');
    expect(veredicto('/backup.zip', archivo('PK\x03\x04', 'text/html'))).toBe('limpio');
    expect(veredicto('/backup.sql', archivo('CREATE TABLE x', 'text/html'))).toBe('limpio');
  });
  it.each([
    ['/.env', 'Not found'],
    ['/.env', '{"error":"no"}'],
    ['/.env', 'esto es una frase = con igual en medio'],
    ['/.git/HEAD', 'ref: algo raro'],
    ['/.git/config', '[core] sin nada más'],
    ['/backup.zip', 'esto no es un zip'],
    ['/.DS_Store', 'Bud1 pero sin la cabecera'],
    ['/phpinfo.php', 'phpinfo no está aquí'],
  ])('%s con «%s» no es el archivo', (ruta, cuerpo) => {
    expect(veredicto(ruta, archivo(cuerpo))).toBe('limpio');
  });
  it.each([301, 302, 401, 403, 404, 410, 500])('un %i es «limpio»', (estado) => {
    expect(veredicto('/.env', bien(respuesta({ estado, cuerpo: null, estadoCuerpo: 'omitido' })))).toBe('limpio');
  });
});

describe('clasificarSondeo · cuando no se puede saber', () => {
  it.each([429, 503])('un %i no demuestra nada', (estado) => {
    expect(veredicto('/.env', bien(respuesta({ estado, cuerpo: null, estadoCuerpo: 'omitido' })))).toBe('sin-datos');
  });
  it.each(['tiempo-agotado', 'conexion', 'dns', 'ip-no-publica'] as const)('un fallo de red (%s)', (codigo) => {
    expect(clasificarSondeo(sonda('/.env'), mal(codigo))).toBe('sin-datos');
  });
  it('un 200 sin cuerpo legible', () => {
    expect(veredicto('/.env', archivo('', 'text/plain', { cuerpo: null, estadoCuerpo: 'omitido' }))).toBe('sin-datos');
  });
  it('un cuerpo interrumpido sin firma; con firma, expuesto', () => {
    expect(veredicto('/.env', archivo('nada', 'text/plain', { estadoCuerpo: 'interrumpido' }))).toBe('sin-datos');
    expect(veredicto('/.env', archivo('A=1\n', 'text/plain', { estadoCuerpo: 'interrumpido' }))).toBe('expuesto');
  });
  it('un cuerpo recortado por el tope sin firma es «limpio»', () => {
    expect(veredicto('/.env', archivo('nada', 'text/plain', { estadoCuerpo: 'recortado' }))).toBe('limpio');
  });
});

const todos = (estado: Sondeo['estado']): Sondeo[] => SONDAS.map((s) => ({ grupo: s.grupo, ruta: s.ruta, estado }));
const hallazgos = (sondeos?: Sondeo[]) => comprobarExposicion(sitio(sondeos ? { sondeos } : {}));
const de = (hs: ReturnType<typeof hallazgos>, id: string) => {
  const h = hs.find((x) => x.id === id);
  if (!h) throw new Error(`sin hallazgo ${id}`);
  return h;
};

describe('comprobarExposicion', () => {
  it('sin sondeo (no se dio permiso) no emite nada', () => {
    expect(hallazgos()).toEqual([]);
  });
  it('todo limpio: seis hallazgos correctos, en la categoría «exposicion»', () => {
    const hs = hallazgos(todos('limpio'));
    expect(hs).toHaveLength(6);
    for (const h of hs) {
      expect(h.resultado).toBe('correcto');
      expect(h.categoria).toBe('exposicion');
      expect(h.techo).toBeUndefined();
    }
  });
  it('.env expuesto: fallo crítico con techo F y la ruta como dato (nunca el contenido)', () => {
    const sondeos = todos('limpio').map((s) => (s.ruta === '/.env' ? { ...s, estado: 'expuesto' as const } : s));
    const h = de(hallazgos(sondeos), 'exposicion.env');
    expect(h).toMatchObject({ resultado: 'fallo', gravedad: 'critica', techo: 'F', datos: { nombres: ['/.env'], total: 1 } });
  });
  it('techos: copias F, .git D, el resto sin techo', () => {
    const hs = hallazgos(todos('expuesto'));
    expect(Object.fromEntries(hs.map((h) => [h.id, h.techo ?? null]))).toEqual({
      'exposicion.env': 'F',
      'exposicion.copias': 'F',
      'exposicion.git': 'D',
      'exposicion.phpinfo': null,
      'exposicion.estado': null,
      'exposicion.ds': null,
    });
  });
  it('lista las rutas expuestas de un grupo y dice cuántas sobran (sin recortar en silencio)', () => {
    const hs = hallazgos(todos('expuesto'));
    const copias = de(hs, 'exposicion.copias');
    expect(copias.datos).toMatchObject({ total: 9, mas: 4 });
    expect((copias.datos?.['nombres'] as string[]).length).toBe(5);
  });
  it('si una ruta de un grupo no se pudo mirar, el grupo es «no aplica», no «correcto»', () => {
    const sondeos = todos('limpio').map((s) => (s.ruta === '/.git/config' ? { ...s, estado: 'sin-datos' as const } : s));
    const hs = hallazgos(sondeos);
    expect(de(hs, 'exposicion.git')).toMatchObject({ resultado: 'no-aplica', datos: { sinDatos: 1, total: 2 } });
    expect(de(hs, 'exposicion.env').resultado).toBe('correcto');
  });
  it('un hallazgo expuesto manda aunque otra ruta del grupo no se pudiera mirar', () => {
    const sondeos = todos('sin-datos').map((s) => (s.ruta === '/.git/HEAD' ? { ...s, estado: 'expuesto' as const } : s));
    expect(de(hallazgos(sondeos), 'exposicion.git').resultado).toBe('fallo');
  });
  it('un grupo sin ningún sondeo registrado no se da por bueno', () => {
    expect(de(hallazgos([]), 'exposicion.env').resultado).toBe('no-aplica');
  });
});
