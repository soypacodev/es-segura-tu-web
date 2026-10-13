import type { Metadata } from 'next';
import { PaginaLegal } from '@/componentes/pagina-legal';
import { PRIVACIDAD } from '@/config/legal';

export const metadata: Metadata = { title: `${PRIVACIDAD.titulo} · ¿Es segura tu web?`, description: PRIVACIDAD.descripcion, robots: { index: false, follow: true } };

export default function Privacidad() {
  return <PaginaLegal documento={PRIVACIDAD} />;
}
