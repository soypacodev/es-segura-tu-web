// Archivos que no deberían poder descargarse desde fuera (claves, copias de seguridad, historial del código…).
//
// Esta categoría hace peticiones adicionales a la web, así que solo se ejecuta si quien analiza declara que es
// responsable de ella o tiene permiso. Reglas que no se saltan:
//   - Una lista fija y corta de rutas, todas en la raíz de la web analizada. Nada de adivinar ni de rastrear.
//   - Solo cuenta como «expuesto» un 200 cuyo contenido tiene la firma del archivo: una web que contesta 200 a todo
//     (muy común en las aplicaciones de una sola página) no da falsos positivos.
//   - El contenido leído (como mucho 4 KB) se descarta en cuanto se mira: nunca llega al informe ni se guarda.
//     Del archivo solo se dice que existe y dónde.

import type { CapturaSitio, Hallazgo, Letra, ResultadoCaptura, Sondeo } from '../tipos';
import { datosDeLista } from './utiles';

/** Bytes que se leen de cada archivo: de sobra para reconocer una firma. */
export const MAX_BYTES_SONDEO = 4096;

type Firma = (contenido: string, tipo: string) => boolean;

export interface Sonda {
  grupo: string;
  ruta: string;
  firma: Firma;
}

const noEsHtml = (tipo: string) => !tipo.includes('text/html') && !tipo.includes('application/xhtml');
const empiezaPorHtml = (c: string) => /^\s*<(?:!doctype|html|head|body)\b/i.test(c);

const firmaEnv: Firma = (c, t) => noEsHtml(t) && !empiezaPorHtml(c) && /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*[ \t]*=/m.test(c);
const firmaVolcado: Firma = (c, t) => noEsHtml(t) && /^-- (?:MySQL|MariaDB|PostgreSQL) (?:dump|database dump)|^(?:CREATE TABLE|INSERT INTO) /im.test(c);
const firmaConfigPhp: Firma = (c, t) => noEsHtml(t) && /define\s*\(\s*['"]DB_(?:PASSWORD|USER|NAME|HOST)['"]/.test(c);
const firmaZip: Firma = (c, t) => noEsHtml(t) && c.startsWith('PK\x03\x04');
const firmaGzip: Firma = (c, t) => noEsHtml(t) && c.startsWith('\x1f\x8b');

export const SONDAS: readonly Sonda[] = [
  { grupo: 'exposicion.env', ruta: '/.env', firma: firmaEnv },
  { grupo: 'exposicion.git', ruta: '/.git/HEAD', firma: (c, t) => noEsHtml(t) && /^ref: refs\/heads\/[\w./-]+\s*$/.test(c) },
  { grupo: 'exposicion.git', ruta: '/.git/config', firma: (c, t) => noEsHtml(t) && /^\[core\]/m.test(c) && /repositoryformatversion/.test(c) },
  { grupo: 'exposicion.copias', ruta: '/wp-config.php.bak', firma: firmaConfigPhp },
  { grupo: 'exposicion.copias', ruta: '/wp-config.php~', firma: firmaConfigPhp },
  { grupo: 'exposicion.copias', ruta: '/config.php.bak', firma: firmaConfigPhp },
  { grupo: 'exposicion.copias', ruta: '/backup.sql', firma: firmaVolcado },
  { grupo: 'exposicion.copias', ruta: '/dump.sql', firma: firmaVolcado },
  { grupo: 'exposicion.copias', ruta: '/database.sql', firma: firmaVolcado },
  { grupo: 'exposicion.copias', ruta: '/backup.zip', firma: firmaZip },
  { grupo: 'exposicion.copias', ruta: '/www.zip', firma: firmaZip },
  { grupo: 'exposicion.copias', ruta: '/backup.tar.gz', firma: firmaGzip },
  { grupo: 'exposicion.phpinfo', ruta: '/phpinfo.php', firma: (c) => /<title>phpinfo\(\)<\/title>|PHP Version \d+\.\d+/i.test(c) },
  { grupo: 'exposicion.phpinfo', ruta: '/info.php', firma: (c) => /<title>phpinfo\(\)<\/title>|PHP Version \d+\.\d+/i.test(c) },
  { grupo: 'exposicion.ds', ruta: '/.DS_Store', firma: (c) => c.startsWith('\x00\x00\x00\x01Bud1') },
  { grupo: 'exposicion.estado', ruta: '/server-status', firma: (c) => /Apache Server Status for/i.test(c) },
  { grupo: 'exposicion.estado', ruta: '/server-info', firma: (c) => /Apache Server Information/i.test(c) },
];

/** Respuestas que dicen «ahora no» (limitación de uso o servicio caído): no demuestran nada ni a favor ni en contra. */
const NO_CONCLUYENTES: ReadonlySet<number> = new Set([429, 503]);

/** Convierte lo que devolvió la descarga de una ruta en «expuesto», «limpio» o «sin-datos». */
export function clasificarSondeo(sonda: Sonda, captura: ResultadoCaptura): Sondeo['estado'] {
  if (!captura.ok) return 'sin-datos';
  const r = captura.respuesta;
  if (NO_CONCLUYENTES.has(r.estado)) return 'sin-datos';
  if (r.estado !== 200) return 'limpio';
  // Un 200 sin cuerpo legible (codificación desconocida, por ejemplo) no permite saber qué es.
  if (r.cuerpo === null) return 'sin-datos';
  const tipo = (r.cabeceras['content-type']?.[0] ?? '').toLowerCase();
  if (sonda.firma(r.cuerpo, tipo)) return 'expuesto';
  return r.estadoCuerpo === 'interrumpido' ? 'sin-datos' : 'limpio';
}

interface Grupo {
  id: string;
  gravedad: Hallazgo['gravedad'];
  peso: number;
  /** Nota máxima si está expuesto. */
  techo?: Letra;
}

const GRUPOS: readonly Grupo[] = [
  { id: 'exposicion.env', gravedad: 'critica', peso: 8, techo: 'F' },
  { id: 'exposicion.copias', gravedad: 'critica', peso: 8, techo: 'F' },
  { id: 'exposicion.git', gravedad: 'critica', peso: 8, techo: 'D' },
  { id: 'exposicion.phpinfo', gravedad: 'alta', peso: 4 },
  { id: 'exposicion.estado', gravedad: 'media', peso: 3 },
  { id: 'exposicion.ds', gravedad: 'baja', peso: 2 },
];

export function comprobarExposicion(captura: CapturaSitio): Hallazgo[] {
  const sondeos = captura.sondeos;
  if (sondeos === undefined) return [];
  return GRUPOS.map((g): Hallazgo => {
    const base = { id: g.id, categoria: 'exposicion' as const, gravedad: g.gravedad, peso: g.peso };
    const suyos = sondeos.filter((s) => s.grupo === g.id);
    const expuestos = suyos.filter((s) => s.estado === 'expuesto').map((s) => s.ruta);
    if (expuestos.length > 0) {
      return { ...base, resultado: 'fallo', ...(g.techo ? { techo: g.techo } : {}), datos: datosDeLista(expuestos) };
    }
    const sinDatos = suyos.filter((s) => s.estado === 'sin-datos').length;
    // Si alguna ruta no se pudo mirar, no se puede decir que esté todo bien.
    if (suyos.length === 0 || sinDatos > 0) return { ...base, resultado: 'no-aplica', datos: { sinDatos, total: suyos.length } };
    return { ...base, resultado: 'correcto', datos: { revisadas: suyos.length } };
  });
}
