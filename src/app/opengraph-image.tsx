import { ImageResponse } from 'next/og';
import { TAMANO_VISTA_PREVIA, VistaPreviaPortada, fotoVistaPrevia, fuentesVistaPrevia } from '@/lib/compartir/vista-previa';

export const alt = '¿Es segura tu web? Revisión gratuita de seguridad con nota de la A+ a la F';
export const size = TAMANO_VISTA_PREVIA;
export const contentType = 'image/png';

export default async function Imagen() {
  return new ImageResponse(<VistaPreviaPortada foto={await fotoVistaPrevia()} />, { ...size, fonts: await fuentesVistaPrevia() });
}
