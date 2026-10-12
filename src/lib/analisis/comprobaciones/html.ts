// Lectura mínima de etiquetas HTML para las comprobaciones.
//
// El HTML lo controla quien tiene la web que se analiza, así que puede ser
// hostil: millones de «<a » sin cerrar, etiquetas que nunca terminan… Una
// expresión regular con «[\s\S]*?» o «[^>]*» sobre eso tarda tiempo
// cuadrático y bloquearía el servidor. Aquí se recorre el texto una sola
// vez y cada etiqueta tiene un tamaño máximo.

/** Una etiqueta más larga que esto no se considera etiqueta (ninguna real, de las que se miran, llega). */
export const MAX_ETIQUETA = 4_000;
/** Del texto de un enlace solo se leen los primeros caracteres: basta para reconocer «Política de privacidad». */
export const MAX_TEXTO_ENLACE = 300;

export interface Etiqueta {
  nombre: string;
  atributos: Record<string, string>;
  /** Posición justo después de «>». */
  fin: number;
}

const ATRIBUTO = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

export function leerAtributos(texto: string): Record<string, string> {
  const atributos: Record<string, string> = {};
  for (const m of texto.matchAll(ATRIBUTO)) {
    const nombre = m[1].toLowerCase();
    if (!(nombre in atributos)) atributos[nombre] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return atributos;
}

const esLetra = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

/** Etiquetas de apertura con alguno de los nombres pedidos (en minúsculas), en orden de aparición. Tiempo lineal. */
export function* etiquetasDe(html: string, nombres: ReadonlySet<string>): Generator<Etiqueta> {
  let i = html.indexOf('<');
  let siguienteCierre = -2; // -2: sin calcular; -1: ya no queda ningún «>»
  while (i !== -1) {
    const inicioNombre = i + 1;
    if (esLetra(html.charCodeAt(inicioNombre))) {
      if (siguienteCierre !== -1 && siguienteCierre < i) siguienteCierre = html.indexOf('>', i);
      if (siguienteCierre === -1) return;
      let finNombre = inicioNombre;
      while (finNombre < siguienteCierre && /[A-Za-z0-9-]/.test(html[finNombre])) finNombre++;
      const nombre = html.slice(inicioNombre, finNombre).toLowerCase();
      if (nombres.has(nombre) && siguienteCierre - i <= MAX_ETIQUETA) {
        yield { nombre, atributos: leerAtributos(html.slice(finNombre, siguienteCierre)), fin: siguienteCierre + 1 };
      }
    }
    i = html.indexOf('<', i + 1);
  }
}

const SOLO_A = new Set(['a']);

/** Quita las etiquetas de un trozo de HTML dejando un espacio en su lugar. Una sola pasada: lo que queda sin cerrar se descarta. */
export function quitarEtiquetas(trozo: string): string {
  let salida = '';
  let i = 0;
  while (i < trozo.length) {
    const menor = trozo.indexOf('<', i);
    if (menor === -1) return salida + trozo.slice(i);
    salida += `${trozo.slice(i, menor)} `;
    const mayor = trozo.indexOf('>', menor);
    if (mayor === -1) return salida;
    i = mayor + 1;
  }
  return salida;
}

/** Más enlaces que esto no se leen (ninguna página normal los tiene, y cada uno cuesta). Se avisa con `completo: false`. */
export const MAX_ENLACES = 5_000;

/** Enlaces de la página: dirección y texto visible (sin etiquetas, recortado a MAX_TEXTO_ENLACE). Tiempo lineal. */
export function enlacesDe(html: string): { enlaces: { href: string; texto: string }[]; completo: boolean } {
  const enlaces: { href: string; texto: string }[] = [];
  let cierre = -2; // posición del siguiente «</a», -1 si ya no hay
  for (const a of etiquetasDe(html, SOLO_A)) {
    if (enlaces.length >= MAX_ENLACES) return { enlaces, completo: false };
    if (cierre !== -1 && cierre < a.fin) cierre = html.indexOf('</a', a.fin);
    const hasta = cierre === -1 ? html.length : cierre;
    const bruto = html.slice(a.fin, Math.min(hasta, a.fin + MAX_TEXTO_ENLACE * 4));
    const texto = quitarEtiquetas(bruto).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_ENLACE);
    enlaces.push({ href: a.atributos['href'] ?? '', texto });
  }
  return { enlaces, completo: true };
}
