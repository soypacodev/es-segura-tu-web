# ¿Es segura tu web?

Analizador gratuito de seguridad web. Pegas la dirección de una página y recibes, en segundos, una **nota de la A+ a la F** y un informe en lenguaje llano: qué falla, por qué importa y cómo se arregla.

Es un análisis **pasivo**: equivale a visitar la página con un navegador (una o dos peticiones normales). No ataca ni prueba contraseñas. Solo si la persona marca que es responsable de la web (o tiene permiso) se hace además una comprobación de archivos expuestos: una lista fija de 17 rutas, sin guardar ni mostrar nunca su contenido.

## Qué comprueba

Ocho categorías (más una opcional, «Archivos expuestos»), con un peso distinto cada comprobación:

| Categoría   | Ejemplos                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| HTTPS       | Disponible, redirección desde HTTP, certificado (caducidad, cadena, nombre), HSTS |
| DNS         | Resolución, SPF/DMARC/CAA, DNSSEC                                                 |
| Cabeceras   | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Contenido   | Contenido mixto, recursos externos sin integridad, formularios inseguros          |
| Cookies     | Secure, HttpOnly, SameSite                                                        |
| Privacidad  | Política de privacidad, cookies, aviso legal, rastreadores de terceros            |
| Tecnologías | Versiones expuestas y librerías con fin de vida o vulnerabilidades conocidas (jQuery, jQuery UI, Bootstrap, AngularJS, Vue 2, Lodash, Moment.js, Handlebars)      |
| Rendimiento | Compresión, caché, tamaño, adaptación a móvil                                     |
| Archivos expuestos (opcional) | `.env`, `.git`, copias de seguridad, `phpinfo`, páginas de estado del servidor, `.DS_Store` |

Los criterios y pesos están en [docs/CRITERIOS.md](docs/CRITERIOS.md).

## Probarlo en local

Requiere Node 22.18 o superior.

```bash
npm install
npm run dev          # http://localhost:3000
```

También desde la terminal, sin interfaz:

```bash
npm run analizar -- ejemplo.com
npm run analizar -- ejemplo.com --json
```

## Informe en PDF y enlace para compartir

- **PDF**: el botón «Descargar informe en PDF» abre el diálogo de impresión con una vista pensada para A4: sin interfaz, con todos los detalles desplegados y con el pie de autor. Se elige «Guardar como PDF».
- **Enlace para compartir** (opcional): guarda el informe y da una dirección que se puede reenviar. Solo se activa si se configuran las variables de abajo; sin ellas, la web funciona igual y el botón no aparece.

| Variable                    | Para qué                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `SUPABASE_URL`              | Dirección del proyecto (`https://….supabase.co`)                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio: solo en el servidor, nunca en el navegador                               |
| `INFORME_SECRETO`           | Cadena aleatoria de 32 caracteres o más con la que el servidor firma los informes           |
| `INFORME_DIAS`              | Días que se conserva un informe compartido (1–365; por defecto 30)                          |

La tabla se crea con [`supabase/informes.sql`](supabase/informes.sql). En desarrollo (`npm run dev`) sin Supabase se guarda en memoria, para probarlo.

## Scripts

| Comando                       | Qué hace                             |
| ----------------------------- | ------------------------------------ |
| `npm run dev`                 | Servidor de desarrollo               |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run lint`                | ESLint                               |
| `npm run typecheck`           | TypeScript sin emitir                |
| `npm test`                    | Pruebas (Vitest)                     |
| `npm run verificar`           | Todo lo anterior, en orden           |

## Cómo está hecho

- **Next.js 16** (App Router), **React 19**, **TypeScript** estricto, **Zod** para validar la entrada.
- El motor de análisis son funciones puras: reciben una «captura» de la web y devuelven hallazgos (un identificador y unos datos). Los textos viven aparte, en `src/lib/textos`, lo que permite probar el motor sin red y traducirlo.
- Respuesta en streaming (NDJSON): la interfaz muestra el progreso mientras se analiza.
- Seguridad propia de la aplicación: CSP con nonce, cabeceras estrictas, descargador a prueba de SSRF, límites de uso. Ver [docs/SEGURIDAD.md](docs/SEGURIDAD.md).

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Límites conocidos

- Sin JavaScript no ve lo que una página dibuja en el navegador: analiza el HTML y las cabeceras recibidos.
- Si no puede leer la página entera (tamaño, tiempo), el informe lo dice y no saca conclusiones de lo que «falta».
- Una nota alta no garantiza que la web sea segura: mide buenas prácticas visibles desde fuera.

## Autor

Paco López · [soypacodev](https://github.com/soypacodev) · Licencia MIT.
