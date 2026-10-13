import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecera, Pie } from '@/componentes/cabecera';
import { InformeCompartido } from '@/componentes/informe-compartido';
import { esIdValido } from '@/lib/compartir/almacen';
import { obtenerCompartir } from '@/lib/compartir/instancia';

// El enlace es el único «permiso» para verlo: ni buscadores, ni cabecera Referer hacia otras webs.
export const metadata: Metadata = {
  title: 'Informe de seguridad web · ¿Es segura tu web?',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function PaginaInforme({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const compartir = obtenerCompartir();
  if (!compartir || !esIdValido(id)) notFound();
  let guardado;
  try {
    guardado = await compartir.almacen.leer(id, new Date());
  } catch (fallo) {
    console.error('[informe]', fallo instanceof Error ? fallo.message : 'fallo desconocido');
    throw new Error('almacen-no-disponible');
  }
  if (!guardado) notFound();
  return (
    <>
      <Cabecera />
      <main id="contenido">
        <InformeCompartido informe={guardado.informe} caduca={guardado.caduca} />
      </main>
      <Pie />
    </>
  );
}
