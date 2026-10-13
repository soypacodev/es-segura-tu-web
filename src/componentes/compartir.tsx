'use client';

import { useId, useState } from 'react';
import type { Informe } from '@/lib/analisis/analizar';
import type { OfertaCompartir } from '@/lib/protocolo';
import { ERRORES_COMPARTIR } from '@/lib/textos/es';

type Estado = { fase: 'inicio' } | { fase: 'guardando' } | { fase: 'listo'; url: string } | { fase: 'error'; texto: string };

const fechaCorta = (dias: number) => (dias === 1 ? '1 día' : `${dias} días`);

/** «Crear enlace para compartir»: guarda el informe y da una dirección que se puede reenviar. */
export function BotonCompartir({ informe, oferta }: { informe: Informe; oferta: OfertaCompartir }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' });
  const [copiado, setCopiado] = useState(false);
  const idAviso = useId();

  async function crear() {
    setEstado({ fase: 'guardando' });
    try {
      const respuesta = await fetch('/api/compartir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informe, firma: oferta.firma }),
        cache: 'no-store',
      });
      const cuerpo = (await respuesta.json().catch(() => null)) as { id?: string; error?: { codigo?: string } } | null;
      if (respuesta.ok && typeof cuerpo?.id === 'string') {
        setEstado({ fase: 'listo', url: `${window.location.origin}/informe/${cuerpo.id}` });
        return;
      }
      const codigo = cuerpo?.error?.codigo;
      setEstado({
        fase: 'error',
        texto:
          codigo !== undefined && Object.hasOwn(ERRORES_COMPARTIR, codigo) ? ERRORES_COMPARTIR[codigo] : 'No hemos podido crear el enlace. Inténtalo de nuevo.',
      });
    } catch {
      setEstado({ fase: 'error', texto: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' });
    }
  }

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: la dirección sigue en el campo para seleccionarla.
    }
  }

  if (estado.fase === 'listo') {
    const url = estado.url;
    return (
      <div className="compartir" role="group" aria-label="Enlace para compartir">
        <label className="compartir__etiqueta" htmlFor={`${idAviso}-url`}>
          Enlace al informe
        </label>
        <div className="compartir__fila">
          <input id={`${idAviso}-url`} className="compartir__campo" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="boton boton--claro" onClick={() => copiar(url)}>
            {copiado ? 'Copiado' : 'Copiar enlace'}
          </button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              className="boton boton--claro"
              onClick={() => navigator.share({ title: `Informe de seguridad de ${informe.objetivo.host}`, url }).catch(() => undefined)}
            >
              Compartir…
            </button>
          )}
        </div>
        <p className="compartir__nota">Quien tenga este enlace puede ver el informe durante {fechaCorta(oferta.dias)}. Después se borra.</p>
      </div>
    );
  }

  return (
    <div className="compartir">
      <button type="button" className="boton boton--claro" onClick={crear} disabled={estado.fase === 'guardando'} aria-describedby={idAviso}>
        {estado.fase === 'guardando' ? 'Creando enlace…' : 'Crear enlace para compartir'}
      </button>
      <p id={idAviso} className="compartir__nota">
        Se guarda el informe {fechaCorta(oferta.dias)} y cualquiera con el enlace podrá verlo. No incluye el contenido de tu web.
      </p>
      {estado.fase === 'error' && (
        <p className="compartir__error" role="alert">
          {estado.texto}
        </p>
      )}
    </div>
  );
}
