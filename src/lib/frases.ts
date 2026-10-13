// Utilidades de texto para la interfaz.

/**
 * La primera frase de un texto. Un punto dentro de unas comillas angulares («…») no cierra la frase: ahí va lo
 * que dijo la web analizada (por ejemplo, una cabecera «Server») y puede traer puntos y espacios cualesquiera.
 */
export function primeraFrase(texto: string): string {
  let abiertas = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '«') abiertas++;
    else if (c === '»') abiertas = Math.max(0, abiertas - 1);
    else if (abiertas === 0 && (c === '.' || c === '!' || c === '?') && (i === texto.length - 1 || /\s/.test(texto[i + 1]))) {
      return texto.slice(0, i + 1);
    }
  }
  return texto;
}

/** «en 15 segundos», «en unos 5 minutos», «en 2 horas»: cuánto esperar, dicho para una persona. */
export function textoDeEspera(segundos: number): string {
  const s = Math.max(1, Math.ceil(Number.isFinite(segundos) ? segundos : 1));
  if (s < 60) return s === 1 ? 'en 1 segundo' : `en ${s} segundos`;
  const minutos = Math.ceil(s / 60);
  if (minutos < 60) return minutos === 1 ? 'en 1 minuto' : `en unos ${minutos} minutos`;
  const horas = Math.ceil(minutos / 60);
  return horas === 1 ? 'en 1 hora' : `en ${horas} horas`;
}
