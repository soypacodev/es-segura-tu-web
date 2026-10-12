// Tipos compartidos del análisis.
//
// Los hallazgos llevan un identificador estable y unos datos sueltos, no
// frases: los textos (en español y en inglés) se redactan en la interfaz.
// Así el informe se puede guardar, comparar y traducir sin tocar el motor.

export type Letra = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/** Lo grave que es el problema si falla. */
export type Gravedad = 'critica' | 'alta' | 'media' | 'baja' | 'info';

export type Resultado = 'correcto' | 'mejorable' | 'fallo' | 'no-aplica';

export type Categoria = 'https' | 'cabeceras' | 'cookies' | 'tecnologias' | 'privacidad' | 'dns' | 'contenido' | 'rendimiento';

export type DatoSimple = string | number | boolean | null;
export type Datos = Record<string, DatoSimple | readonly string[]>;

export interface Hallazgo {
  /** Identificador estable, por ejemplo «https.hsts». */
  id: string;
  categoria: Categoria;
  resultado: Resultado;
  gravedad: Gravedad;
  /** Cuánto cuenta en la nota. 0 = solo informativo. */
  peso: number;
  /** Nota máxima posible mientras este hallazgo sea un «fallo». */
  techo?: Letra;
  datos?: Datos;
}

/** Algo que el lector debe saber sobre el propio análisis (por ejemplo, que se recortó una descarga). */
export interface Aviso {
  id: string;
  datos?: Datos;
}

// ------------------------------------------------------------------
// Lo que se captura de la web, antes de evaluarlo
// ------------------------------------------------------------------

export interface InfoTls {
  protocolo: string | null;
  autorizado: boolean;
  /** Código de OpenSSL o de Node, por ejemplo «CERT_HAS_EXPIRED». */
  errorAutorizacion: string | null;
  validoDesde: string | null;
  validoHasta: string | null;
  emisor: string | null;
  sujeto: string | null;
  alternativos: string[];
}

export interface CertificadoVisto {
  host: string;
  tls: InfoTls;
}

export interface SaltoRedireccion {
  url: string;
  estado: number;
  ubicacion: string | null;
  setCookie: string[];
}

export type EstadoCuerpo = 'completo' | 'recortado' | 'interrumpido' | 'omitido';

export interface RespuestaCapturada {
  urlFinal: string;
  /** Saltos seguidos hasta llegar a la respuesta final (que no se incluye). */
  redirecciones: SaltoRedireccion[];
  estado: number;
  /** Nombres en minúsculas; cada nombre puede repetirse (por ejemplo, Set-Cookie). */
  cabeceras: Record<string, string[]>;
  /** Un certificado por cada servidor HTTPS distinto por el que se pasó. */
  certificados: CertificadoVisto[];
  /** Solo HTML con respuesta 2xx; el informe nunca lo incluye. */
  cuerpo: string | null;
  estadoCuerpo: EstadoCuerpo;
  bytesLeidos: number;
  duracionMs: number;
}

export type CodigoError =
  | 'url-no-valida'
  | 'protocolo'
  | 'puerto-no-permitido'
  | 'ip-no-publica'
  | 'dns'
  | 'conexion'
  | 'tiempo-agotado'
  | 'redirecciones'
  | 'respuesta-invalida';

export interface ErrorCaptura {
  codigo: CodigoError;
  mensaje: string;
}

export type ResultadoCaptura = { ok: true; respuesta: RespuestaCapturada } | { ok: false; error: ErrorCaptura };

/** Resultado de una consulta DNS: con registros, sin registros, o sin saber (tiempo agotado, servidor caído…). */
export type ConsultaDns<T> = { estado: 'ok'; valores: T[] } | { estado: 'vacio' } | { estado: 'error' };

/** Lo que dice el DNS del dominio registrable de la web (no del subdominio). */
export interface CapturaDns {
  dominio: string;
  /** Registros TXT del dominio, con los trozos de cada uno ya unidos. */
  txt: ConsultaDns<string>;
  /** Registros TXT de _dmarc.<dominio>. */
  dmarc: ConsultaDns<string>;
  /** Servidores de correo (solo el nombre). */
  mx: ConsultaDns<string>;
  /** Registros CAA vigentes para el nombre de la web. */
  caa: ConsultaDns<string>;
}

export interface CapturaSitio {
  host: string;
  /** Entrada por HTTPS, siguiendo redirecciones. */
  https: ResultadoCaptura;
  /** Entrada por HTTP sin seguir redirecciones: sirve para ver a dónde manda. */
  http: ResultadoCaptura;
  /** Ausente si no se pidió el DNS o la dirección no tiene dominio (una IP, por ejemplo). */
  dns?: CapturaDns;
}
