import { describe, expect, it, vi } from 'vitest';
import { mantenerActivo } from './mantener-activo';

const SECRETO = 'secreto-del-cron-de-prueba';

describe('mantenerActivo', () => {
  it('con el secreto correcto hace la consulta y responde 200', async () => {
    const consultar = vi.fn(async () => undefined);
    expect(await mantenerActivo(`Bearer ${SECRETO}`, { secreto: SECRETO, consultar })).toEqual({ estado: 200, cuerpo: { ok: true } });
    expect(consultar).toHaveBeenCalledOnce();
  });
  it('sin cabecera, con otro secreto o con el formato mal: 401 y no toca la base de datos', async () => {
    const consultar = vi.fn(async () => undefined);
    for (const mala of [null, '', SECRETO, `Bearer ${SECRETO}x`, `bearer ${SECRETO}`, 'Bearer otro']) {
      expect((await mantenerActivo(mala, { secreto: SECRETO, consultar })).estado).toBe(401);
    }
    expect(consultar).not.toHaveBeenCalled();
  });
  it('sin CRON_SECRET (o demasiado corto) no hace nada: 503', async () => {
    const consultar = vi.fn(async () => undefined);
    expect((await mantenerActivo('Bearer x', { secreto: undefined, consultar })).estado).toBe(503);
    expect((await mantenerActivo('Bearer corto', { secreto: 'corto', consultar })).estado).toBe(503);
    expect(consultar).not.toHaveBeenCalled();
  });
  it('sin base de datos configurada: 503', async () => {
    expect(await mantenerActivo(`Bearer ${SECRETO}`, { secreto: SECRETO, consultar: null })).toEqual({
      estado: 503,
      cuerpo: { ok: false, error: 'sin-configurar' },
    });
  });
  it('si la base de datos falla: 502 sin detalles', async () => {
    const r = await mantenerActivo(`Bearer ${SECRETO}`, { secreto: SECRETO, consultar: async () => Promise.reject(new Error('detalle interno')) });
    expect(r).toEqual({ estado: 502, cuerpo: { ok: false, error: 'base-de-datos' } });
  });
});
