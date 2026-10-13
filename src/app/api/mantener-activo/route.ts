import 'server-only';
import { obtenerCompartir } from '@/lib/compartir/instancia';
import { mantenerActivo } from '@/lib/compartir/mantener-activo';

export const runtime = 'nodejs';
// Siempre se ejecuta: una respuesta cacheada no tocaría la base de datos.
export const dynamic = 'force-dynamic';

// Lo llama el cron de vercel.json, que envía «Authorization: Bearer CRON_SECRET».
export async function GET(peticion: Request): Promise<Response> {
  const almacen = obtenerCompartir()?.almacen ?? null;
  const respuesta = await mantenerActivo(peticion.headers.get('authorization'), {
    secreto: process.env.CRON_SECRET,
    consultar: almacen ? () => almacen.comprobar() : null,
  });
  // Un fallo queda en los registros de la función en Vercel.
  if (!respuesta.cuerpo.ok) console.error('[mantener-activo]', respuesta.estado, respuesta.cuerpo.error);
  return Response.json(respuesta.cuerpo, { status: respuesta.estado, headers: { 'Cache-Control': 'no-store' } });
}
