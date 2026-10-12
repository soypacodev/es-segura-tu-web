// Textos en español de cada hallazgo, aviso y error.
//
// El motor solo devuelve identificadores y datos; aquí se convierten en
// frases para alguien que no es técnico: qué se ha mirado, qué significa y
// cómo se arregla. Hay una prueba que obliga a tener texto para cada
// identificador que el motor pueda emitir.

import type { EstadoParada, IdParada } from '../recorrido';
import type { MotivoObjetivo } from '../analisis/objetivo';
import type { Categoria, Datos, Gravedad, Hallazgo, Letra } from '../analisis/tipos';

type Texto = string | ((datos: Datos) => string);

export interface TextoHallazgo {
  /** Lo que se mira, como etiqueta corta. */
  titulo: string;
  /** Qué significa que esté bien. */
  correcto: Texto;
  /** Qué significa que sea mejorable. */
  mejorable?: Texto;
  /** Qué significa que falle (y por qué importa). */
  fallo?: Texto;
  /** Qué se ha encontrado cuando no se puede valorar. */
  noAplica?: Texto;
  /** Cómo se arregla (para «mejorable» y «fallo»). */
  arreglo?: Texto;
  /** Líneas que se pueden copiar tal cual en la configuración. */
  codigo?: Texto;
}

const num = (d: Datos, k: string): number | null => (typeof d[k] === 'number' ? (d[k] as number) : null);
const txt = (d: Datos, k: string): string | null => (typeof d[k] === 'string' ? (d[k] as string) : null);

/** «Falta la marca en: sesion, preferencias y 2 más», a partir de los datos del hallazgo. */
function listaCookies(d: Datos): string {
  const nombres = Array.isArray(d['sin']) ? (d['sin'] as string[]) : [];
  const mas = num(d, 'mas') ?? 0;
  if (nombres.length === 0) return 'Alguna cookie';
  const base = nombres.map((n) => `«${n}»`);
  const texto = base.length === 1 ? base[0] : `${base.slice(0, -1).join(', ')} y ${base[base.length - 1]}`;
  const extra = mas > 0 ? ` y ${mas} más` : '';
  return nombres.length === 1 && mas === 0 ? `La cookie ${texto}` : `Las cookies ${texto}${extra}`;
}

/** «Google Analytics, Hotjar y 2 más», a partir de los datos del hallazgo. */
function listaNombres(d: Datos): string {
  const nombres = Array.isArray(d['nombres']) ? (d['nombres'] as string[]) : [];
  const mas = num(d, 'mas') ?? 0;
  if (nombres.length === 0) return 'servicios de terceros';
  const texto = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  return mas > 0 ? `${nombres.join(', ')} y ${mas} más` : texto;
}

const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);
const segundosADias = (s: number) => Math.round(s / 86_400);

const MOTIVOS_CERTIFICADO: Record<string, string> = {
  caducado: 'El certificado de seguridad ha caducado. Los navegadores muestran una pantalla roja de aviso y la mayoría de la gente se marcha.',
  autofirmado: 'El certificado lo ha firmado la propia web, no una entidad de confianza. Los navegadores muestran una pantalla roja de aviso.',
  'nombre-no-coincide': 'El certificado está emitido para otra dirección distinta de esta. Los navegadores avisan de que la conexión no es privada.',
  'cadena-incompleta': 'Al certificado le falta una pieza intermedia en el servidor. Algunos navegadores y móviles lo rechazan aunque otros lo acepten.',
  'aun-no-valido': 'El certificado todavía no ha entrado en vigor. Suele deberse a un reloj mal configurado en el servidor.',
  revocado: 'El certificado fue anulado por la entidad que lo emitió, así que los navegadores no lo aceptan.',
  otro: 'El navegador no se fía del certificado de seguridad y avisa a los visitantes de que la conexión no es privada.',
};

