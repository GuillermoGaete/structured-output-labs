# Del token al JSON · curso interactivo

Seis módulos, cada uno con sus slides (deck propio en React, es/en) y su app para jugar con parámetros:

| # | Módulo | App |
|---|---|---|
| M0 | Tokens | Tokenizer Lab: texto → chips con id, Qwen vs GPT-2, chat template, merges BPE |
| M1 | Cómo se elige el siguiente token | Inference Loop: tokens → 24 bloques → salida → el token vuelve a la entrada |
| M2 | Temperatura y sampling | Sampling Lab: logits reales, T / top-k / top-p en el cliente, el dado cargado |
| M3 | Structured output sin strict mode | Experiment Runner: el mismo prompt N veces, clasificación de fallas |
| M4 | Structured output con strict mode | El mismo runner con la máscara + Time Machine paso a paso |
| M5 | Benchmark | Tiempos por modo: compilación, prefill, por token, hasta un JSON válido |

Todo funciona **sin backend** con las grabaciones commiteadas en `modules/*/fixtures`; con el backend
(`../backend`, FastAPI + transformers) cada módulo corre en vivo.

## Correr

```bash
# backend (desde la raíz del repo; el modelo queda cacheado en un volumen)
TORCH_THREADS=10 docker compose up -d --build

# curso
npm install
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:7860 npm run dev     # http://localhost:3000 → /es
```

Rutas: `/{es|en}` mapa del curso · `/{locale}/{módulo}/lab` · `/{locale}/{módulo}/slides/{n|id}`
(`?presenter=1` presentador, `?print=1` para PDF, `?theme=light|dark` fija el tema, `?src=recorded` fuerza las grabaciones).

Teclas en el deck: ←/→/Espacio navegar · `f` pantalla completa · `p` presentador · `t` tema · Esc salir.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run tokens` | regenera `design/tokens.css` desde `design/tokens.lab.json` |
| `npm run sync-figures` | copia las figuras SVG/PNG y las fuentes desde `../presentation` |
| `BACKEND_URL=… node scripts/record-fixtures.mjs [módulo…]` | graba las fixtures (recetas en `scripts/recipes.mjs`) |
| `node scripts/export-deck.mjs strict es` | PDF de un deck (con el dev server corriendo) |
| `npm run typecheck && npm run lint && npm test && npm run build` | verificación completa |

## Checklist de charla (30 minutos antes)

- [ ] `TORCH_THREADS=10 docker compose up -d`; `curl /health` → `loaded: true`, `warmed_up: true`.
- [ ] `npm run dev` con `NEXT_PUBLIC_BACKEND_URL`; en la home el pill dice el modelo y «en vivo».
- [ ] Una pestaña por módulo en `/es/<módulo>/slides/1`; el modo de datos en **Auto** (cae a grabado si el backend no responde).
- [ ] M4 lab abierto en otra pestaña con Person: la única generación en vivo («Correr 1 más en vivo», ~8 s).
- [ ] Zoom del navegador 125 %; `?theme=light` si el proyector lo pide; `f` en la ventana de audiencia.
- [ ] PDF de respaldo de cada deck en `out/`.

## Deploy

Vercel: Root Directory `course`, variable `NEXT_PUBLIC_BACKEND_URL` apuntando al Space de Hugging Face
(`backend/` es un Space Docker listo; ver `../backend/README.md`). Los visitantes también pueden pegar otra URL de
backend en la app. El selector de modelos sale de `MODEL_IDS` del backend.
