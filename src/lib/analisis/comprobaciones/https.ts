// Comprobaciones de HTTPS: que exista, que el certificado sea de fiar y
// esté vigente, que la versión de TLS sea moderna, que quien escribe
// «http://» acabe en «https://» y que HSTS lo recuerde.
//
// Todas son funciones puras: reciben la captura ya hecha (ver descarga.ts).

import { dominioRegistrable } from '../dns';
import type { CapturaSitio, CertificadoVisto, Hallazgo, Letra, RespuestaCapturada } from '../tipos';
import { valorCabecera } from './utiles';

const DIA_MS = 86_400_000;

/** 180 días: por debajo, HSTS protege poco tiempo. */
export const MAX_AGE_RECOMENDADO = 15_552_000;
/** 1 año: lo mínimo que exige la lista de precarga de los navegadores. */
export const MAX_AGE_PRECARGA = 31_536_000;

const h = (
  id: string,
  resultado: Hallazgo['resultado'],
  gravedad: Hallazgo['gravedad'],
  peso: number,
  extra: Pick<Hallazgo, 'techo' | 'datos'> = {},
): Hallazgo => ({ id, categoria: 'https', resultado, gravedad, peso, ...extra });

// ------------------------------------------------------------------
// HSTS
// ------------------------------------------------------------------

export interface Hsts {
  maxAge: number | null;
  subdominios: boolean;
  precarga: boolean;
}

export function analizarHsts(valor: string): Hsts {
  let maxAge: number | null = null;
  let subdominios = false;
  let precarga = false;
  for (const parte of valor.split(';')) {
    const [nombre, ...resto] = parte.trim().split('=');
    const clave = nombre.trim().toLowerCase();
    const dato = resto.join('=').trim().replace(/^"(.*)"$/, '$1');
    if (clave === 'max-age') {
      if (maxAge === null && /^\d+$/.test(dato)) maxAge = Number(dato);
    } else if (clave === 'includesubdomains') {
      subdominios = true;
    } else if (clave === 'preload') {
      precarga = true;
    }
  }
  return { maxAge, subdominios, precarga };
}

function comprobarHsts(respuesta: RespuestaCapturada): Hallazgo[] {
  // HSTS solo cuenta si la página final se sirvió por HTTPS.
  if (!respuesta.urlFinal.startsWith('https:')) return [];

  const valor = valorCabecera(respuesta, 'strict-transport-security');
  if (valor === undefined) {
    return [
      h('https.hsts', 'fallo', 'media', 12),
      h('https.hsts.subdominios', 'no-aplica', 'baja', 2),
      h('https.hsts.precarga', 'no-aplica', 'info', 0),
    ];
  }

  const hsts = analizarHsts(valor);
  let principal: Hallazgo;
  if (hsts.maxAge === null) {
    principal = h('https.hsts', 'fallo', 'media', 12, { datos: { motivo: 'sin-max-age' } });
  } else if (hsts.maxAge === 0) {
    principal = h('https.hsts', 'fallo', 'media', 12, { datos: { motivo: 'max-age-cero' } });
  } else if (hsts.maxAge < MAX_AGE_RECOMENDADO) {
    principal = h('https.hsts', 'mejorable', 'media', 12, { datos: { maxAge: hsts.maxAge } });
  } else {
    principal = h('https.hsts', 'correcto', 'media', 12, { datos: { maxAge: hsts.maxAge } });
  }

  const activo = principal.resultado !== 'fallo';
  const subdominios = !activo
    ? h('https.hsts.subdominios', 'no-aplica', 'baja', 2)
    : h('https.hsts.subdominios', hsts.subdominios ? 'correcto' : 'mejorable', 'baja', 2);

  let precarga: Hallazgo;
  if (!activo || !hsts.precarga) {
    precarga = h('https.hsts.precarga', 'no-aplica', 'info', 0);
  } else {
    const cumple = hsts.subdominios && (hsts.maxAge ?? 0) >= MAX_AGE_PRECARGA;
    precarga = h('https.hsts.precarga', cumple ? 'correcto' : 'mejorable', 'info', 0, {
      datos: { maxAge: hsts.maxAge, subdominios: hsts.subdominios },
    });
  }
  return [principal, subdominios, precarga];
}

