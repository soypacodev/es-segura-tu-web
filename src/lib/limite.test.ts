import { describe, expect, it } from 'vitest';
import { crearLimitador, type ConfigLimite } from './limite';

const CONFIG: ConfigLimite = { maxPorVentana: 3, ventanaMs: 1000, maxSimultaneosPorVisitante: 2, maxSimultaneos: 3, maxVisitantes: 4 };

function montar(config = CONFIG) {
  let t = 0;
  const limitador = crearLimitador(config, () => t);
  return { limitador, avanzar: (ms: number) => (t += ms) };
}

describe('limitador', () => {
  it('permite hasta el máximo por ventana y luego rechaza con el tiempo de espera', () => {
    const { limitador, avanzar } = montar();
    for (let i = 0; i < 3; i++) {
      const a = limitador.admitir('a');
      expect(a.ok).toBe(true);
      if (a.ok) a.liberar();
      avanzar(100);
    }
    const r = limitador.admitir('a');
    expect(r).toMatchObject({ ok: false, motivo: 'demasiados-analisis' });
    if (!r.ok) expect(r.reintentarEnSeg).toBe(1);
  });

  it('vuelve a admitir cuando pasa la ventana', () => {
    const { limitador, avanzar } = montar();
    for (let i = 0; i < 3; i++) (limitador.admitir('a') as { liberar: () => void }).liberar();
    expect(limitador.admitir('a').ok).toBe(false);
    avanzar(1001);
    expect(limitador.admitir('a').ok).toBe(true);
  });

  it('limita los simultáneos por visitante y se libera al terminar', () => {
    const { limitador } = montar({ ...CONFIG, maxPorVentana: 99 });
    const a1 = limitador.admitir('a');
    const a2 = limitador.admitir('a');
    expect(limitador.admitir('a').ok).toBe(false);
    if (a1.ok) a1.liberar();
    expect(a2.ok).toBe(true);
    expect(limitador.admitir('a').ok).toBe(true);
  });

  it('liberar dos veces no cuenta dos veces', () => {
    const { limitador } = montar({ ...CONFIG, maxPorVentana: 99 });
    const a = limitador.admitir('a');
    const b = limitador.admitir('a');
    if (a.ok) {
      a.liberar();
      a.liberar();
    }
    expect(b.ok).toBe(true);
    expect(limitador.admitir('a').ok).toBe(true);
    expect(limitador.admitir('a').ok).toBe(false);
  });

  it('limita el total de simultáneos entre todos los visitantes', () => {
    const { limitador } = montar({ ...CONFIG, maxPorVentana: 99 });
    expect(limitador.admitir('a').ok).toBe(true);
    expect(limitador.admitir('b').ok).toBe(true);
    expect(limitador.admitir('c').ok).toBe(true);
    expect(limitador.admitir('d')).toMatchObject({ ok: false, motivo: 'servidor-ocupado' });
  });

  it('acota la memoria: con demasiados visitantes nuevos rechaza, y tras la ventana limpia', () => {
    const { limitador, avanzar } = montar({ ...CONFIG, maxSimultaneos: 99 });
    for (const v of ['a', 'b', 'c', 'd']) (limitador.admitir(v) as { liberar: () => void }).liberar();
    expect(limitador.admitir('e')).toMatchObject({ ok: false, motivo: 'servidor-ocupado' });
    avanzar(1001);
    expect(limitador.admitir('e').ok).toBe(true);
  });

  it('cada visitante lleva su propia cuenta', () => {
    const { limitador } = montar({ ...CONFIG, maxSimultaneos: 99 });
    for (let i = 0; i < 3; i++) (limitador.admitir('a') as { liberar: () => void }).liberar();
    expect(limitador.admitir('a').ok).toBe(false);
    expect(limitador.admitir('b').ok).toBe(true);
  });
});
