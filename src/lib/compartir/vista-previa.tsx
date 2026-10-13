import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Letra } from '@/lib/analisis/tipos';
import { LETRAS_DE_MEJOR_A_PEOR } from '@/lib/notas';

// Mismos colores que la escala de notas de la interfaz (la imagen no puede usar variables CSS).
const COLOR: Record<Letra, string> = { 'A+': '#2fbf8f', A: '#4cc47e', B: '#a8d14a', C: '#f0bd1d', D: '#f28a3f', F: '#f2594d' };
const FONDO = '#101a33';
const SUAVE = '#b8c2dc';

export const TAMANO_VISTA_PREVIA = { width: 1200, height: 630 } as const;

/** Las mismas fuentes que la web (licencia OFL, en assets/fuentes). */
export async function fuentesVistaPrevia() {
  const leer = (archivo: string) => readFile(join(process.cwd(), 'assets/fuentes', archivo));
  const [titulo, texto, textoNegrita] = await Promise.all([
    leer('bricolage-grotesque-latin-800-normal.woff'),
    leer('atkinson-hyperlegible-next-latin-400-normal.woff'),
    leer('atkinson-hyperlegible-next-latin-700-normal.woff'),
  ]);
  return [
    { name: 'Bricolage', data: titulo, weight: 800 as const, style: 'normal' as const },
    { name: 'Atkinson', data: texto, weight: 400 as const, style: 'normal' as const },
    { name: 'Atkinson', data: textoNegrita, weight: 700 as const, style: 'normal' as const },
  ];
}

/** Una barra de la escala con punta de flecha, como en la portada. */
function Barra({ letra, ancho, alto, activa }: { letra: Letra; ancho: number; alto: number; activa: boolean }) {
  const color = activa ? COLOR[letra] : `${COLOR[letra]}55`;
  const punta = alto / 2;
  return (
    <div style={{ display: 'flex', position: 'relative', width: ancho + punta, height: alto }}>
      <svg width={ancho + punta} height={alto} viewBox={`0 0 ${ancho + punta} ${alto}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        <polygon points={`0,0 ${ancho},0 ${ancho + punta},${alto / 2} ${ancho},${alto} 0,${alto}`} fill={color} />
      </svg>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: alto,
          paddingLeft: alto * 0.35,
          color: activa ? FONDO : '#ffffff',
          fontFamily: 'Bricolage',
          fontSize: alto * 0.55,
        }}
      >
        {letra}
      </div>
    </div>
  );
}

/**
 * Imagen que ven quienes reciben el enlace (WhatsApp, Slack, LinkedIn…).
 * WhatsApp recorta un cuadrado del centro: la nota y la web van ahí; la escala y la firma, a los lados.
 */
export function VistaPrevia({ host, letra, puntos }: { host: string; letra: Letra; puntos: number }) {
  const tamanoHost = host.length > 44 ? 30 : host.length > 30 ? 38 : host.length > 22 ? 46 : 56;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', background: FONDO, color: '#ffffff', fontFamily: 'Atkinson' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, width: 270, paddingLeft: 48 }}>
        {LETRAS_DE_MEJOR_A_PEOR.map((l, i) => (
          <Barra key={l} letra={l} ancho={70 + i * 22} alto={46} activa={l === letra} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 660, padding: '0 30px' }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: SUAVE }}>Informe de seguridad web</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 300,
            height: 230,
            marginTop: 22,
            borderRadius: 28,
            background: COLOR[letra],
            color: FONDO,
            fontFamily: 'Bricolage',
            fontSize: letra.length > 1 ? 170 : 200,
            lineHeight: 1,
          }}
        >
          {letra}
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 32, fontWeight: 700 }}>{puntos} de 100</div>
        <div
          style={{
            display: 'flex',
            marginTop: 10,
            fontFamily: 'Bricolage',
            fontSize: tamanoHost,
            textAlign: 'center',
            justifyContent: 'center',
            wordBreak: 'break-all',
            maxWidth: 600,
          }}
        >
          {host}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          width: 270,
          padding: '0 48px 56px 0',
          textAlign: 'right',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontFamily: 'Bricolage', fontSize: 32, lineHeight: 1.1 }}>
          <span>¿Es segura</span>
          <span>tu web?</span>
        </div>
        <div style={{ display: 'flex', marginTop: 8, fontSize: 22, color: SUAVE }}>por Paco López</div>
      </div>
    </div>
  );
}
