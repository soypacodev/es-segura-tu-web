// «Recorrido de la conexión»: agrupa los hallazgos en las paradas que hace
// una visita desde que escribe la dirección hasta que el navegador guarda
// las cookies, y calcula cómo está cada parada. La lógica va aparte del
// componente para poder probarla.

import type { Hallazgo, Resultado } from './analisis/tipos';
import { sePuedeArreglar } from './simulacion';

export type IdParada = 'dominio' | 'direccion' | 'canal' | 'servidor' | 'navegador' | 'cookies';

/** Orden del recorrido y hallazgos que pertenecen a cada parada (por prefijo exacto o por familia terminada en «.»). */
export const PARADAS: readonly { id: IdParada; ids: readonly string[] }[] = [
  { id: 'dominio', ids: ['dns.'] },
  { id: 'direccion', ids: ['https.redireccion.http'] },
  {
    id: 'canal',
    ids: ['https.disponible', 'https.final.seguro', 'https.tls.version', 'https.certificado.valido', 'https.certificado.caducidad'],
  },
  { id: 'servidor', ids: ['https.hsts', 'tecnologias.', 'rendimiento.', 'exposicion.'] },
  { id: 'navegador', ids: ['cabeceras.', 'contenido.'] },
  { id: 'cookies', ids: ['cookies.', 'privacidad.'] },
];

export type EstadoParada = Resultado | 'sin-datos';

export interface ParadaCalculada {
  id: IdParada;
  estado: EstadoParada;
  /** Hallazgos de la parada que cuentan para la nota y aún no están bien. */
  pendientes: number;
}

export function paradaDeHallazgo(id: string): IdParada | null {
  for (const p of PARADAS) {
    if (p.ids.some((x) => (x.endsWith('.') ? id.startsWith(x) : id === x || id.startsWith(`${x}.`)))) return p.id;
  }
  return null;
}

const GRAVEDAD_ESTADO: Record<Resultado, number> = {
  'no-aplica': 0,
  correcto: 1,
  mejorable: 2,
  fallo: 3,
};

/** Estado de cada parada: el peor de sus hallazgos que cuentan para la nota. Los marcados como arreglados cuentan como bien. */
export function calcularRecorrido(hallazgos: readonly Hallazgo[], arreglados: ReadonlySet<string> = new Set()): ParadaCalculada[] {
  return PARADAS.map(({ id }) => {
    const suyos = hallazgos
      .filter((h) => paradaDeHallazgo(h.id) === id && h.peso > 0 && h.resultado !== 'no-aplica')
      .map((h) => (arreglados.has(h.id) && sePuedeArreglar(h) ? { ...h, resultado: 'correcto' as const } : h));
    if (suyos.length === 0) return { id, estado: 'sin-datos' as const, pendientes: 0 };
    const peor = suyos.reduce((a, h) => (GRAVEDAD_ESTADO[h.resultado] > GRAVEDAD_ESTADO[a] ? h.resultado : a), 'correcto' as Resultado);
    return {
      id,
      estado: peor,
      pendientes: suyos.filter(sePuedeArreglar).length,
    };
  });
}
