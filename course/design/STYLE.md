# Estilo de presentación · «Laboratorio»

El estilo vive en `tokens.lab.json` (fuente de verdad) y se deriva con `npm run tokens` a `tokens.css`
(variables CSS, claro y oscuro) y `tokens.generated.ts`. Slides, apps y gráficos consumen **roles**, nunca hex.
Migrar de estilo = escribir otro `tokens.<estilo>.json`, correr `npm run tokens` y validar la paleta.

## Roles

| Rol | Uso |
|---|---|
| `surface.page / panel / raised` | fondo de página, paneles planos, tarjeta elevada (una por vista) |
| `ink.primary / secondary / muted` | texto; el texto siempre usa tinta, nunca el color de una serie |
| `rule.hairline / strong` | bordes que separan; nada más |
| `accent` (+ `soft`, `strong`, `ink`) | eyebrows como píldoras, botón primario, foco |
| `series.model` | puntajes del modelo (logits, «intención original») |
| `series.chosen` | el token elegido o forzado |
| `series.third` | flujo residual / `h`, tercera serie |
| `series.masked` | −∞: rayado a 45°, nunca un color pleno |
| `status.good / warn / critical` | reservados para estados; nunca como serie de datos |
| `tokenPastels[8]` | chips de tokens (identidad de token, no de dato); texto negro encima |

Las tres series pasan `dataviz/scripts/validate_palette.js` en claro (con etiquetas directas) y en oscuro (limpio).

## Reglas que no cambian con el estilo

- Una idea por slide. El título es la afirmación; el cuerpo, la evidencia. Seis líneas o cuarenta palabras.
- Escala en el stage de 1920×1080: título 100 · afirmación 64 · cuerpo 36 · caption 24 · código 30 · eyebrow 26. Nada
  por debajo de 24 px en sala. Una sola tarjeta elevada por slide.
- Gráficos: barras horizontales ordenadas, marcas finas con extremo redondeado, etiquetas directas y selectivas, leyenda
  solo con dos series o más, grilla hairline, sin doble eje, «todo lo demás» siempre presente, fuente y fecha al pie.
- Código en slides: mono ≥ 28 px, ≤ 8 líneas, una línea resaltada y el resto atenuado.
- Movimiento solo cuando informa (un cambio de estado, la dirección de un flujo); 150–400 ms; `prefers-reduced-motion`.
- Demos: mismos tokens que el deck; estado inicial cargado desde una grabación; nada depende del hover para leerse.

## Las otras cuatro direcciones

El artifact «Cinco estilos, un sistema» documenta A Consola (Plex, casi-negro), B Papel (Newsreader + Source Sans, papel
gris frío), C Suizo (Archivo ancha, blanco y negro con azul eléctrico) y D Servilleta (Caveat + Atkinson Hyperlegible,
papel cuadriculado), todas con paletas ya validadas. Cualquiera de ellas es un `tokens.<estilo>.json` nuevo.
