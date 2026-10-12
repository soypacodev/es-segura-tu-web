'use client';

import { useCallback, useRef, useState } from 'react';
import type { Informe } from '@/lib/analisis/analizar';
import { crearLector } from '@/lib/leer-flujo';
import type { Evento } from '@/lib/protocolo';
import { simular } from '@/lib/simulacion';
import { ERRORES_ANALISIS, ERRORES_OBJETIVO, ERRORES_PETICION } from '@/lib/textos/es';
import type { MotivoObjetivo } from '@/lib/analisis/objetivo';
import { EscalaNotas } from './escala-notas';
import { Formulario } from './formulario';
import { InformeVisual } from './informe';
import { Progreso, type PasosAnalisis } from './progreso';

type Estado =
  | { fase: 'espera' }
  | { fase: 'analizando'; host: string | null; pasos: PasosAnalisis }
  | { fase: 'listo'; informe: Informe }
  | { fase: 'error'; titulo: string; texto?: string };

const PASOS_INICIALES: PasosAnalisis = { https: 'curso', http: 'curso', evaluar: 'espera' };
/** Para que el recorrido de la escala se vea aunque el análisis sea instantáneo. */
const DURACION_MINIMA_MS = 1600;

const esperar = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function errorDeRespuesta(cuerpo: unknown): { titulo: string; texto?: string } {
  const error = (cuerpo as { error?: { codigo?: string; motivo?: string } } | null)?.error;
  if (error?.codigo === 'objetivo-invalido') {
    return { titulo: ERRORES_OBJETIVO[error.motivo as MotivoObjetivo] ?? ERRORES_OBJETIVO['host-invalido'] };
  }
  if (error?.codigo && error.codigo in ERRORES_PETICION) return { titulo: ERRORES_PETICION[error.codigo] };
  return { titulo: 'Algo ha fallado', texto: 'Inténtalo de nuevo en unos segundos.' };
}

export function Analizador() {
  const [estado, setEstado] = useState<Estado>({ fase: 'espera' });
  const [arreglados, setArreglados] = useState<ReadonlySet<string>>(new Set());
  const cancelar = useRef<AbortController | null>(null);

  const analizar = useCallback(async (direccion: string) => {
    cancelar.current?.abort();
    const control = new AbortController();
    cancelar.current = control;
    setArreglados(new Set());
    setEstado({ fase: 'analizando', host: null, pasos: PASOS_INICIALES });
    const inicio = Date.now();

    const alEvento = (e: Evento) => {
      if (e.t === 'inicio') setEstado((s) => (s.fase === 'analizando' ? { ...s, host: e.host } : s));
      if (e.t === 'captura') {
        setEstado((s) => {
          if (s.fase !== 'analizando') return s;
          const pasos = { ...s.pasos, [e.via]: e.ok ? 'hecho' : 'fallo' } as PasosAnalisis;
          if (pasos.https !== 'curso' && pasos.http !== 'curso') pasos.evaluar = 'curso';
          return { ...s, pasos };
        });
      }
    };

    try {
      const respuesta = await fetch('/api/analizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direccion }),
        signal: control.signal,
        cache: 'no-store',
      });

      if (!respuesta.ok || !respuesta.body) {
        const cuerpo: unknown = await respuesta.json().catch(() => null);
        setEstado({ fase: 'error', ...errorDeRespuesta(cuerpo) });
        return;
      }

      const lector = crearLector();
      const decodificador = new TextDecoder();
      const eventos: Evento[] = [];
      const flujo = respuesta.body.getReader();
      for (;;) {
        const { done, value } = await flujo.read();
        if (done) break;
        for (const e of lector.añadir(decodificador.decode(value, { stream: true }))) {
          alEvento(e);
          eventos.push(e);
        }
      }
      for (const e of lector.terminar()) eventos.push(e);

      const final = eventos.find((e) => e.t === 'informe' || e.t === 'error');
      if (!final) {
        setEstado({ fase: 'error', titulo: 'La respuesta llegó incompleta', texto: 'Inténtalo de nuevo.' });
        return;
      }
      await esperar(Math.max(0, DURACION_MINIMA_MS - (Date.now() - inicio)));
      if (control.signal.aborted) return;

      if (final.t === 'informe') setEstado({ fase: 'listo', informe: final.informe });
      else {
        const texto = ERRORES_ANALISIS[final.error.codigo];
        setEstado({ fase: 'error', ...(texto ?? { titulo: 'No hemos podido revisar esa web', texto: 'Inténtalo de nuevo más tarde.' }) });
      }
    } catch (fallo) {
      if (control.signal.aborted) return;
      void fallo;
      setEstado({ fase: 'error', titulo: 'No hemos podido conectar', texto: 'Comprueba tu conexión e inténtalo de nuevo.' });
    }
  }, []);

  const alternar = useCallback((id: string) => {
    setArreglados((actual) => {
      const nuevo = new Set(actual);
      if (!nuevo.delete(id)) nuevo.add(id);
      return nuevo;
    });
  }, []);

  const informe = estado.fase === 'listo' ? estado.informe : null;
  const simulada = informe && arreglados.size > 0 ? simular(informe.hallazgos, arreglados).letra : null;
  const analizando = estado.fase === 'analizando';

  return (
    <div className="contenedor">
      <div className={`portada${informe ? ' portada--con-informe' : ''}`}>
        <div>
          <h1 className="portada__titulo">¿Es segura tu web?</h1>
          <p className="portada__texto">Pega la dirección y te ponemos nota de la A a la F, con lo que significa y cómo arreglarlo.</p>
          <Formulario
            ocupado={analizando}
            error={estado.fase === 'error' ? { titulo: estado.titulo, texto: estado.texto } : null}
            alEnviar={analizar}
          />
          {estado.fase === 'analizando' && <Progreso pasos={estado.pasos} />}
        </div>
        <EscalaNotas actual={informe?.nota.letra ?? null} simulada={simulada} escaneando={analizando} />
      </div>

      <div className="solo-lectores" aria-live="polite">
        {analizando && 'Revisando tu web…'}
        {informe && `Listo: tu web ha sacado un ${informe.nota.letra}.`}
      </div>

      {informe && (
        <InformeVisual
          informe={informe}
          arreglados={arreglados}
          alAlternar={alternar}
          alMarcarVarios={(ids) => setArreglados(new Set(ids))}
          alLimpiar={() => setArreglados(new Set())}
        />
      )}
    </div>
  );
}