// ------------------------------------------------------------------
// Certificado y versión de TLS
// ------------------------------------------------------------------

export type MotivoCertificado =
  | 'caducado'
  | 'autofirmado'
  | 'nombre-no-coincide'
  | 'cadena-incompleta'
  | 'aun-no-valido'
  | 'revocado'
  | 'otro';

export function clasificarErrorCertificado(codigo: string | null): MotivoCertificado {
  switch (codigo) {
    case 'CERT_HAS_EXPIRED':
      return 'caducado';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
      return 'autofirmado';
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return 'nombre-no-coincide';
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERT':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
      return 'cadena-incompleta';
    case 'CERT_NOT_YET_VALID':
      return 'aun-no-valido';
    case 'CERT_REVOKED':
      return 'revocado';
    default:
      return 'otro';
  }
}

/**
 * Un certificado caducado es un descuido (techo D). Una cadena incompleta se ve mal en programas, móviles y
 * servicios de correo, pero los navegadores de escritorio suelen completarla solos (techo C): además, Node no
 * distingue entre «falta un intermedio» y «la raíz no es de las que conoce». Cualquier otro fallo de confianza
 * impide usar la web (techo F).
 */
const techoDe = (motivo: MotivoCertificado): Letra => (motivo === 'caducado' ? 'D' : motivo === 'cadena-incompleta' ? 'C' : 'F');

