import type { Informe } from '@/lib/analisis/analizar';
import { crearId, type Almacen } from './almacen';
import { firmaValida } from './firma';

/**
 * Un informe que lista archivos privados expuestos (.env, copias, .git…) no se publica nunca: aunque no lleva
 * su contenido, sí dice dónde están, y un enlace compartido puede acabar en manos de cualquiera.
 */
export function esCompartible(informe: Pick<Informe, 'hallazgos'>): boolean {
  return !informe.hallazgos.some((h) => h.categoria === 'exposicion' && h.resultado !== 'correcto' && h.resultado !== 'no-aplica');
}

export type ResultadoGuardar = { ok: true; id: string; caduca: string } | { ok: false; motivo: 'firma' | 'no-compartible' | 'almacen' };

interface Entrada {
  informe: unknown;
  firma: string;
}

interface Dependencias {
  almacen: Almacen;
  secreto: string;
  dias: number;
  ahora?: () => Date;
  crearId?: () => string;
}

/** Guarda un informe compartido si y solo si lo firmó este servidor hace poco. */
export async function guardarInformeCompartido(entrada: Entrada, dep: Dependencias): Promise<ResultadoGuardar> {
  const ahora = (dep.ahora ?? (() => new Date()))();
  if (!firmaValida(entrada.informe, entrada.firma, dep.secreto, ahora.getTime())) return { ok: false, motivo: 'firma' };
  // La firma garantiza que es un Informe tal como lo produjo el motor.
  const informe = entrada.informe as Informe;
  if (!esCompartible(informe)) return { ok: false, motivo: 'no-compartible' };
  const id = (dep.crearId ?? crearId)();
  const caduca = new Date(ahora.getTime() + dep.dias * 24 * 60 * 60 * 1000);
  try {
    await dep.almacen.guardar(id, informe, ahora, caduca);
  } catch (fallo) {
    console.error('[compartir]', fallo instanceof Error ? fallo.message : 'fallo desconocido');
    return { ok: false, motivo: 'almacen' };
  }
  return { ok: true, id, caduca: caduca.toISOString() };
}
