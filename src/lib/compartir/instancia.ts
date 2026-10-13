import 'server-only';
import { randomBytes } from 'node:crypto';
import { crearAlmacenMemoria, crearAlmacenSupabase, type Almacen } from './almacen';
import { leerConfigCompartir, type ConfigCompartir } from './config';

export interface Compartir {
  config: ConfigCompartir;
  almacen: Almacen;
}

// En desarrollo, el recargado en caliente reinicia los módulos: lo guardado en memoria y el secreto viven en globalThis.
const global = globalThis as { __compartir?: Compartir | null };

/** null = el enlace compartible está desactivado en este despliegue. */
export function obtenerCompartir(): Compartir | null {
  if (global.__compartir !== undefined) return global.__compartir;
  const config = leerConfigCompartir(process.env, () => randomBytes(32).toString('hex'));
  global.__compartir = config
    ? { config, almacen: config.almacen.tipo === 'supabase' ? crearAlmacenSupabase(config.almacen.url, config.almacen.clave) : crearAlmacenMemoria() }
    : null;
  return global.__compartir;
}
