// Límite de uso en memoria: evita que alguien use el analizador para
// bombardear webs ajenas o para agotar los recursos del servidor.
//
// Vale mientras haya una sola instancia caliente; con varias, cada una lleva
// su cuenta (el límite real sería mayor). Más adelante pasará a la base de datos.

export interface ConfigLimite {
  /** Análisis permitidos por visitante en la ventana. */
  maxPorVentana: number;
  ventanaMs: number;
  /** Análisis simultáneos por visitante. */
  maxSimultaneosPorVisitante: number;
  /** Análisis simultáneos en total. */
  maxSimultaneos: number;
  /** Visitantes distintos que se recuerdan como máximo (acota la memoria). */
  maxVisitantes: number;
}

export const LIMITE_POR_DEFECTO: ConfigLimite = {
  maxPorVentana: 12,
  ventanaMs: 60 * 60 * 1000,
  maxSimultaneosPorVisitante: 2,
  maxSimultaneos: 20,
  maxVisitantes: 5000,
};

export type Admision = { ok: true; liberar: () => void } | { ok: false; motivo: 'demasiados-analisis' | 'servidor-ocupado'; reintentarEnSeg: number };

export function crearLimitador(config: ConfigLimite = LIMITE_POR_DEFECTO, ahora: () => number = Date.now) {
  const historial = new Map<string, number[]>();
  const enCurso = new Map<string, number>();
  let total = 0;

  function limpiar(t: number) {
    for (const [visitante, marcas] of historial) {
      const vigentes = marcas.filter((m) => t - m < config.ventanaMs);
      if (vigentes.length === 0 && !enCurso.has(visitante)) historial.delete(visitante);
      else historial.set(visitante, vigentes);
    }
  }

  return {
    admitir(visitante: string): Admision {
      const t = ahora();
      if (historial.size >= config.maxVisitantes) limpiar(t);

      const marcas = (historial.get(visitante) ?? []).filter((m) => t - m < config.ventanaMs);
      const propios = enCurso.get(visitante) ?? 0;

      if (marcas.length >= config.maxPorVentana) {
        const espera = Math.ceil((marcas[0] + config.ventanaMs - t) / 1000);
        return { ok: false, motivo: 'demasiados-analisis', reintentarEnSeg: Math.max(1, espera) };
      }
      if (propios >= config.maxSimultaneosPorVisitante) {
        return { ok: false, motivo: 'demasiados-analisis', reintentarEnSeg: 10 };
      }
      if (total >= config.maxSimultaneos || (!historial.has(visitante) && historial.size >= config.maxVisitantes)) {
        return { ok: false, motivo: 'servidor-ocupado', reintentarEnSeg: 15 };
      }

      marcas.push(t);
      historial.set(visitante, marcas);
      enCurso.set(visitante, propios + 1);
      total += 1;

      let liberado = false;
      return {
        ok: true,
        liberar: () => {
          if (liberado) return;
          liberado = true;
          total -= 1;
          const quedan = (enCurso.get(visitante) ?? 1) - 1;
          if (quedan <= 0) enCurso.delete(visitante);
          else enCurso.set(visitante, quedan);
        },
      };
    },
  };
}
