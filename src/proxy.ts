import { NextResponse, type NextRequest } from 'next/server';
import { politicaSeguridad } from '@/lib/seguridad/csp';

// Pone a cada página su política de seguridad con un nonce nuevo.
export function proxy(peticion: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const https = peticion.nextUrl.protocol === 'https:' || peticion.headers.get('x-forwarded-proto') === 'https';
  const politica = politicaSeguridad(nonce, process.env.NODE_ENV === 'development', https);

  const cabeceras = new Headers(peticion.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('content-security-policy', politica);

  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set('content-security-policy', politica);
  return respuesta;
}

export const config = {
  matcher: [{ source: '/((?!api/|_next/static|_next/image|favicon.ico|icon|apple-icon|paco-lopez\\.jpg).*)' }],
};
