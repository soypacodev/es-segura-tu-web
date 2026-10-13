// Configuración del enlace compartible. Si falta, la función queda desactivada y la web funciona igual.

export interface ConfigCompartir {
  /** Clave con la que el servidor firma los informes que él mismo ha producido. */
  secreto: string;
  /** Días que se conserva un informe compartido. */
  dias: number;
  almacen: { tipo: 'supabase'; url: string; clave: string } | { tipo: 'memoria' };
}

export const DIAS_POR_DEFECTO = 30;
const MAX_DIAS = 365;
const MIN_LARGO_SECRETO = 32;

type Entorno = Readonly<Record<string, string | undefined>>;

function leerDias(valor: string | undefined): number {
  if (valor === undefined || valor.trim() === '') return DIAS_POR_DEFECTO;
  const dias = Number(valor);
  return Number.isInteger(dias) && dias >= 1 && dias <= MAX_DIAS ? dias : DIAS_POR_DEFECTO;
}

/**
 * - Con SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e INFORME_SECRETO (32 caracteres o más): guarda en Supabase.
 * - En desarrollo, sin Supabase: guarda en memoria (se pierde al reiniciar) con un secreto que se genera solo.
 * - En cualquier otro caso: null (desactivado).
 */
export function leerConfigCompartir(env: Entorno, secretoDeDesarrollo: () => string): ConfigCompartir | null {
  const dias = leerDias(env.INFORME_DIAS);
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const clave = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const secreto = env.INFORME_SECRETO?.trim();

  if (url && clave) {
    if (!secreto || secreto.length < MIN_LARGO_SECRETO) return null;
    try {
      const direccion = new URL(url);
      if (direccion.protocol !== 'https:' || direccion.username || direccion.password) return null;
    } catch {
      return null;
    }
    return { secreto, dias, almacen: { tipo: 'supabase', url, clave } };
  }
  if (env.NODE_ENV === 'development')
    return { secreto: secreto && secreto.length >= MIN_LARGO_SECRETO ? secreto : secretoDeDesarrollo(), dias, almacen: { tipo: 'memoria' } };
  return null;
}
