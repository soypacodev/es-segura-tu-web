# Seguridad

Una herramienta que hace peticiones a direcciones elegidas por desconocidos es, por naturaleza, un objetivo. Esto es lo que se hace y lo que se acepta.

## Defensas

**Contra el abuso del analizador (SSRF)**

- Solo `http:` y `https:`, solo los puertos 80 y 443, sin usuario ni contraseña en la URL.
- Se rechazan IP literales y nombres internos (`localhost`, `*.localhost`, sin punto…).
- Cada nombre se resuelve y **todas** sus direcciones deben ser públicas; la conexión se hace a esa IP ya validada (no se vuelve a resolver, así no hay carreras de DNS).
- Se revalida en cada redirección, con un máximo de saltos.
- Límites de tiempo y de tamaño de lo descargado (también descomprimido).

**Sondeo de archivos expuestos**
- Solo con la casilla de permiso marcada (`permiso: true` en la petición). Es una declaración de la persona; el servidor no puede verificarla, así que se limita el daño posible: 17 rutas fijas en la raíz de la web, solo `GET`, sin redirecciones, 4 peticiones simultáneas como máximo, 4 s de plazo y 4 KB de lectura por ruta.
- Pasa por el mismo descargador seguro (misma protección SSRF) y por el mismo límite de uso por visitante.
- Lo leído se descarta tras reconocer la firma: no se guarda, no se registra y no sale en el informe.

**Enlace para compartir**

- Solo se puede guardar un informe que **este servidor produjo**: sale firmado (HMAC-SHA256 con `INFORME_SECRETO`, sobre el informe en JSON canónico) y la firma vale una hora. Sin ella, nadie puede publicar un informe inventado con nuestra marca ni usar el servicio como almacén gratuito.
- El informe **no contiene datos sensibles** por construcción: ni el HTML, ni cabeceras en bruto, ni cookies, ni contenido de archivos; solo identificadores de hallazgos y datos sueltos (nombres de cabeceras, versiones…).
- **Nunca se comparte un informe con archivos expuestos** (`.env`, `.git`…): aunque no incluye su contenido, diría dónde están. El servidor ni siquiera ofrece la firma en ese caso, y vuelve a comprobarlo al guardar.
- El identificador son 16 bytes aleatorios (22 caracteres): no se puede adivinar ni recorrer. La página lleva `noindex`, `Referrer-Policy: no-referrer`, está excluida en `robots.txt` y caduca (30 días por defecto; lo caducado no se devuelve, y `supabase/informes.sql` incluye el borrado diario).
- La tabla de Supabase tiene RLS activado y ninguna política: solo el servidor, con la clave de servicio, la toca. La clave nunca llega al navegador.
- Mismas defensas que el análisis: origen, JSON, tope de cuerpo (128 KB), esquema estricto y límite de uso (10 enlaces por hora y visitante).

**Contra el abuso del servicio**

- Comprobación de `Origin` contra `Host`, solo `application/json`, cuerpo de 4 KB como máximo y esquema Zod estricto.
- Límite en memoria por visitante (análisis por hora y simultáneos) y global. Las IPv6 se agrupan por /64.
- Cabecera `Retry-After` en los rechazos.

**Contra ataques a quien usa la web**

- CSP con nonce por petición, HSTS con preload, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `COOP`.
- Los datos que vienen de la web analizada se tratan como texto no fiable: React los escapa y no se inyecta HTML.
- Los errores internos no devuelven detalles al cliente.

## Límites aceptados

- **Límite de uso en memoria**: cada instancia serverless lleva su propia cuenta, así que el límite real es mayor con varias instancias. Más adelante pasará a una base de datos.
- **IP del visitante**: se confía en `x-real-ip` solo cuando se ejecuta en Vercel, que es quien la fija. Fuera de ahí se usa una clave común conservadora.
- **Nombres de `/etc/hosts`**: el resolvedor DNS no los lee; los de loopback se rechazan por nombre, y cualquier otro nombre local simplemente no se resuelve.
- **Descompresión Brotli**: la ventana de descompresión puede ocupar memoria; está acotada por el tope de tamaño y el límite de análisis simultáneos.

- **Enlace compartido = permiso de lectura**: quien tenga la dirección puede ver el informe hasta que caduque. Se avisa a la persona antes de crearlo. No hay forma de borrarlo antes de tiempo (no hay cuentas); por eso se guarda poco tiempo.

## Notificar un problema

Escribe a soypacodev@gmail.com. Por favor, no pruebes el servicio de forma masiva.