export const TEXTOS: Record<string, TextoHallazgo> = {
  'https.disponible': {
    titulo: 'La web carga con conexión cifrada (HTTPS)',
    correcto: 'La web responde por HTTPS: lo que se envía entre el visitante y tu web viaja cifrado.',
    fallo: 'La web no se puede abrir con conexión cifrada. Todo lo que escriban tus visitantes (formularios, contraseñas) puede ser leído o alterado por terceros, y los navegadores marcan la web como «no segura».',
    arreglo: 'Activa HTTPS en tu alojamiento. La mayoría lo ofrece gratis con un certificado de Let’s Encrypt: busca «SSL» o «certificado» en el panel, o pídeselo a tu proveedor.',
  },
  'https.final.seguro': {
    titulo: 'La página acaba siendo segura',
    correcto: 'Aunque alguien entre por otra dirección, termina en la versión cifrada de la web.',
    fallo: 'La web te lleva al final a una página sin cifrar. Es como cerrar la puerta de la tienda y dejar abierta la del almacén.',
    arreglo: 'Revisa las redirecciones de tu web: todas deben acabar en una dirección que empiece por https://. Suele ser un ajuste en el panel de tu alojamiento o en el plugin de seguridad (en WordPress, en Ajustes → Generales: la dirección de WordPress y del sitio deben empezar por https).',
  },
  'https.certificado.valido': {
    titulo: 'El certificado de seguridad es de confianza',
    correcto: 'El certificado es válido y emitido por una entidad que los navegadores reconocen.',
    fallo: (d) => MOTIVOS_CERTIFICADO[txt(d, 'motivo') ?? 'otro'] ?? MOTIVOS_CERTIFICADO.otro,
    arreglo: 'Pide a tu proveedor que instale un certificado válido y completo (Let’s Encrypt es gratuito y se renueva solo). Si tu web usa varias direcciones, comprueba que el certificado las cubre todas.',
  },
  'https.certificado.caducidad': {
    titulo: 'El certificado no está a punto de caducar',
    correcto: (d) => `Al certificado le quedan ${dias(num(d, 'dias') ?? 0)}: hay margen de sobra.`,
    mejorable: (d) => `El certificado caduca en ${dias(num(d, 'dias') ?? 0)}. Si no se renueva a tiempo, tus visitantes verán un aviso rojo.`,
    fallo: (d) => `El certificado caduca en ${dias(Math.max(0, num(d, 'dias') ?? 0))}. Si no se renueva ya, tus visitantes verán un aviso rojo.`,
    noAplica: 'No se puede valorar la caducidad porque el certificado no es de confianza.',
    arreglo: 'Comprueba que la renovación automática del certificado funciona. Si no la hay, renuévalo ahora y activa la renovación automática (con Let’s Encrypt es gratuito).',
  },
  'https.tls.version': {
    titulo: 'La conexión usa un cifrado moderno',
    correcto: (d) => `Se negoció ${txt(d, 'protocolo') ?? 'una versión moderna'} de TLS, una versión actual del cifrado.`,
    fallo: (d) => `El servidor acepta ${txt(d, 'protocolo') ?? 'una versión antigua'} de TLS, un cifrado antiguo con debilidades conocidas. Los navegadores actuales ya lo rechazan.`,
    noAplica: 'No se ha podido comprobar la versión del cifrado.',
    arreglo: 'Pide a tu proveedor que desactive TLS 1.0 y 1.1 y deje solo TLS 1.2 y 1.3. Si está en un alojamiento compartido, suele bastar con abrir una incidencia.',
  },
  'https.redireccion.http': {
    titulo: 'Quien escribe «http://» acaba en la versión segura',
    correcto: 'Si alguien entra por la dirección sin cifrar, es llevado automáticamente a la versión cifrada y de forma permanente.',
    mejorable: (d) =>
      d['permanente'] === false
        ? 'Quien entra sin cifrar es llevado a la versión segura, pero con una redirección temporal. Es mejor que sea permanente para que los navegadores y Google lo recuerden.'
        : 'No se ha podido comprobar a dónde lleva la dirección sin cifrar. Si nadie responde ahí, quien escriba «http://» no llegará a tu web.',
    fallo: (d) =>
      d['sirveContenido'] === true
        ? 'La web también se sirve entera sin cifrar. Quien entre por esa dirección navega sin protección.'
        : 'La dirección sin cifrar te deja en otra página sin cifrar en vez de llevarte a la versión segura.',
    arreglo: 'Configura una redirección permanente (301) de todo lo que empiece por http:// a https://. En la mayoría de alojamientos es un interruptor llamado «Forzar HTTPS».',
  },
  'https.hsts': {
    titulo: 'El navegador recuerda que tu web es solo segura (HSTS)',
    correcto: (d) => `La cabecera HSTS está activa durante ${dias(segundosADias(num(d, 'maxAge') ?? 0))}: tras la primera visita, el navegador ya no intenta entrar sin cifrar.`,
    mejorable: (d) => `HSTS está activa pero solo ${dias(segundosADias(num(d, 'maxAge') ?? 0))}. Cuanto más tiempo, más protección: se recomienda al menos 6 meses.`,
    fallo: (d) =>
      txt(d, 'motivo') === 'max-age-cero'
        ? 'La cabecera HSTS está puesta a 0, que equivale a desactivarla.'
        : txt(d, 'motivo') === 'sin-max-age'
          ? 'La cabecera HSTS existe pero está mal escrita: falta su duración, así que el navegador la ignora.'
          : 'Falta la cabecera HSTS. Sin ella, un atacante en una wifi pública puede obligar al navegador a entrar sin cifrar la primera vez.',
    arreglo: 'Añade la cabecera de respuesta Strict-Transport-Security. Pruébala primero con un valor corto y súbelo cuando compruebes que todo funciona por HTTPS.',
    codigo: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  },
  'https.hsts.subdominios': {
    titulo: 'HSTS también protege los subdominios',
    correcto: 'La protección HSTS cubre también los subdominios (tienda.tuweb.com, blog.tuweb.com…).',
    mejorable: 'HSTS no incluye los subdominios. Un atacante podría aprovechar uno de ellos para engañar al navegador.',
    noAplica: 'Se valora cuando HSTS está activa.',
    arreglo: 'Añade «includeSubDomains» a la cabecera HSTS, después de comprobar que todos tus subdominios funcionan con HTTPS.',
    codigo: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  },
  'https.hsts.precarga': {
    titulo: 'Tu web está lista para la lista de precarga de los navegadores',
    correcto: 'Tu cabecera HSTS cumple lo que piden los navegadores para incluir tu web en su lista de «siempre segura».',
    mejorable: 'Has marcado «preload», pero la cabecera no cumple lo que se exige: un año de duración e incluir los subdominios.',
    noAplica: 'Es opcional y solo informativo: no cuenta para la nota.',
    arreglo: 'Si quieres entrar en la lista de precarga, usa un año o más de duración, «includeSubDomains» y «preload», y solicítalo en hstspreload.org. Ojo: es difícil de deshacer.',
    codigo: 'Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
  },
  'cabeceras.csp': {
    titulo: 'Política de seguridad de contenido (CSP)',
    correcto: 'Tu web le dice al navegador qué scripts puede ejecutar, de modo que un código inyectado por un atacante no se ejecuta.',
    mejorable: (d) => {
      const p = Array.isArray(d['problemas']) ? (d['problemas'] as string[]) : [];
      const frases: string[] = [];
      if (p.includes('unsafe-inline')) frases.push('permite scripts «inline» sin control, que es justo lo que explota un atacante');
      if (p.includes('unsafe-eval')) frases.push('permite ejecutar texto como código (eval)');
      if (p.includes('comodin')) frases.push('acepta scripts de cualquier origen');
      if (p.includes('sin-script-src')) frases.push('no restringe de dónde pueden venir los scripts');
      if (p.includes('sin-object-src')) frases.push('no bloquea plugins y objetos incrustados');
      return `Hay una política, pero ${frases.length ? frases.join('; ') : 'es demasiado permisiva'}. Así protege mucho menos de lo que parece.`;
    },
    fallo: (d) =>
      d['soloInforme'] === true
        ? 'La política está en modo de prueba (solo informa, no bloquea). Mientras siga así, no protege.'
        : 'Falta esta protección. Si alguien consigue colar código en tu web (por un plugin vulnerable, por ejemplo), el navegador lo ejecutará sin pestañear.',
    arreglo: 'Empieza por una política básica y ve ajustándola. Prueba primero en modo informe para ver qué se rompería, y actívala cuando todo vaya bien. Evita «unsafe-inline» y los comodines.',
    codigo: "Content-Security-Policy: default-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'",
  },
  'cabeceras.clickjacking': {
    titulo: 'Protección contra páginas disfrazadas (clickjacking)',
    correcto: 'Tu web no se puede incrustar en la página de otro, así que nadie puede engañar a tus visitantes para que hagan clic sin saberlo.',
    mejorable: 'Usas una cabecera antigua que los navegadores ya no entienden. Sustitúyela por una moderna.',
    fallo: 'Cualquier otra web puede mostrar la tuya dentro de un marco invisible y hacer que tus visitantes pulsen botones sin darse cuenta.',
    arreglo: 'Añade una de las dos cabeceras. La segunda es la moderna y permite incrustar solo desde tu propio dominio.',
    codigo: "X-Frame-Options: SAMEORIGIN\nContent-Security-Policy: frame-ancestors 'self'",
  },
  'cabeceras.nosniff': {
    titulo: 'El navegador no adivina el tipo de archivo',
    correcto: 'Los archivos se tratan exactamente como tu servidor dice que son.',
    fallo: 'Sin esta cabecera, el navegador puede decidir que un archivo subido como imagen es en realidad un script y ejecutarlo.',
    arreglo: 'Añade la cabecera X-Content-Type-Options. Es de las más sencillas y casi nunca da problemas.',
    codigo: 'X-Content-Type-Options: nosniff',
  },
  'cabeceras.referrer': {
    titulo: 'Control de lo que se cuenta a otras webs al hacer clic',
    correcto: 'Cuando un visitante sale hacia otra web, solo se le dice de dónde viene lo imprescindible.',
    mejorable: (d) =>
      d['ausente'] === true
        ? 'No lo has configurado, y cada navegador decide por su cuenta. Mejor fijar tú qué información se comparte.'
        : 'La política actual comparte más información de la necesaria con otras webs.',
    fallo: 'Se envía la dirección completa (con parámetros) a cualquier web a la que se enlaza, aunque contenga datos privados.',
    arreglo: 'Añade la cabecera Referrer-Policy con un valor prudente.',
    codigo: 'Referrer-Policy: strict-origin-when-cross-origin',
  },
  'cabeceras.permisos': {
    titulo: 'Permisos del navegador (cámara, micrófono, ubicación)',
    correcto: 'Tu web declara a qué funciones del dispositivo puede acceder, y un script ajeno no puede pedirlas por su cuenta.',
    mejorable: 'No limitas qué funciones del dispositivo (cámara, micrófono, ubicación) pueden usar tu web o los scripts de terceros que cargue.',
    arreglo: 'Añade la cabecera Permissions-Policy desactivando lo que tu web no usa.',
    codigo: 'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  },
  'cookies.ninguna': {
    titulo: 'Tu web no guarda cookies al entrar',
    correcto: 'Al visitar la página principal no se guarda ninguna cookie en el navegador del visitante: nada que proteger y nada que avisar.',
    noAplica: 'Se valora solo cuando la web no guarda cookies.',
  },
  'cookies.secure': {
    titulo: 'Las cookies solo viajan por conexión cifrada',
    correcto: (d) => `Las cookies que guarda tu web (${num(d, 'total') ?? 0}) llevan la marca «Secure»: el navegador nunca las envía sin cifrar.`,
    fallo: (d) => `${listaCookies(d)} no lleva la marca «Secure». Si alguien visita una página sin cifrar, el navegador las envía a la vista de cualquiera en la misma red.`,
    noAplica: 'No hay cookies que valorar.',
    arreglo: 'Añade «Secure» a todas las cookies. En el código de tu web suele ser una opción al crear la cookie; en WordPress y otros gestores, un ajuste o un plugin de seguridad.',
    codigo: 'Set-Cookie: sesion=...; Secure; HttpOnly; SameSite=Lax',
  },
  'cookies.httponly': {
    titulo: 'Las cookies de sesión no las puede leer un script',
    correcto: 'Las cookies que identifican a un usuario llevan «HttpOnly»: ningún script de la página puede leerlas, ni siquiera uno malicioso.',
    fallo: (d) => `${listaCookies(d)} parece una cookie de sesión y no lleva «HttpOnly». Si alguien consigue ejecutar un script en tu web, puede robar la sesión del usuario.`,
    noAplica: 'No hay cookies de sesión que valorar.',
    arreglo: 'Añade «HttpOnly» a las cookies de sesión y de acceso. Solo deben quedarse sin él las que tu propio JavaScript necesite leer.',
    codigo: 'Set-Cookie: sesion=...; Secure; HttpOnly; SameSite=Lax',
  },
  'cookies.samesite': {
    titulo: 'Las cookies indican cuándo pueden enviarse desde otras webs',
    correcto: 'Las cookies declaran su política «SameSite», lo que ayuda a frenar los engaños en los que otra web hace peticiones en nombre del usuario.',
    mejorable: (d) => `${listaCookies(d)} no declara «SameSite». Los navegadores modernos aplican «Lax» por su cuenta, pero es mejor decirlo tú.`,
    noAplica: 'No hay cookies que valorar.',
    arreglo: 'Añade «SameSite=Lax» (o «Strict» si tu web lo permite) a las cookies.',
    codigo: 'Set-Cookie: sesion=...; Secure; HttpOnly; SameSite=Lax',
  },
  'privacidad.rastreadores': {
    titulo: 'La página no carga rastreadores de terceros',
    correcto: 'No hemos encontrado servicios de analítica ni de publicidad de terceros en la página: tus visitantes no envían datos a nadie más.',
    mejorable: (d) =>
      `La página carga ${listaNombres(d)}. Servicios así reciben datos de tus visitantes (qué páginas ven, desde qué dispositivo y a veces un identificador de publicidad). En la Unión Europea eso suele exigir su consentimiento previo.`,
    noAplica: 'No se pudo leer la página entera.',
    arreglo:
      'Pregúntate si de verdad usas cada uno y quita los que no. Para medir visitas puedes usar una herramienta que no identifica personas, como Plausible, Umami o Matomo en tu propio servidor, que en muchos casos no necesita consentimiento.',
  },
  'privacidad.consentimiento': {
    titulo: 'Hay aviso de cookies donde hace falta',
    correcto: (d) =>
      `La web carga servicios de seguimiento y muestra un aviso de cookies${txt(d, 'gestor') && txt(d, 'gestor') !== 'propio' ? ` (${txt(d, 'gestor')})` : ''}. Comprueba que esos servicios no se activan hasta que el visitante acepta: desde fuera no podemos verlo.`,
    mejorable: (d) =>
      `La página carga ${listaNombres(d)}, pero en su código no vemos ningún aviso de cookies. Si lo añade un script después de cargar, puede que lo tengas; si no, estás recogiendo datos sin pedir permiso.`,
    noAplica: 'Solo se valora si la web carga rastreadores.',
    arreglo:
      'Instala un gestor de consentimiento (Cookiebot, Iubenda, CookieYes o Complianz en WordPress, por ejemplo) y configúralo para que los rastreadores solo se carguen tras aceptar. Rechazar debe ser tan fácil como aceptar.',
  },
  'privacidad.fuentes': {
    titulo: 'Las tipografías se sirven desde tu propia web',
    correcto: 'Tu web no pide tipografías a Google: el navegador del visitante no le cuenta a Google que ha entrado.',
    mejorable:
      'La página pide sus tipografías a los servidores de Google. Al hacerlo, la dirección IP del visitante llega a Google sin que haya aceptado nada, y algunos tribunales europeos han considerado que eso incumple el RGPD.',
    noAplica: 'No se pudo leer la página entera.',
    arreglo: 'Descarga las tipografías y sírvelas desde tu propia web. En WordPress hay plugins que lo hacen solos; en Next.js, next/font las aloja por ti.',
  },
  'privacidad.politica': {
    titulo: 'Hay una política de privacidad enlazada',
    correcto: 'La página enlaza a una política de privacidad, donde el RGPD pide explicar qué datos recoges y para qué.',
    mejorable:
      'No vemos ningún enlace a una política de privacidad en la página principal. Si tu web recoge datos (formularios, cuentas, analítica), el RGPD exige explicar qué haces con ellos. Si el enlace lo pone un script, puede que sí lo tengas.',
    noAplica: 'No se pudo leer la página entera.',
    arreglo: 'Redacta una política de privacidad (qué datos recoges, para qué, cuánto tiempo y cómo ejercer los derechos) y enlázala desde el pie de todas las páginas.',
  },
  'privacidad.avisolegal': {
    titulo: 'Hay un aviso legal enlazado',
    correcto: 'La página enlaza a un aviso legal o a unas condiciones de uso.',
    mejorable:
      'No vemos enlace a un aviso legal. En España, las webs de empresas y profesionales deben indicar quién está detrás (nombre o razón social, NIF, domicilio y contacto), según la ley de servicios de la sociedad de la información (LSSI).',
    noAplica: 'No se pudo leer la página entera.',
    arreglo: 'Añade una página de aviso legal con los datos de la persona o empresa titular y enlázala desde el pie.',
  },
  'tecnologias.php': {
    titulo: 'La versión de PHP sigue recibiendo parches',
    correcto: (d) => `Tu web declara PHP ${txt(d, 'version') ?? ''}, una versión que todavía recibe parches de seguridad.`,
    fallo: (d) =>
      `Tu web declara PHP ${txt(d, 'version') ?? ''}${txt(d, 'fin') ? `, que dejó de recibir parches el ${fechaLarga(txt(d, 'fin') as string)}` : ', una versión que ya no recibe parches'}. Cada fallo que se descubre desde entonces queda sin arreglar.`,
    noAplica: 'No se ha detectado PHP, así que no se valora.',
    arreglo: 'Pide a tu proveedor de alojamiento que cambie tu web a una versión de PHP actual (8.3 o superior). Suele ser un selector en el panel. Prueba antes que tu web y sus plugins funcionan con ella.',
  },
  'tecnologias.servidor': {
    titulo: 'El servidor no cuenta su versión exacta',
    correcto: 'El servidor no revela qué programa y qué versión usa.',
    mejorable: (d) => `El servidor se presenta como «${txt(d, 'valor') ?? ''}». Con esa versión exacta, quien busque fallos conocidos sabe cuáles probar.`,
    arreglo: 'Pide a tu proveedor que oculte la versión en la cabecera «Server». En nginx es «server_tokens off»; en Apache, «ServerTokens Prod».',
    codigo: 'nginx:  server_tokens off;\nApache: ServerTokens Prod',
  },
  'tecnologias.cabecera': {
    titulo: 'La web no anuncia con qué está hecha',
    correcto: 'Las cabeceras no anuncian la tecnología ni la versión con las que está hecha tu web.',
    mejorable: (d) => `La cabecera «${txt(d, 'cabecera') ?? 'X-Powered-By'}» dice «${txt(d, 'valor') ?? ''}». Es un rótulo que facilita buscar fallos concretos de esa versión.`,
    arreglo: 'Quita esa cabecera. En PHP es «expose_php = Off»; en Express (Node), «app.disable("x-powered-by")»; en ASP.NET, quitarla del archivo de configuración. Tu proveedor puede hacerlo.',
    codigo: 'PHP (php.ini): expose_php = Off',
  },
  'tecnologias.generador': {
    titulo: 'La página no anuncia el gestor ni su versión',
    correcto: 'El código de la página no anuncia qué gestor de contenidos ni qué versión usas.',
    mejorable: (d) => `La página anuncia «${txt(d, 'valor') ?? ''}» en su código. Quien busque webs con una versión vulnerable la encuentra a la primera.`,
    noAplica: 'No se ha podido leer el código de la página.',
    arreglo: 'Quita la etiqueta «generator» (en WordPress, con un plugin de seguridad o una línea en el tema) y, sobre todo, mantén el gestor actualizado.',
  },
};

export function textoDeHallazgo(h: Pick<Hallazgo, 'id' | 'resultado' | 'datos'>): {
  titulo: string;
  explicacion: string;
  arreglo: string | null;
  codigo: string | null;
} {
  const texto = TEXTOS[h.id];
  if (!texto) return { titulo: h.id, explicacion: '', arreglo: null, codigo: null };
  const datos = h.datos ?? {};
  const resolver = (t: Texto | undefined): string | null => (t === undefined ? null : typeof t === 'function' ? t(datos) : t);

  let explicacion: string | null;
  switch (h.resultado) {
    case 'correcto':
      explicacion = resolver(texto.correcto);
      break;
    case 'mejorable':
      explicacion = resolver(texto.mejorable ?? texto.fallo);
      break;
    case 'fallo':
      explicacion = resolver(texto.fallo ?? texto.mejorable);
      break;
    default:
      explicacion = resolver(texto.noAplica);
  }
  const hayQueArreglar = h.resultado === 'mejorable' || h.resultado === 'fallo';
  return {
    titulo: texto.titulo,
    explicacion: explicacion ?? '',
    arreglo: hayQueArreglar ? resolver(texto.arreglo) : null,
    codigo: hayQueArreglar ? resolver(texto.codigo) : null,
  };
}

// ------------------------------------------------------------------
// Categorías, gravedad, letras, avisos y errores
// ------------------------------------------------------------------

export const CATEGORIAS: Record<Categoria, { nombre: string; corto: string; descripcion: string }> = {
  https: { nombre: 'Conexión segura', corto: 'Conexión', descripcion: 'Cifrado, certificado y redirecciones' },
  cabeceras: { nombre: 'Defensas del navegador', corto: 'Defensas', descripcion: 'Cabeceras que protegen a tus visitantes' },
  cookies: { nombre: 'Cookies', corto: 'Cookies', descripcion: 'Cómo se guardan en el navegador de tus visitantes' },
  privacidad: { nombre: 'Privacidad y RGPD', corto: 'Privacidad', descripcion: 'Quién recibe datos de tus visitantes y qué les cuentas' },
  tecnologias: { nombre: 'Tecnologías expuestas', corto: 'Tecnologías', descripcion: 'Qué cuenta tu web sobre cómo está hecha' },
};

export const GRAVEDAD: Record<Gravedad, string> = {
  critica: 'Crítico',
  alta: 'Importante',
  media: 'Moderado',
  baja: 'Menor',
  info: 'Informativo',
};

export const VEREDICTO: Record<Letra, { titulo: string; texto: string }> = {
  'A+': { titulo: 'Excelente', texto: 'Tu web cumple todo lo que hemos comprobado. Es de las mejor protegidas.' },
  A: { titulo: 'Muy bien', texto: 'Tu web está bien protegida. Quedan detalles menores por pulir.' },
  B: { titulo: 'Bien, con margen', texto: 'La base es sólida, pero hay protecciones que faltan y conviene añadirlas.' },
  C: { titulo: 'Mejorable', texto: 'Tu web tiene lo básico, pero le faltan defensas importantes.' },
  D: { titulo: 'Floja', texto: 'Hay carencias serias que conviene arreglar pronto.' },
  F: { titulo: 'Insegura', texto: 'Hay problemas graves: tus visitantes no están protegidos ni, en algunos casos, avisados.' },
};

export function textoDeTecho(id: string, letra: Letra): string {
  const por = TEXTOS[id]?.titulo ?? id;
  return `Aunque lo demás vaya bien, la nota no puede pasar de ${letra} mientras falle: «${por}».`;
}

const AVISOS: Record<string, (d: Datos) => string> = {
  'redireccion.otro-host': (d) =>
    `Tu dirección te lleva a otra: ${txt(d, 'desde') ?? ''} redirige a ${txt(d, 'hasta') ?? ''}. Lo que ves aquí es el análisis de la web de destino.`,
  'cuerpo.recortado': () => 'La página era muy grande y solo hemos leído el principio. No afecta a las comprobaciones de esta versión.',
  'cuerpo.interrumpido': () => 'La web dejó de responder mientras la leíamos. El resultado se basa en lo recibido hasta ese momento.',
};

export function textoDeAviso(a: { id: string; datos?: Datos }): string {
  return AVISOS[a.id]?.(a.datos ?? {}) ?? a.id;
}

export const IDS_AVISO = Object.keys(AVISOS);

export const ERRORES_OBJETIVO: Record<MotivoObjetivo, string> = {
  vacio: 'Escribe la dirección de la web que quieres revisar.',
  'demasiado-largo': 'Esa dirección es demasiado larga.',
  protocolo: 'Solo se pueden revisar direcciones web (http:// o https://).',
  credenciales: 'La dirección no puede llevar usuario ni contraseña.',
  puerto: 'Solo se revisan webs en los puertos habituales (80 y 443). Quita el número de puerto de la dirección.',
  'ip-literal': 'Escribe el nombre de la web (por ejemplo, tuempresa.com), no un número de IP.',
  'host-invalido': 'Esa dirección no parece válida. Prueba con algo como tuempresa.com.',
  'host-interno': 'Esa dirección es de una red interna y no se puede revisar desde internet.',
};

export const ERRORES_ANALISIS: Record<string, { titulo: string; texto: string }> = {
  'no-existe': { titulo: 'No encontramos esa web', texto: 'El nombre no existe o todavía no apunta a ningún servidor. Revisa que esté bien escrito.' },
  'sin-respuesta': { titulo: 'La web no responde', texto: 'No hemos podido conectar. Puede estar caída, bloquear a los analizadores o no aceptar conexiones desde fuera. No ponemos nota cuando no podemos ver la web.' },
  'destino-no-permitido': { titulo: 'No podemos revisar esa dirección', texto: 'Apunta a una red privada o reservada. Solo analizamos webs públicas de internet.' },
};

export const ERRORES_PETICION: Record<string, string> = {
  origen: 'La petición no viene de esta página.',
  formato: 'No hemos entendido la petición. Recarga la página e inténtalo de nuevo.',
  'demasiado-grande': 'La dirección es demasiado larga.',
  'demasiados-analisis': 'Has hecho muchos análisis seguidos. Espera un poco antes de seguir.',
  'servidor-ocupado': 'Ahora mismo hay mucha gente analizando webs. Inténtalo de nuevo en unos segundos.',
};

/** Paradas del «Recorrido de la conexión». */
export const PARADAS_TEXTO: Record<IdParada, { nombre: string; detalle: string }> = {
  direccion: { nombre: 'Alguien escribe tu dirección', detalle: 'Entra con http:// o sin nada delante.' },
  canal: { nombre: 'Se abre un canal cifrado', detalle: 'El certificado y la versión del cifrado.' },
  servidor: { nombre: 'Tu servidor responde', detalle: 'Lo que ordena al navegador y lo que cuenta de sí mismo.' },
  navegador: { nombre: 'El navegador se defiende', detalle: 'Cabeceras que limitan lo que puede hacer la página.' },
  cookies: { nombre: 'Cookies y rastreadores', detalle: 'Qué se guarda en el equipo del visitante y quién más recibe datos.' },
};

export function textoDeEstadoParada(estado: EstadoParada, pendientes: number): string {
  switch (estado) {
    case 'correcto':
      return 'Todo bien';
    case 'sin-datos':
      return 'Sin datos';
    default: {
      const n = Math.max(pendientes, 1);
      const cuantos = n === 1 ? '1 punto' : `${n} puntos`;
      return estado === 'fallo' ? `Falla: ${cuantos} por arreglar` : `${cuantos} por mejorar`;
    }
  }
}
