'use client';

import { useEffect, useState } from 'react';
import type { Letra } from '@/lib/analisis/tipos';
import { colorDeLetra } from '@/lib/notas';

const RADIO = 52;
const PERIMETRO = 2 * Math.PI * RADIO;

export function Anillo({ letra, puntos }: { letra: Letra; puntos: number }) {
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLleno(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const color = colorDeLetra(letra);
  return (
    <div className="anillo" role="img" aria-label={`Nota ${letra}, ${puntos} puntos de 100`}>
      <svg className="anillo__svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle className="anillo__fondo" cx="60" cy="60" r={RADIO} />
        <circle
          className="anillo__valor"
          cx="60"
          cy="60"
          r={RADIO}
          stroke={color}
          strokeDasharray={PERIMETRO}
          strokeDashoffset={lleno ? PERIMETRO * (1 - puntos / 100) : PERIMETRO}
        />
      </svg>
      <div className="anillo__centro" aria-hidden="true">
        <span className="anillo__letra" style={{ color }}>
          {letra}
        </span>
        <span className="anillo__puntos">{puntos} de 100</span>
      </div>
    </div>
  );
}
