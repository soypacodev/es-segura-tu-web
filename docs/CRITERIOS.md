# Criterios de puntuación

## Cómo se calcula la nota

Cada comprobación produce un **hallazgo** con un resultado y un peso:

| Resultado | Puntos que suma              |
| --------- | ---------------------------- |
| Correcto  | el peso entero               |
| Mejorable | la mitad                     |
| Fallo     | nada                         |
| No aplica | no cuenta (ni suma ni resta) |

La puntuación es el porcentaje conseguido sobre el peso de lo que sí aplica (0–100, redondeado). De ahí sale la letra:

| Puntos | Nota |
| ------ | ---- |
| 97–100 | A+   |
| 90–96  | A    |
| 80–89  | B    |
| 65–79  | C    |
| 50–64  | D    |
| 0–49   | F    |

Cada categoría tiene además su propio porcentaje. Si una categoría no tiene nada que evaluar, se muestra como «no aplica» en lugar de un 0.

## Techos

Algunos fallos son tan graves que ninguna otra virtud los compensa. Ponen un **techo**: la nota no puede pasar de esa letra, y el informe indica cuál es el fallo que la limita (solo si de verdad la ha bajado).

| Fallo                                                    | Techo |
| -------------------------------------------------------- | ----- |
| La web no está disponible por HTTPS, o termina en HTTP   | F     |
| Certificado no válido (nombre incorrecto, no confiable…) | F     |
| Certificado caducado                                     | D     |
| Cadena de certificados incompleta                        | C     |

La cadena incompleta tiene un techo más suave porque los navegadores de escritorio suelen completarla solos, aunque falle en móviles, programas y correo.

## Honestidad ante lo que no se ve

- Una conclusión de **ausencia** («no hay política de privacidad», «no hay HTTPS en este recurso») solo se saca si la página se leyó entera. Si se cortó por tamaño o tiempo, el hallazgo se marca como no concluyente y el informe lo avisa.
- Las listas largas (cookies, recursos externos…) se muestran con «y N más»; nunca se recortan en silencio.
- Las tecnologías y versiones detectadas son **indicios**: se afirma una vulnerabilidad solo cuando la versión se ha leído con claridad.

## Cómo se decidió cada peso

Prima lo que más daño evita a una persona sin conocimientos técnicos: un HTTPS correcto, un certificado vigente y las cabeceras que frenan ataques comunes pesan más que los detalles de rendimiento o de privacidad formal. Una comprobación que depende de interpretar la página (por ejemplo, detectar un enlace legal) pesa menos que una que se lee directamente de una cabecera.

Los pesos están junto al código de cada comprobación, en `src/lib/analisis/comprobaciones/`, y cada una tiene pruebas con sus casos buenos, malos y límite.
