// Lo que viaja entre la API y la página: una línea de JSON por evento.

import type { ErrorAnalisis, Informe } from './analisis/analizar';

export type Evento =
  | { t: 'inicio'; host: string }
  | { t: 'captura'; via: 'https' | 'http'; ok: boolean }
  | { t: 'informe'; informe: Informe }
  | { t: 'error'; error: ErrorAnalisis };

/** Errores que la API da antes de empezar a analizar. */
export type ErrorPeticion =
  | { codigo: 'origen' | 'formato' | 'demasiado-grande' }
  | { codigo: 'demasiados-analisis' | 'servidor-ocupado'; reintentarEnSeg: number };
