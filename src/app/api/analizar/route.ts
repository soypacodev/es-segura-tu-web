import 'server-only';
import { z } from 'zod';
import { analizarSitio } from '@/lib/analisis/analizar';
import { descargadorSeguro } from '@/lib/analisis/descarga';
import { resolvedorReal } from '@/lib/analisis/dns';
import { normalizarObjetivo } from '@/lib/analisis/objetivo';
import { firmarInforme } from '@/lib/compartir/firma';
import { obtenerCompartir } from '@/lib/compartir/instancia';
import { esCompartible } from '@/lib/compartir/servicio';
import { crearLimitador } from '@/lib/limite';
import type { ErrorPeticion, Evento } from '@/lib/protocolo';
import { identificarVisitante, leerCuerpoLimitado, origenPermitido } from '@/lib/seguridad/peticion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES_PETICION = 4096;
// El largo de la dirección lo valida normalizarObjetivo (que da el motivo «demasiado-largo»); aquí el tope es el del cuerpo.
// «permiso»: la persona declara que es responsable de la web o que tiene permiso para revisarla a fondo (archivos expuestos).
const Peticion = z.object({ direccion: z.string(), permiso: z.boolean().optional() }).strict();

const limitador = crearLimitador();

const SIN_CACHE = { 'Cache-Control': 'no-store' };

function rechazo(estado: number, error: ErrorPeticion, extra: Record<string, string> = {}) {
  return Response.json({ error }, { status: estado, headers: { ...SIN_CACHE, ...extra } });
}

const resolvedor = resolvedorReal();

export async function POST(peticion: Request) {
  if (!origenPermitido(peticion.headers.get('origin'), peticion.headers.get('host'))) return rechazo(403, { codigo: 'origen' });
  if (!peticion.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return rechazo(415, { codigo: 'formato' });

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

  // Una dirección mal escrita no gasta cupo ni se intenta descargar.
  const objetivo = normalizarObjetivo(datos.direccion);
  if (!objetivo.ok) {
    return Response.json({ error: { codigo: 'objetivo-invalido', motivo: objetivo.motivo } }, { status: 422, headers: SIN_CACHE });
  }

  const admision = limitador.admitir(identificarVisitante(peticion.headers));
  if (!admision.ok) {
    return rechazo(
      admision.motivo === 'servidor-ocupado' ? 503 : 429,
      { codigo: admision.motivo, reintentarEnSeg: admision.reintentarEnSeg },
      {
        'Retry-After': String(admision.reintentarEnSeg),
      },
    );
  }

  const codificador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(controlador) {
      const enviar = (evento: Evento) => {
        try {
          controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`));
        } catch {
          // La persona cerró la página: ya nadie escucha.
        }
      };
      try {
        enviar({ t: 'inicio', host: objetivo.host });
        const resultado = await analizarSitio(datos.direccion, {
          descargador: descargadorSeguro,
          resolvedor,
          sondearArchivos: datos.permiso === true,
          alProgreso: (e) => enviar({ t: 'captura', via: e.via, ok: e.ok }),
        });
        if (!resultado.ok) enviar({ t: 'error', error: resultado.error });
        else {
          // La firma habilita «Crear enlace para compartir»: solo la lleva un informe que este servidor ha producido y que se puede publicar.
          const compartir = obtenerCompartir();
          const oferta =
            compartir && esCompartible(resultado.informe)
              ? { compartir: { firma: firmarInforme(resultado.informe, compartir.config.secreto, Date.now()), dias: compartir.config.dias } }
              : {};
          enviar({ t: 'informe', informe: resultado.informe, ...oferta });
        }
      } catch (fallo) {
        console.error('[analizar]', fallo instanceof Error ? fallo.message : 'fallo desconocido');
        enviar({ t: 'error', error: { codigo: 'sin-respuesta', detalle: 'fallo-interno' } });
      } finally {
        admision.liberar();
        try {
          controlador.close();
        } catch {
          // Ya estaba cerrado.
        }
      }
    },
  });

  return new Response(flujo, {
    headers: { ...SIN_CACHE, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' },
  });
}
