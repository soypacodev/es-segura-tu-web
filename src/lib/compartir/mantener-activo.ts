// Supabase gratuito pausa el proyecto tras una semana sin actividad. Un cron diario de Vercel llama a
// /api/mantener-activo, que hace una consulta mínima. Solo responde a quien trae CRON_SECRET.

import { createHash, timingSafeEqual } from 'node:crypto';

export type ResultadoMantener = { estado: number; cuerpo: { ok: true } | { ok: false; error: 'no-autorizado' | 'sin-configurar' | 'base-de-datos' } };

/** Compara sin filtrar por el tiempo de respuesta cuántos caracteres coinciden. */
function mismoSecreto(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function mantenerActivo(
  autorizacion: string | null,
  dep: { secreto: string | undefined; consultar: (() => Promise<void>) | null },
): Promise<ResultadoMantener> {
  const secreto = dep.secreto?.trim();
  if (!secreto || secreto.length < 16) return { estado: 503, cuerpo: { ok: false, error: 'sin-configurar' } };
  if (!autorizacion || !mismoSecreto(autorizacion, `Bearer ${secreto}`)) return { estado: 401, cuerpo: { ok: false, error: 'no-autorizado' } };
  if (!dep.consultar) return { estado: 503, cuerpo: { ok: false, error: 'sin-configurar' } };
  try {
    await dep.consultar();
    return { estado: 200, cuerpo: { ok: true } };
  } catch {
    return { estado: 502, cuerpo: { ok: false, error: 'base-de-datos' } };
  }
}
