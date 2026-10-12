// Comprobaciones sobre la petición que llega a la API.

/**
 * Solo se aceptan peticiones que salen de nuestra propia página: el
 * navegador pone «Origin» y debe coincidir con el «Host» al que llegó.
 * (No es una defensa contra programas que falsifiquen cabeceras; para eso
 * está el límite de uso. Sí impide que otra web use el visitante de víctima.)
 */
export function origenPermitido(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/** Identifica al visitante por su IP según el proxy de la plataforma (Vercel sobrescribe estas cabeceras). */
export function identificarVisitante(cabeceras: Pick<Headers, 'get'>): string {
  const real = cabeceras.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (reenviada || 'desconocido').slice(0, 64);
}
