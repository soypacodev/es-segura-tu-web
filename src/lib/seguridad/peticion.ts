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

/**
 * Identifica al visitante por su IP según el proxy de la plataforma (Vercel sobrescribe estas cabeceras;
 * detrás de otro servidor hay que garantizar que quien llega no pueda poner las suyas).
 *
 * Las direcciones IPv6 se agrupan por su prefijo /64 —lo que recibe una sola conexión doméstica o un
 * servidor—, porque quien tiene un /64 dispone de 18 trillones de direcciones y, contando cada una por
 * separado, evadiría el límite. Una IPv6 que lleva dentro una IPv4 (::ffff:1.2.3.4) cuenta como esa IPv4.
 */
export function identificarVisitante(cabeceras: Pick<Headers, 'get'>): string {
  const real = cabeceras.get('x-real-ip')?.trim();
  if (real) return normalizarIp(real);
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
  return reenviada ? normalizarIp(reenviada) : 'desconocido';
}

export function normalizarIp(ip: string): string {
  const texto = ip.slice(0, 64).toLowerCase();
  if (!texto.includes(':')) return texto;
  const mapeada = /^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(texto);
  if (mapeada) return mapeada[1];
  // Se expande «::» a los grupos que representa y se quedan los cuatro primeros.
  const [cabeza, cola, ...sobra] = texto.split('::');
  if (sobra.length > 0) return texto;
  const grupos = (parte: string | undefined) => (parte ? parte.split(':') : []);
  const antes = grupos(cabeza);
  const despues = grupos(cola);
  const relleno = cola === undefined ? [] : Array(Math.max(0, 8 - antes.length - despues.length)).fill('0');
  const todos = [...antes, ...relleno, ...despues];
  if (todos.length !== 8 || !todos.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return texto;
  return `${todos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * Lee el cuerpo de la petición sin pasar de un máximo de bytes: «Content-Length» puede faltar (con
 * «Transfer-Encoding: chunked») o mentir, así que se cuenta lo que realmente llega y se corta al pasarse.
 * Devuelve null si se pasa del máximo.
 */
export async function leerCuerpoLimitado(cuerpo: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  if (cuerpo === null) return '';
  const lector = cuerpo.getReader();
  const trozos: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await lector.cancel().catch(() => undefined);
        return null;
      }
      trozos.push(value);
    }
  } finally {
    lector.releaseLock();
  }
  const junto = new Uint8Array(bytes);
  let posicion = 0;
  for (const trozo of trozos) {
    junto.set(trozo, posicion);
    posicion += trozo.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(junto);
}
