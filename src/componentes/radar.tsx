"use client";

import { useEffect, useState } from "react";
import type { Categoria } from "@/lib/analisis/tipos";
import {
  MINIMO_EJES_RADAR,
  comoPuntos,
  ejesConNota,
  puntoDeEje,
} from "@/lib/radar";
import { CATEGORIAS } from "@/lib/textos/es";

const ANCHO = 340;
const ALTO = 250;
const CENTRO = ALTO / 2;
const DESPLAZAMIENTO = (ANCHO - ALTO) / 2;
const RADIO = 70;
const ANILLOS = [0.25, 0.5, 0.75, 1];

interface Props {
  categorias: { id: Categoria; puntos: number | null }[];
  color: string;
}

/**
 * Perfil de la web por categorías. Es un complemento visual: los números
 * están en las barras de al lado, por eso se oculta a los lectores de pantalla.
 */
export function Radar({ categorias, color }: Props) {
  const ejes = ejesConNota(categorias);
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setLleno(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (ejes.length < MINIMO_EJES_RADAR) return null;

  const n = ejes.length;
  const datos = ejes.map((e, i) =>
    puntoDeEje(i, n, e.puntos / 100, CENTRO, RADIO),
  );

  return (
    <svg
      className="radar"
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={`translate(${DESPLAZAMIENTO} 0)`}>
        {ANILLOS.map((f) => (
          <polygon
            key={f}
            className="radar__anillo"
            points={comoPuntos(
              ejes.map((_, i) => puntoDeEje(i, n, f, CENTRO, RADIO)),
            )}
          />
        ))}
        {ejes.map((e, i) => {
          const fin = puntoDeEje(i, n, 1, CENTRO, RADIO);
          const texto = puntoDeEje(i, n, 1, CENTRO, RADIO + 14);
          const ancla =
            texto.x < CENTRO - 4
              ? "end"
              : texto.x > CENTRO + 4
                ? "start"
                : "middle";
          return (
            <g key={e.id}>
              <line
                className="radar__eje"
                x1={CENTRO}
                y1={CENTRO}
                x2={fin.x}
                y2={fin.y}
              />
              <text
                className="radar__texto"
                x={texto.x}
                y={texto.y}
                textAnchor={ancla}
                dominantBaseline="middle"
              >
                {CATEGORIAS[e.id].corto}
              </text>
            </g>
          );
        })}
        <g className={`radar__datos${lleno ? " radar__datos--lleno" : ""}`}>
          <polygon
            points={comoPuntos(datos)}
            fill={color}
            fillOpacity="0.28"
            stroke={color}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {datos.map((p, i) => (
            <circle key={ejes[i].id} cx={p.x} cy={p.y} r="5" fill={color} />
          ))}
        </g>
      </g>
    </svg>
  );
}
