'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Letra } from '@/lib/analisis/tipos';
import { LETRAS_DE_MEJOR_A_PEOR, claseDeLetra } from '@/lib/notas';

const CONSULTA = '(prefers-reduced-motion: reduce)';

function suscribirMovimiento(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
}

interface Props {
  actual: Letra | null;
  /** Nota que saldría si se arreglara lo marcado en el simulador. */
  simulada: Letra | null;
  escaneando: boolean;
}

/**
 * La escala de A+ a F. Mientras se analiza, una marca la recorre; cuando
 * hay resultado, aterriza en la nota. (El recorrido es solo visual: no
 * indica cuánto falta.)
 */
export function EscalaNotas({ actual, simulada, escaneando }: Props) {
  const [foco, setFoco] = useState(0);
  const sinMovimiento = useSyncExternalStore(suscribirMovimiento, () => window.matchMedia(CONSULTA).matches, () => false);

  useEffect(() => {
    if (!escaneando || sinMovimiento) return;
    const paso = window.setInterval(() => setFoco((f) => (f + 1) % LETRAS_DE_MEJOR_A_PEOR.length), 300);
    return () => window.clearInterval(paso);
  }, [escaneando, sinMovimiento]);

  return (
    <ol className={`escala${escaneando || actual !== null ? ' escala--atenuada' : ''}`} aria-label="Escala de notas, de A+ a F">
      {LETRAS_DE_MEJOR_A_PEOR.map((letra, i) => {
        const esActual = !escaneando && actual === letra;
        const esSimulada = !escaneando && simulada !== null && simulada !== actual && simulada === letra;
        const escaneada = escaneando && !sinMovimiento && foco === i;
        const clases = [
          'escala__fila',
          `escala__fila--${claseDeLetra(letra)}`,
          esActual ? 'escala__fila--activa' : '',
          esSimulada ? 'escala__fila--simulada' : '',
          escaneada ? 'escala__fila--escaneando' : '',
        ];
        return (
          <li key={letra} className={clases.filter(Boolean).join(' ')}>
            <div className="escala__barra-hueco">
              <span className="escala__barra">{letra}</span>
            </div>
            <div className="escala__marca">
              {escaneada && <span className="escala__marca-texto" key={`e${foco}`}>Mirando…</span>}
              {esActual && <span className="escala__marca-texto">Tu web</span>}
              {esSimulada && <span className="escala__marca-texto escala__marca--simulada">Con tus arreglos</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
