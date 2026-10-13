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

- **`src/app`**: páginas y la única ruta de API. `proxy.ts` añade la CSP con un nonce nuevo por petición.
- **`src/lib/analisis`**: el motor. Sin dependencias de React ni de Next.
  - `objetivo.ts` valida y normaliza lo que escribe la persona.
  - `descarga.ts` es el único sitio que abre conexiones. Recibe la política de red y el resolutor por inyección, así se prueba con servidores locales.
  - `dns.ts` consulta registros mediante un resolvedor inyectable.
  - `comprobaciones/` son funciones puras `captura → hallazgos`, una por categoría, más `html.ts` (lector de etiquetas lineal) y `utiles.ts`.
  - `puntuacion.ts` convierte hallazgos en nota.
- **`src/lib/textos`**: los textos para personas, indexados por identificador de hallazgo. Una prueba exige que todo identificador que el motor pueda emitir tenga texto.
- **`src/lib/seguridad`**: CSP, comprobación de origen, identificación del visitante, lectura de cuerpo con tope.
- **`src/componentes`**: interfaz. El informe se pinta a partir de los hallazgos y sus textos.

## Decisiones

- **Hallazgos como datos, no como frases.** El motor devuelve `{ id, resultado, gravedad, peso, datos }`; la interfaz decide cómo contarlo. Facilita traducir, probar y cambiar redacción sin tocar la lógica.
- **Streaming NDJSON.** El análisis tarda unos segundos; la interfaz enseña qué captura va completándose.
- **Lector HTML propio y lineal.** Sin dependencias y con presupuesto de trabajo: una página hostil no puede disparar el coste. Si se agota, el estado queda como «incompleto».
- **Resolución DNS por c-ares** (`dns.promises.Resolver`) en lugar de `dns.lookup`, que usa el pool de hilos de Node y podría saturarse con nombres lentos.
- **Pruebas sin red.** Las comprobaciones se prueban con capturas construidas a mano (`pruebas/construir.ts`); el descargador, con servidores locales.
