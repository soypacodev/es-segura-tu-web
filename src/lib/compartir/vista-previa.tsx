import type { Letra } from '@/lib/analisis/tipos';
import { VEREDICTO } from '@/lib/textos/es';

// Mismos colores que la escala de notas de la interfaz (la imagen no puede usar variables CSS).
const COLOR: Record<Letra, string> = { 'A+': '#2fbf8f', A: '#4cc47e', B: '#a8d14a', C: '#f0bd1d', D: '#f28a3f', F: '#f2594d' };

export const TAMANO_VISTA_PREVIA = { width: 1200, height: 630 } as const;

/** Imagen que ven quienes reciben el enlace en WhatsApp, Slack, LinkedIn…: la nota, la web y quién hizo la herramienta. */
export function VistaPrevia({ host, letra, puntos }: { host: string; letra: Letra; puntos: number }) {
  const largo = host.length > 38;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#101a33', color: '#ffffff', padding: 64, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: 380, marginRight: 64 }}>
        <div style={{ display: 'flex', fontSize: letra.length > 1 ? 200 : 250, fontWeight: 800, color: COLOR[letra], lineHeight: 1 }}>{letra}</div>
        <div style={{ display: 'flex', fontSize: 34, color: '#b8c2dc', marginTop: 12 }}>{puntos} de 100</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
        <div style={{ display: 'flex', fontSize: 30, color: '#b8c2dc' }}>Informe de seguridad web</div>
        <div style={{ display: 'flex', fontSize: host.length > 60 ? 36 : largo ? 46 : 64, fontWeight: 800, marginTop: 12, wordBreak: 'break-all' }}>{host}</div>
        <div style={{ display: 'flex', fontSize: 38, marginTop: 24 }}>{VEREDICTO[letra].titulo}</div>
        <div style={{ display: 'flex', fontSize: 26, color: '#b8c2dc', marginTop: 56 }}>¿Es segura tu web? · por Paco López</div>
      </div>
    </div>
  );
}
