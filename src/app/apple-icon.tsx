import { ImageResponse } from 'next/og';
import { IconoMarca } from '@/lib/icono-marca';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function IconoApple() {
  return new ImageResponse(<IconoMarca tamano={180} redondeo={0} />, size);
}
