import Link from 'next/link';
import { Cabecera, Pie } from '@/componentes/cabecera';
import type { DocumentoLegal } from '@/config/legal';

export function PaginaLegal({ documento }: { documento: DocumentoLegal }) {
  return (
    <>
      <Cabecera />
      <main id="contenido" className="legal">
        <p>
          <Link href="/">Volver al inicio</Link>
        </p>
        <h1>{documento.titulo}</h1>
        <p className="legal__fecha">Última revisión: {documento.fecha}</p>
        {documento.secciones.map((s) => (
          <section key={s.titulo}>
            <h2>{s.titulo}</h2>
            {s.parrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        ))}
      </main>
      <Pie />
    </>
  );
}
