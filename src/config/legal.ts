// Textos legales de la herramienta. Se cambian aquí, no en las páginas.
// Cuando haya alta de autónomo, añade el NIF y el domicilio profesional en `AVISO_LEGAL` (apartado «Titular»).

export interface DocumentoLegal {
  titulo: string;
  descripcion: string;
  fecha: string;
  secciones: readonly { titulo: string; parrafos: readonly string[] }[];
}

export const PRIVACIDAD: DocumentoLegal = {
  titulo: 'Política de privacidad',
  descripcion: 'Qué datos trata «¿Es segura tu web?»: la dirección que analizas, tu IP durante el uso y los informes que decidas compartir.',
  fecha: '13 de octubre de 2026',
  secciones: [
    {
      titulo: 'Resumen',
      parrafos: [
        'No hay cuentas, ni cookies, ni analítica, ni scripts de terceros. Los datos que se tratan son pocos: tu dirección IP mientras usas la herramienta (para limitar el uso) y, solo si pulsas «Crear enlace para compartir», el informe que se guarda durante 30 días.',
      ],
    },
    {
      titulo: 'Quién es el responsable',
      parrafos: ['Paco López. Puedes escribirme a soypacodev@gmail.com para cualquier duda sobre tus datos.'],
    },
    {
      titulo: 'Qué se trata y para qué',
      parrafos: [
        'La dirección que escribes se usa solo para hacer el análisis. No se guarda: el resultado llega a tu navegador y desaparece cuando cierras la página, salvo que decidas compartirlo.',
        'Tu dirección IP se usa en la memoria del servidor para contar cuántos análisis haces (hay un máximo por hora) y proteger así a las webs de terceros y al servicio. No se escribe en ninguna base de datos propia. El proveedor de alojamiento puede registrar datos técnicos de la conexión, como la IP, por el funcionamiento y la seguridad del servicio. La base legal es mi interés legítimo en que la herramienta no se use para sobrecargar webs ajenas.',
        'Si pulsas «Crear enlace para compartir», se guarda el informe (la dirección analizada y los resultados, sin el contenido de la web) durante 30 días. Cualquiera que tenga el enlace puede verlo. Pasado ese plazo se borra solo. La base legal es tu petición de crear el enlace.',
      ],
    },
    {
      titulo: 'Si me escribes',
      parrafos: [
        'Los enlaces de contacto abren tu programa de correo: el mensaje llega directamente a mi bandeja y lo uso solo para responderte. Mi correo funciona sobre Gmail (Google), que actúa como proveedor del servicio de correo. Conservo la conversación mientras dure y, si no llega a haber contrato, la borro a los 12 meses del último mensaje.',
      ],
    },
    {
      titulo: 'Proveedores',
      parrafos: [
        'La herramienta se aloja en Vercel y los informes compartidos se guardan en Supabase (base de datos). Ambos actúan como proveedores y pueden tratar datos fuera del Espacio Económico Europeo bajo sus propios contratos de tratamiento de datos. No cedo datos a nadie más, salvo obligación legal.',
      ],
    },
    {
      titulo: 'Tus derechos',
      parrafos: [
        'Puedes pedirme acceso, rectificación, supresión, oposición, limitación o portabilidad de tus datos escribiéndome al correo anterior. Si quieres borrar un informe compartido antes de los 30 días, escríbeme con su enlace. Si crees que no he tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).',
      ],
    },
  ],
};

export const AVISO_LEGAL: DocumentoLegal = {
  titulo: 'Aviso legal y condiciones de uso',
  descripcion: 'Quién está detrás de la herramienta, para qué sirve, cuándo puedes usarla y qué no garantiza.',
  fecha: '13 de octubre de 2026',
  secciones: [
    {
      titulo: 'Titular',
      parrafos: [
        'Esta herramienta es un proyecto de Paco López, desarrollador, con sede en Málaga (España). Contacto: soypacodev@gmail.com.',
        'Todavía no ejerzo como autónomo. Me daré de alta al empezar el primer proyecto con un cliente y, entonces, publicaré aquí mi NIF y mi domicilio profesional.',
      ],
    },
    {
      titulo: 'Para qué sirve',
      parrafos: [
        'Hace un análisis pasivo y orientativo de una web: mira solo lo que ve cualquier visitante (certificado, cabeceras, código de la página principal y registros públicos del dominio) y, si marcas la casilla, comprueba unas 17 rutas habituales donde a veces quedan archivos privados a la vista. No entra en la web, no prueba contraseñas ni intenta explotar nada.',
      ],
    },
    {
      titulo: 'Quién puede usarla y con qué permiso',
      parrafos: [
        'Úsala solo sobre webs de las que seas responsable o sobre las que tengas permiso de su titular. Al marcar la casilla declaras que es así y asumes esa responsabilidad. No la uses para sobrecargar un servidor ni como paso previo a un ataque. Hay un límite de análisis por hora para evitarlo.',
        'Esta herramienta no es un servicio de auditoría ni de pruebas de intrusión. Una revisión técnica más profunda de una web de un tercero requiere un acuerdo previo por escrito con su titular.',
      ],
    },
    {
      titulo: 'Qué no garantiza',
      parrafos: [
        'El resultado es informativo: una nota alta no garantiza que la web sea segura ni que cumpla la ley, y una nota baja no implica que lo sea. Se ofrece tal cual, gratis y sin garantías, y puede fallar o dejar de estar disponible. No sustituye a un asesoramiento profesional.',
      ],
    },
    {
      titulo: 'Propiedad intelectual',
      parrafos: ['El código de la herramienta es público en GitHub bajo licencia MIT. Los textos, el diseño y las fotos son míos y no entran en esa licencia. Los nombres y marcas de terceros pertenecen a sus dueños.'],
    },
    { titulo: 'Ley aplicable', parrafos: ['Esta herramienta se rige por la legislación española.'] },
  ],
};
