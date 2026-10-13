# Arquitectura

```
Navegador ── POST /api/analizar ──▶ route.ts
                                     │  origen, tipo, tamaño, Zod, límite de uso
                                     ▼
                                 analizar.ts  ── descarga.ts (HTTP/HTTPS seguro)
                                     │         └─ dns.ts (resolución y registros)
                                     ▼
                            comprobaciones/*.ts  → hallazgos
                                     ▼
                              puntuacion.ts  → nota, techos, categorías
                                     ▼
                       NDJSON: inicio · captura… · informe | error
```

## Capas

- **`src/app`**: páginas y rutas de API (`/api/analizar`, `/api/compartir` y `/api/mantener-activo`, la del cron diario). `icon.tsx`, `apple-icon.tsx` y los `opengraph-image.tsx` generan el icono y las vistas previas en el servidor. `proxy.ts` añade la CSP con un nonce nuevo por petición.
- **`src/lib/analisis`**: el motor. Sin dependencias de React ni de Next.
  - `objetivo.ts` valida y normaliza lo que escribe la persona.
  - `descarga.ts` es el único sitio que abre conexiones. Recibe la política de red y el resolutor por inyección, así se prueba con servidores locales.
  - `dns.ts` consulta registros mediante un resolvedor inyectable.
  - `comprobaciones/` son funciones puras `captura → hallazgos`, una por categoría, más `html.ts` (lector de etiquetas lineal) y `utiles.ts`.
  - `comprobaciones/exposicion.ts` define las 17 rutas del sondeo opcional de archivos expuestos y sus firmas; la red la pone `analizar.ts` con el mismo descargador seguro.
  - `puntuacion.ts` convierte hallazgos en nota.
- **`src/lib/textos`**: los textos para personas, indexados por identificador de hallazgo. Una prueba exige que todo identificador que el motor pueda emitir tenga texto.
- **`src/lib/compartir`**: el enlace compartible. `firma.ts` (HMAC), `almacen.ts` (interfaz y adaptadores: Supabase por REST y memoria), `config.ts` (variables de entorno), `servicio.ts` (reglas: firma válida y sin archivos expuestos) `instancia.ts` (singleton de servidor), `vista-previa.tsx` (imágenes para redes y mensajería, con las fuentes de `assets/fuentes`) y `mantener-activo.ts` (la consulta diaria que evita que Supabase gratuito pause el proyecto). La página `/informe/[id]` solo lee.
- **`src/lib/seguridad`**: CSP, comprobación de origen, identificación del visitante, lectura de cuerpo con tope.
- **`src/lib/icono-marca.tsx`**: el icono de la marca, una sola pieza para favicon, iOS y cabecera.
- **`src/componentes`**: interfaz. El informe se pinta a partir de los hallazgos y sus textos.

## Decisiones

- **Hallazgos como datos, no como frases.** El motor devuelve `{ id, resultado, gravedad, peso, datos }`; la interfaz decide cómo contarlo. Facilita traducir, probar y cambiar redacción sin tocar la lógica.
- **Streaming NDJSON.** El análisis tarda unos segundos; la interfaz enseña qué captura va completándose.
- **Lector HTML propio y lineal.** Sin dependencias y con presupuesto de trabajo: una página hostil no puede disparar el coste. Si se agota, el estado queda como «incompleto».
- **Resolución DNS por c-ares** (`dns.promises.Resolver`) en lugar de `dns.lookup`, que usa el pool de hilos de Node y podría saturarse con nombres lentos.
- **Pruebas sin red.** Las comprobaciones se prueban con capturas construidas a mano (`pruebas/construir.ts`); el descargador, con servidores locales.
- **Compartir sin cuentas ni dependencias.** Un informe se guarda con un identificador aleatorio y caduca. Para evitar que el almacén sirva para publicar cualquier cosa, el servidor firma lo que produce y solo acepta de vuelta lo firmado. Supabase se usa por su API REST con `fetch` (sin SDK) detrás de una interfaz de dos métodos, así que cambiar de base de datos es escribir un adaptador.
- **PDF con la impresión del navegador.** `@media print` da la vista A4 (con `@page` y pie con numeración); no hay generador de PDF en el servidor, así que no hay nada que mantener ni que explotar.
