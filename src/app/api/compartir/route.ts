import 'server-only';
import { z } from 'zod';
import { crearLimitador } from '@/lib/limite';
import { obtenerCompartir } from '@/lib/compartir/instancia';
import { guardarInformeCompartido } from '@/lib/compartir/servicio';
import type { ErrorCompartir } from '@/lib/protocolo';
import { identificarVisitante, leerCuerpoLimitado, origenPermitido } from '@/lib/seguridad/peticion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Un informe con todos sus hallazgos ocupa unos 20 KB; el tope deja margen sin dejar guardar basura grande.
const MAX_BYTES_PETICION = 128 * 1024;
const Peticion = z.object({ informe: z.record(z.string(), z.unknown()), firma: z.string().max(100) }).strict();

const limitador = crearLimitador({ maxPorVentana: 10, ventanaMs: 60 * 60 * 1000, maxSimultaneosPorVisitante: 3, maxSimultaneos: 30, maxVisitantes: 5000 });

const SIN_CACHE = { 'Cache-Control': 'no-store' };

function rechazo(estado: number, error: ErrorCompartir, extra: Record<string, string> = {}) {
  return Response.json({ error }, { status: estado, headers: { ...SIN_CACHE, ...extra } });
}

export async function POST(peticion: Request) {
  if (!origenPermitido(peticion.headers.get('origin'), peticion.headers.get('host'))) return rechazo(403, { codigo: 'origen' });
  if (!peticion.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return rechazo(415, { codigo: 'formato' });

  const compartir = obtenerCompartir();
  if (!compartir) return rechazo(404, { codigo: 'no-disponible' });

  const largo = Number(peticion.headers.get('content-length'));
  if (Number.isFinite(largo) && largo > MAX_BYTES_PETICION) return rechazo(413, { codigo: 'demasiado-grande' });

  let texto: string | null;
  try {
    texto = await leerCuerpoLimitado(peticion.body, MAX_BYTES_PETICION);
  } catch {
    return rechazo(400, { codigo: 'formato' });
  }
  if (texto === null) return rechazo(413, { codigo: 'demasiado-grande' });

  let datos: z.infer<typeof Peticion>;
  try {
    datos = Peticion.parse(JSON.parse(texto));
  } catch {
    return rechazo(400, { codigo: 'formato' });
  }

  const admision = limitador.admitir(identificarVisitante(peticion.headers));
  if (!admision.ok) {
    return rechazo(
      admision.motivo === 'servidor-ocupado' ? 503 : 429,
      { codigo: 'demasiados-enlaces', reintentarEnSeg: admision.reintentarEnSeg },
      {
        'Retry-After': String(admision.reintentarEnSeg),
      },
    );
  }
  try {
    const resultado = await guardarInformeCompartido(datos, { almacen: compartir.almacen, secreto: compartir.config.secreto, dias: compartir.config.dias });
    if (!resultado.ok) {
      const estado = { firma: 400, 'no-compartible': 422, almacen: 502 }[resultado.motivo];
      return rechazo(estado, { codigo: resultado.motivo });
    }
    return Response.json({ id: resultado.id, caduca: resultado.caduca }, { status: 201, headers: SIN_CACHE });
  } finally {
    admision.liberar();
  }
}
