// Icono de la marca: la escala de notas en pequeño (verde, ámbar, rojo) con el marcador «tu web» en la verde.
// Lo usan el favicon, el icono de iOS y la cabecera, para que todo sea la misma pieza.

export const COLORES_ICONO = { fondo: '#101a33', verde: '#2fbf8f', ambar: '#f0bd1d', rojo: '#f2594d', marcador: '#ffffff' } as const;

/** Trazos en una cuadrícula de 64×64. */
export const TRAZOS_ICONO = [
  { d: 'M11 13h22l7 6-7 6H11z', color: COLORES_ICONO.verde },
  { d: 'M11 29h28l7 6-7 6H11z', color: COLORES_ICONO.ambar },
  { d: 'M11 45h34l7 6-7 6H11z', color: COLORES_ICONO.rojo },
  { d: 'M45 19l9-5.5v11z', color: COLORES_ICONO.marcador },
] as const;

/** «redondeo» 0 para iOS, que ya recorta las esquinas por su cuenta. */
export function IconoMarca({ tamano, fondo = true, redondeo = 15 }: { tamano: number; fondo?: boolean; redondeo?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 64 64">
      {fondo && <rect width="64" height="64" rx={redondeo} fill={COLORES_ICONO.fondo} />}
      {TRAZOS_ICONO.map((t) => (
        <path key={t.d} d={t.d} fill={t.color} />
      ))}
    </svg>
  );
}
