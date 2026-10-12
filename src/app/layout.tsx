import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import './globals.css';

export const metadata: Metadata = {
  title: '¿Es segura tu web? Revisión gratuita de seguridad',
  description: 'Pega la dirección de tu web y recibe una nota de la A a la F, con lo que significa cada punto y cómo arreglarlo. Gratis y sin registro.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EEF2F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1020' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Las páginas se generan en cada petición: cada una lleva su propio nonce de CSP.
  await connection();
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
