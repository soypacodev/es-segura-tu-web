import { ImageResponse } from 'next/og';
import { esIdValido } from '@/lib/compartir/almacen';
import { obtenerCompartir } from '@/lib/compartir/instancia';
import { TAMANO_VISTA_PREVIA, VistaPrevia, fuentesVistaPrevia } from '@/lib/compartir/vista-previa';

export const alt = 'Informe de seguridad web';
export const size = TAMANO_VISTA_PREVIA;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Imagen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const compartir = obtenerCompartir();
  const guardado = compartir && esIdValido(id) ? await compartir.almacen.leer(id, new Date()).catch(() => null) : null;
  // Sin informe (no existe o caducó) no se dibuja nada que delate nada: respuesta vacía de «no encontrado».
  if (!guardado) return new Response(null, { status: 404 });
  const { informe } = guardado;
  return new ImageResponse(<VistaPrevia host={informe.objetivo.host} letra={informe.nota.letra} puntos={informe.nota.puntos} />, {
    ...size,
    fonts: await fuentesVistaPrevia(),
  });
}
