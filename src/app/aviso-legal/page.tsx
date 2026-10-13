import type { Metadata } from 'next';
import { PaginaLegal } from '@/componentes/pagina-legal';
import { AVISO_LEGAL } from '@/config/legal';

export const metadata: Metadata = { title: `${AVISO_LEGAL.titulo} · ¿Es segura tu web?`, description: AVISO_LEGAL.descripcion, robots: { index: false, follow: true } };

export default function AvisoLegal() {
  return <PaginaLegal documento={AVISO_LEGAL} />;
}
