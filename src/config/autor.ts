// Quién hay detrás de la herramienta. Es lo que se enseña en el informe y en el pie.
// Para añadir tu portfolio u otros proyectos, rellena `enlaces`: solo se muestran los que tengan dirección.

export interface EnlaceAutor {
  nombre: string;
  /** Qué es, en pocas palabras. */
  descripcion: string;
  /** Dirección completa (https://…). */
  url: string;
}

export const AUTOR = {
  nombre: 'Paco López',
  titular: 'Programador freelance',
  descripcion:
    'Hago webs y aplicaciones a medida para pequeños negocios, y me encargo de que sean seguras, rápidas y fáciles de mantener. Esta herramienta es gratuita; si quieres que alguien arregle lo que aparece en tu informe, escríbeme.',
  correo: 'soypacodev@gmail.com',
  github: 'https://github.com/soypacodev',
  /** Portfolio y otros proyectos (faltan el portfolio y Cachivache hasta tener su dirección). */
  enlaces: [{ nombre: 'Ovillo & Co.', descripcion: 'Tienda online de artículos de ganchillo', url: 'https://ovillo-co.vercel.app' }] as readonly EnlaceAutor[],
} as const;

/** Las iniciales para el avatar, a partir del nombre. */
export const INICIALES_AUTOR = AUTOR.nombre
  .split(/\s+/)
  .map((p) => p[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

/** Enlace de correo con asunto y cuerpo ya escritos. */
export function enlaceCorreo(asunto: string, cuerpo?: string): string {
  const consulta = [`subject=${encodeURIComponent(asunto)}`, ...(cuerpo ? [`body=${encodeURIComponent(cuerpo)}`] : [])].join('&');
  return `mailto:${AUTOR.correo}?${consulta}`;
}
