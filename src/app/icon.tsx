import { ImageResponse } from 'next/og';
import { IconoMarca } from '@/lib/icono-marca';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icono() {
  return new ImageResponse(<IconoMarca tamano={512} />, size);
}
