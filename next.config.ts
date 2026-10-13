import type { NextConfig } from 'next';

// Cabeceras que van igual en todas las respuestas. La política de contenido
// (CSP) lleva un valor distinto en cada petición y se pone en src/proxy.ts.
const CABECERAS_SEGURIDAD = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Next 16.4 genera un AGENTS.md al arrancar en desarrollo; el repositorio no lo necesita.
  agentRules: false,
  async headers() {
    return [{ source: '/:path*', headers: CABECERAS_SEGURIDAD }];
  },
};

export default config;
