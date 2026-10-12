// Política de seguridad de contenido (CSP) de la propia aplicación.
//
// Cada petición lleva un «nonce» distinto: solo los scripts y estilos que
// Next.js marca con él se ejecutan. Lo que se inyecte desde fuera, no.

export function politicaSeguridad(nonce: string, desarrollo: boolean, https: boolean): string {
  const directivas = [
    "default-src 'self'",
    // En desarrollo Next necesita eval para el recarga en caliente.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'${desarrollo ? " 'unsafe-inline'" : ''}`,
    // Los atributos style="..." (por ejemplo, las medidas del anillo) no se pueden proteger con nonce.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (https) directivas.push('upgrade-insecure-requests');
  return directivas.join('; ');
}
