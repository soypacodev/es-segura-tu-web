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

Con el sondeo de archivos expuestos activado (ver más abajo) se añaden:

| Fallo | Techo |
| --- | --- |
| `.env` descargable | F |
| Copias de seguridad o de configuración descargables | F |
| Carpeta `.git` descargable | D |

La cadena incompleta tiene un techo más suave porque los navegadores de escritorio suelen completarla solos, aunque falle en móviles, programas y correo.

## Honestidad ante lo que no se ve

- Una conclusión de **ausencia** («no hay política de privacidad», «no hay HTTPS en este recurso») solo se saca si la página se leyó entera. Si se cortó por tamaño o tiempo, el hallazgo se marca como no concluyente y el informe lo avisa.
- Las listas largas (cookies, recursos externos…) se muestran con «y N más»; nunca se recortan en silencio.
- Las tecnologías y versiones detectadas son **indicios**: se afirma una vulnerabilidad solo cuando la versión se ha leído con claridad.

## Cómo se decidió cada peso

Prima lo que más daño evita a una persona sin conocimientos técnicos: un HTTPS correcto, un certificado vigente y las cabeceras que frenan ataques comunes pesan más que los detalles de rendimiento o de privacidad formal. Una comprobación que depende de interpretar la página (por ejemplo, detectar un enlace legal) pesa menos que una que se lee directamente de una cabecera.

Los pesos están junto al código de cada comprobación, en `src/lib/analisis/comprobaciones/`, y cada una tiene pruebas con sus casos buenos, malos y límite.

## Archivos expuestos (opcional)

Es la única comprobación que hace peticiones extra a la web, así que solo se ejecuta si quien analiza marca que es responsable de ella o tiene permiso. Es una declaración, no una verificación: el servidor no puede comprobarla.

- **Lista fija de 17 rutas** en la raíz de la web (`/.env`, `/.git/HEAD`, `/.git/config`, copias de `wp-config.php`, volcados `.sql`, comprimidos de copia, `phpinfo`, `server-status`, `.DS_Store`…). No se adivinan nombres ni se rastrea.
- **Solo cuenta un 200 con la firma del archivo** (por ejemplo, líneas `CLAVE=valor` para `.env`, o `PK` al inicio de un zip). Una web que responde 200 a todo no da falsos positivos.
- **Nunca se guarda ni se muestra el contenido.** Se leen como máximo 4 KB, se miran y se descartan; el informe solo dice qué ruta está expuesta.
- Un fallo de red, un plazo agotado o un 429/503 en alguna ruta deja ese grupo en «no aplica»: sin datos no se dice «todo bien».
- Los aciertos de esta categoría suman a la nota; por eso una nota con el sondeo y otra sin él no son directamente comparables. La categoría solo aparece en el informe cuando se activa.