const ORDEN_PROTOCOLOS = ['SSLv3', 'TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];

/**
 * Cuántos días antes de caducar se da el aviso. Con certificados de 90 días (los de Let's Encrypt de siempre),
 * 29 y 14 días; con los de vida más corta (45 días o menos, que se renuevan solos a mitad de vida) los umbrales
 * se reducen en proporción —15 % y 33 % de su duración—, para no dar por «a punto de caducar» a uno recién renovado.
 */
export function umbralesDeCaducidad(tls: { validoDesde: string | null; validoHasta: string | null } | undefined): { fallo: number; mejorable: number } {
  const desde = tls?.validoDesde ? Date.parse(tls.validoDesde) : NaN;
  const hasta = tls?.validoHasta ? Date.parse(tls.validoHasta) : NaN;
  const duracion = (hasta - desde) / DIA_MS;
  if (!Number.isFinite(duracion) || duracion <= 0) return { fallo: 14, mejorable: 29 };
  return { fallo: Math.min(14, Math.ceil(duracion * 0.15)), mejorable: Math.min(29, Math.ceil(duracion * 0.33)) };
}

function comprobarCertificados(certificados: CertificadoVisto[], ahora: Date): Hallazgo[] {
  if (certificados.length === 0) return [];
  const resultado: Hallazgo[] = [];

  // Confianza: manda el peor certificado de los que se vieron.
  const malos = certificados.filter((c) => !c.tls.autorizado);
  if (malos.length === 0) {
    resultado.push(h('https.certificado.valido', 'correcto', 'critica', 14));
  } else {
    const clasificados = malos.map((c) => ({ c, motivo: clasificarErrorCertificado(c.tls.errorAutorizacion) }));
    const peor = clasificados.find((x) => techoDe(x.motivo) === 'F') ?? clasificados[0];
    resultado.push(
      h('https.certificado.valido', 'fallo', 'critica', 14, {
        techo: techoDe(peor.motivo),
        datos: { host: peor.c.host, motivo: peor.motivo, codigo: peor.c.tls.errorAutorizacion },
      }),
    );
  }

  // Caducidad próxima: solo de los certificados que sí son de fiar.
  const vigentes = certificados.filter((c) => c.tls.autorizado && c.tls.validoHasta !== null);
  if (vigentes.length === 0) {
    resultado.push(h('https.certificado.caducidad', 'no-aplica', 'alta', 4));
  } else {
    const cuentas = vigentes.map((c) => ({
      host: c.host,
      dias: Math.floor((Date.parse(c.tls.validoHasta as string) - ahora.getTime()) / DIA_MS),
    }));
    const proximo = cuentas.reduce((a, b) => (b.dias < a.dias ? b : a));
    const { fallo, mejorable } = umbralesDeCaducidad(vigentes.find((c) => c.host === proximo.host)?.tls);
    const estado = proximo.dias <= fallo ? 'fallo' : proximo.dias <= mejorable ? 'mejorable' : 'correcto';
    resultado.push(h('https.certificado.caducidad', estado, 'alta', 4, { datos: { host: proximo.host, dias: proximo.dias } }));
  }

  // Versión de TLS: manda la más antigua que se negoció.
  const protocolos = certificados.filter((c) => c.tls.protocolo !== null);
  if (protocolos.length === 0) {
    resultado.push(h('https.tls.version', 'no-aplica', 'alta', 6));
  } else {
    const rango = (p: string | null) => {
      const i = ORDEN_PROTOCOLOS.indexOf(p ?? '');
      return i === -1 ? -1 : i;
    };
    const peor = protocolos.reduce((a, b) => (rango(b.tls.protocolo) < rango(a.tls.protocolo) ? b : a));
    const moderno = rango(peor.tls.protocolo) >= ORDEN_PROTOCOLOS.indexOf('TLSv1.2');
    resultado.push(
      h('https.tls.version', moderno ? 'correcto' : 'fallo', 'alta', 6, {
        datos: { host: peor.host, protocolo: peor.tls.protocolo },
      }),
    );
  }
  return resultado;
}

// ------------------------------------------------------------------
// De HTTP a HTTPS
// ------------------------------------------------------------------

function comprobarRedireccionHttp(captura: CapturaSitio): Hallazgo {
  const id = 'https.redireccion.http';
  if (!captura.http.ok) {
    // Sin respuesta en el puerto 80: quien escriba «http://» no llega.
    return h(id, 'mejorable', 'alta', 8, { datos: { motivo: captura.http.error.codigo } });
  }
  const r = captura.http.respuesta;

  if (r.estado >= 300 && r.estado < 400) {
    let destino: URL | null = null;
    try {
      const ubicacion = r.cabeceras['location']?.[0];
      destino = ubicacion ? new URL(ubicacion, `http://${captura.host}/`) : null;
    } catch {
      destino = null;
    }
    if (destino?.protocol === 'https:') {
      const permanente = r.estado === 301 || r.estado === 308;
      // A otro dominio: el visitante acaba bien, pero HSTS y el resto de protecciones no valen para el dominio de origen.
      const mismoDominio = (dominioRegistrable(destino.hostname) ?? destino.hostname) === (dominioRegistrable(captura.host) ?? captura.host);
      if (!mismoDominio) return h(id, 'mejorable', 'alta', 8, { datos: { estado: r.estado, otroDominio: destino.hostname } });
      return permanente
        ? h(id, 'correcto', 'alta', 8, { datos: { estado: r.estado } })
        : h(id, 'mejorable', 'alta', 8, { datos: { estado: r.estado, permanente: false } });
    }
    return h(id, 'fallo', 'alta', 8, { datos: { estado: r.estado, destino: destino ? 'http' : 'ninguno' } });
  }
  if (r.estado >= 200 && r.estado < 300) {
    return h(id, 'fallo', 'alta', 8, { datos: { estado: r.estado, sirveContenido: true } });
  }
  return h(id, 'mejorable', 'alta', 8, { datos: { estado: r.estado } });
}

// ------------------------------------------------------------------

export function comprobarHttps(captura: CapturaSitio, ahora: Date): Hallazgo[] {
  if (!captura.https.ok) {
    return [h('https.disponible', 'fallo', 'critica', 10, { techo: 'F', datos: { codigo: captura.https.error.codigo } })];
  }
  const r = captura.https.respuesta;
  const finalSeguro = r.urlFinal.startsWith('https:');

  return [
    h('https.disponible', 'correcto', 'critica', 10),
    finalSeguro
      ? h('https.final.seguro', 'correcto', 'critica', 6)
      : h('https.final.seguro', 'fallo', 'critica', 6, { techo: 'F', datos: { urlFinal: r.urlFinal } }),
    ...comprobarCertificados(r.certificados, ahora),
    comprobarRedireccionHttp(captura),
    ...comprobarHsts(r),
  ];
}
