// Lo que viaja entre la API y la página: una línea de JSON por evento.

import type { ErrorAnalisis, Informe } from './analisis/analizar';

/** Presente solo si este despliegue permite compartir y el informe es compartible: la firma habilita guardarlo. */
export interface OfertaCompartir {
  firma: string;
  dias: number;
}

export type Evento =
  | { t: 'inicio'; host: string }
  | { t: 'captura'; via: 'https' | 'http'; ok: boolean }
  | { t: 'informe'; informe: Informe; compartir?: OfertaCompartir }
  | { t: 'error'; error: ErrorAnalisis };

/** Errores que la API da antes de empezar a analizar. */
export type ErrorPeticion =
  { codigo: 'origen' | 'formato' | 'demasiado-grande' } | { codigo: 'demasiados-analisis' | 'servidor-ocupado'; reintentarEnSeg: number };

/** Errores de «Crear enlace para compartir». */
export type ErrorCompartir =
  | { codigo: 'origen' | 'formato' | 'demasiado-grande' | 'no-disponible' | 'firma' | 'no-compartible' | 'almacen' }
  | { codigo: 'demasiados-enlaces'; reintentarEnSeg: number };
