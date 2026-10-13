import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cabecera, Pie } from '@/componentes/cabecera';
import { InformeCompartido } from '@/componentes/informe-compartido';
import { esIdValido } from '@/lib/compartir/almacen';
import { obtenerCompartir } from '@/lib/compartir/instancia';

async function leer(id: string) {
  const compartir = obtenerCompartir();
  if (!compartir || !esIdValido(id)) return null;
  return compartir.almacen.leer(id, new Date());
}

// El enlace es el único «permiso» para verlo: ni buscadores, ni cabecera Referer hacia otras webs.
// La vista previa (título e imagen) sí se genera, para que el enlace se vea bien al reenviarlo.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const guardado = await leer(id).catch(() => null);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: 'no-referrer' };
  if (!guardado) return { ...base, title: 'Informe de seguridad web · ¿Es segura tu web?' };
  const { host } = guardado.informe.objetivo;
  const { letra } = guardado.informe.nota;
  const titulo = `${host} ha sacado un ${letra} en seguridad web`;
  const descripcion = 'Informe de seguridad web: qué está bien, qué falta y cómo arreglarlo. Revisión gratuita de Paco López.';
  return {
    ...base,
    title: `${titulo} · ¿Es segura tu web?`,
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, type: 'article', locale: 'es_ES' },
  };
}

export const dynamic = 'force-dynamic';

export default async function PaginaInforme({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let guardado;
  try {
    guardado = await leer(id);
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
