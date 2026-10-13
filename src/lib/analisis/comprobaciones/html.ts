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
const esDeNombre = (c: number) => esLetra(c) || (c >= 48 && c <= 57) || c === 45;

/** Elementos cuyo contenido es texto, no etiquetas: lo que haya dentro de un «<script>» no se carga. */
const CONTENIDO_EN_BRUTO = new Set(['script', 'style', 'textarea', 'title', 'template']);

/** Qué se pudo leer: «incompleto» si se saltó una etiqueta pedida por ser demasiado larga o se agotó el presupuesto de lectura. */
export interface EstadoLectura {
  incompleto: boolean;
}

/**
 * Etiquetas de apertura con alguno de los nombres pedidos (en minúsculas), en orden de aparición. Tiempo lineal.
 *
 * Como un navegador, no mira dentro de los comentarios («<!-- … -->») ni del contenido de «script», «style»,
 * «textarea», «title» y «template»; y respeta las comillas de los atributos (un «>» dentro de un valor no
 * termina la etiqueta). Si se salta una etiqueta pedida por ser demasiado larga, se anota en `estado`.
 */
export function* etiquetasDe(html: string, nombres: ReadonlySet<string>, estado?: EstadoLectura): Generator<Etiqueta> {
  const n = html.length;
  // Presupuesto de lectura con comillas: con HTML hostil (miles de comillas sin cerrar) el recorrido
  // etiqueta a etiqueta podría salirse de lo lineal. Pasado el presupuesto se lee sin mirar comillas.
  let presupuesto = 8 * n + 100_000;
  let siguienteCierre = -2; // -2: sin calcular; -1: ya no queda ningún «>»
  let i = html.indexOf('<');
  while (i !== -1) {
    const c = html.charCodeAt(i + 1);
    if (c === 33 /* ! */ && html.startsWith('<!--', i)) {
      const fin = html.indexOf('-->', i + 4);
      if (fin === -1) return;
      i = html.indexOf('<', fin + 3);
      continue;
    }
    if (!esLetra(c)) {
      i = html.indexOf('<', i + 1);
      continue;
    }
    let finNombre = i + 1;
    while (finNombre < n && esDeNombre(html.charCodeAt(finNombre))) finNombre++;
    const nombre = html.slice(i + 1, finNombre).toLowerCase();

    let cierre: number;
    if (nombres.has(nombre) && presupuesto > 0) {
      cierre = cierreRespetandoComillas(html, finNombre, Math.min(n, i + MAX_ETIQUETA));
      presupuesto -= Math.max(1, (cierre === -1 ? Math.min(n, i + MAX_ETIQUETA) : cierre) - finNombre);
      if (cierre === -1) {
        // Demasiado larga o sin cerrar: no se considera etiqueta. Si no hay ningún «>» más, ya no queda nada que leer.
        if (estado) estado.incompleto = true;
        if (html.indexOf('>', i) === -1) return;
        i = html.indexOf('<', i + 1);
        continue;
      }
    } else {
      if (nombres.has(nombre) && estado) estado.incompleto = true; // presupuesto agotado
      if (siguienteCierre !== -1 && siguienteCierre < i) siguienteCierre = html.indexOf('>', i);
      if (siguienteCierre === -1) return;
      cierre = siguienteCierre;
      if (nombres.has(nombre)) {
        if (cierre - i > MAX_ETIQUETA) {
          i = html.indexOf('<', i + 1);
          continue;
        }
      }
    }

    if (nombres.has(nombre) && cierre - i <= MAX_ETIQUETA) {
      yield { nombre, atributos: leerAtributos(html.slice(finNombre, cierre)), fin: cierre + 1 };
    }
    i = CONTENIDO_EN_BRUTO.has(nombre) ? saltarContenido(html, nombre, cierre + 1) : html.indexOf('<', cierre + 1);
  }
}

/** Posición del «>» que cierra la etiqueta (sin contar los que van entre comillas), o -1 si no cierra antes de `limite`. */
function cierreRespetandoComillas(html: string, desde: number, limite: number): number {
  let comilla = 0;
  for (let j = desde; j < limite; j++) {
    const c = html.charCodeAt(j);
    if (comilla !== 0) {
      if (c === comilla) comilla = 0;
    } else if (c === 34 || c === 39) {
      // Una comilla solo abre un valor justo detrás de «=» (y espacios); «don't» suelto no.
      let k = j - 1;
      while (k >= desde && html.charCodeAt(k) <= 32) k--;
      if (k >= desde && html.charCodeAt(k) === 61) comilla = c;
    } else if (c === 62) {
      return j;
    }
  }
  return -1;
}

/** Salta el contenido de un elemento de texto en bruto hasta su cierre (que sí se lee como etiqueta). Devuelve dónde seguir. */
export function saltarContenido(html: string, nombre: string, desde: number): number {
  const cierre = new RegExp(`</${nombre}[\\s/>]`, 'ig');
  cierre.lastIndex = desde;
  const m = cierre.exec(html);
  return m === null ? -1 : m.index;
}

const SOLO_A = new Set(['a']);
const QUE_CARGA = new Set(['script', 'style', 'link', 'iframe', 'img', 'source', 'embed', 'object', 'video', 'audio']);

/**
 * Todo lo que la página carga o ejecuta, como un solo texto: las direcciones de scripts, estilos, marcos,
 * imágenes y demás, más el código de los «script» y «style» escritos dentro de la página. Se deja fuera el
 * texto visible, los comentarios y los enlaces (un «<a href>» a otra web no carga nada). Sirve para buscar
 * servicios concretos sin confundir «carga esto» con «habla de esto». Una sola pasada.
 */
export function textoQueCarga(html: string): string {
  const partes: string[] = [];
  for (const e of etiquetasDe(html, QUE_CARGA)) {
    const a = e.atributos;
    for (const nombre of ['src', 'data', 'srcset']) if (a[nombre]) partes.push(a[nombre]);
    if (e.nombre === 'link' && a['href']) partes.push(a['href']);
    if (e.nombre === 'script' || e.nombre === 'style') {
      const cierre = saltarContenido(html, e.nombre, e.fin);
      partes.push(html.slice(e.fin, cierre === -1 ? html.length : cierre));
    }
  }
  return partes.join('\n');
}

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
  const lectura: EstadoLectura = { incompleto: false };
  for (const a of etiquetasDe(html, SOLO_A, lectura)) {
    if (enlaces.length >= MAX_ENLACES) return { enlaces, completo: false };
    if (cierre !== -1 && cierre < a.fin) cierre = html.indexOf('</a', a.fin);
    const hasta = cierre === -1 ? html.length : cierre;
    const bruto = html.slice(a.fin, Math.min(hasta, a.fin + MAX_TEXTO_ENLACE * 4));
    const texto = quitarEtiquetas(bruto).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_ENLACE);
    enlaces.push({ href: a.atributos['href'] ?? '', texto });
  }
  return { enlaces, completo: !lectura.incompleto };
}
