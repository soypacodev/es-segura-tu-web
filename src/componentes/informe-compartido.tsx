'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Informe } from '@/lib/analisis/analizar';
import { InformeVisual } from './informe';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

/** Un informe compartido, tal como se guardó. Se puede jugar con «Lo arreglaría», pero nada se guarda. */
export function InformeCompartido({ informe, caduca }: { informe: Informe; caduca: string }) {
  const [arreglados, setArreglados] = useState<ReadonlySet<string>>(new Set());
  return (
    <div className="contenedor">
      <div className="compartido no-imprimir">
        <p>
          Este informe de <strong>{informe.objetivo.host}</strong> es una foto del {fecha(informe.analizadoEn)}: la web puede haber cambiado desde entonces. El
          enlace funciona hasta el {fecha(caduca)}.
        </p>
        <Link className="boton boton--enlace" href="/">
          Revisar mi web
        </Link>
      </div>
      <InformeVisual
        enfocar={false}
        informe={informe}
        arreglados={arreglados}
        alAlternar={(id) =>
          setArreglados((actual) => {
            const nuevo = new Set(actual);
            if (!nuevo.delete(id)) nuevo.add(id);
            return nuevo;
          })
        }
        alMarcarVarios={(ids) => setArreglados(new Set(ids))}
        alLimpiar={() => setArreglados(new Set())}
      />
    </div>
  );
}
