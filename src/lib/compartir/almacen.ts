// Dónde se guardan los informes compartidos. Es una interfaz para poder probarlo sin red y cambiar de base de datos.

import { randomBytes } from 'node:crypto';
import type { Informe } from '@/lib/analisis/analizar';

export interface InformeGuardado {
  informe: Informe;
  creado: string;
  caduca: string;
}

export interface Almacen {
  guardar(id: string, informe: Informe, creado: Date, caduca: Date): Promise<void>;
  /** null si no existe o ya caducó. */
  leer(id: string, ahora: Date): Promise<InformeGuardado | null>;
  /** Una consulta mínima a la base de datos (para que Supabase gratuito no pause el proyecto por inactividad). */
  comprobar(): Promise<void>;
}

const FORMATO_ID = /^[A-Za-z0-9_-]{22}$/;

/** 16 bytes aleatorios (128 bits): no se puede adivinar ni recorrer. */
export function crearId(): string {
  return randomBytes(16).toString('base64url');
}

export function esIdValido(id: string): boolean {
  return FORMATO_ID.test(id);
}

export function crearAlmacenMemoria(): Almacen {
  const datos = new Map<string, InformeGuardado>();
  return {
    async guardar(id, informe, creado, caduca) {
      datos.set(id, { informe, creado: creado.toISOString(), caduca: caduca.toISOString() });
    },
    async comprobar() {
      // En memoria no hay nada que mantener despierto.
    },
    async leer(id, ahora) {
      const guardado = datos.get(id);
      if (!guardado) return null;
      if (Date.parse(guardado.caduca) <= ahora.getTime()) {
        datos.delete(id);
        return null;
      }
      return guardado;
    },
  };
}

type Peticion = (url: string, init: RequestInit) => Promise<Response>;

const TIEMPO_MAX_MS = 5000;

/**
 * Supabase por su API REST (PostgREST), con la clave de servicio, solo desde el servidor.
 * La tabla tiene RLS activado y ninguna política: sin esta clave nadie puede leerla ni escribirla.
 */
export function crearAlmacenSupabase(url: string, clave: string, peticion: Peticion = fetch): Almacen {
  // Las claves nuevas de Supabase («sb_secret_…») no son JWT y van solo en «apikey»; las antiguas (JWT «eyJ…») también en «Authorization».
  const cabeceras: Record<string, string> = { apikey: clave, 'Content-Type': 'application/json' };
  if (clave.startsWith('eyJ')) cabeceras.Authorization = `Bearer ${clave}`;
  const base = `${url}/rest/v1/informes`;
  return {
    async guardar(id, informe, creado, caduca) {
      const respuesta = await peticion(base, {
        method: 'POST',
        headers: { ...cabeceras, Prefer: 'return=minimal' },
        body: JSON.stringify({ id, informe, creado: creado.toISOString(), caduca: caduca.toISOString() }),
        signal: AbortSignal.timeout(TIEMPO_MAX_MS),
        cache: 'no-store',
      });
      if (!respuesta.ok) throw new Error(`almacen-guardar-${respuesta.status}`);
    },
    async comprobar() {
      const respuesta = await peticion(`${base}?select=id&limit=1`, { headers: cabeceras, signal: AbortSignal.timeout(TIEMPO_MAX_MS), cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`almacen-comprobar-${respuesta.status}`);
    },
    async leer(id, ahora) {
      if (!esIdValido(id)) return null;
      const consulta = new URLSearchParams({ id: `eq.${id}`, caduca: `gt.${ahora.toISOString()}`, select: 'informe,creado,caduca', limit: '1' });
      const respuesta = await peticion(`${base}?${consulta.toString()}`, {
        headers: cabeceras,
        signal: AbortSignal.timeout(TIEMPO_MAX_MS),
        cache: 'no-store',
      });
      if (!respuesta.ok) throw new Error(`almacen-leer-${respuesta.status}`);
      const filas: unknown = await respuesta.json();
      const fila = Array.isArray(filas) ? (filas[0] as Partial<InformeGuardado> | undefined) : undefined;
      if (!fila?.informe || typeof fila.creado !== 'string' || typeof fila.caduca !== 'string') return null;
      return { informe: fila.informe, creado: fila.creado, caduca: fila.caduca };
    },
  };
}
