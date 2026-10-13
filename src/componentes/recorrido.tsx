import type { Hallazgo } from '@/lib/analisis/tipos';
import { calcularRecorrido } from '@/lib/recorrido';
import { PARADAS_TEXTO, textoDeEstadoParada } from '@/lib/textos/es';
import { IconoEstado } from './icono-estado';

/**
 * Las seis paradas de una visita, de la dirección a las cookies. La
 * «tubería» entre paradas se corta con trazo discontinuo cuando la parada
 * anterior tiene algo que arreglar. El estado se dice con texto además de
 * con color e icono.
 */
export function Recorrido({ hallazgos, arreglados }: { hallazgos: readonly Hallazgo[]; arreglados: ReadonlySet<string> }) {
  const paradas = calcularRecorrido(hallazgos, arreglados);
  return (
    <ol className="recorrido">
      {paradas.map((p) => {
        const texto = PARADAS_TEXTO[p.id];
        return (
          <li className="parada" key={p.id} data-estado={p.estado}>
            <span className="parada__nodo" aria-hidden="true">
              <IconoEstado resultado={p.estado === 'sin-datos' ? 'no-aplica' : p.estado} />
            </span>
            <div className="parada__texto">
              <p className="parada__nombre">{texto.nombre}</p>
              <p className="parada__detalle">{texto.detalle}</p>
              <p className="parada__estado">{textoDeEstadoParada(p.estado, p.pendientes)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
