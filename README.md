# Alfonso (news.fut5belen.com)

Página estática de Alfonso: tipo de cambio, clima Belén y briefing de noticias (CR / AI / US / World).

**Live:** https://news.fut5belen.com

Host: GitHub Pages (`index.html`) + Cloudflare Worker para `POST /api/estudiar`. El token de Notion no va en el cliente.

## Estudiar → Cloudflare Worker → Notion

**☆** (icono, sin texto «Estudiar») vive a la derecha de `.hecho-titulo`: `[visto ○] [h3 flex:1] [☆]`. `.hora-agregado` solo muestra la hora (`padding-left: 36px`). Estrella `#6dbf8a` (idle, hover, press, `.is-ok`; sin amber). One-shot, sin modal.

Toasts: éxito `Tema enviado a Sheldon` (3–4 s) · error `No se pudo enviar`. Tras éxito la estrella se llena (`★`) y queda `is-ok` deshabilitada.

El navegador hace `POST /api/estudiar`. El Worker crea la fila en Notion. **No hay Zapier Catch Hook.**

### Destino Notion

- Base: [Temas de estudio](https://app.notion.com/p/e407609f7e654551863dee4809d0b73c)
- Database id: `e407609f-7e65-4551-863d-ee4809d0b73c`
- Data source: `collection://c65e34d4-0d4a-4d8d-aff1-4f4094ffd106`

| Propiedad | Valor al crear |
| --- | --- |
| Name | título del hecho |
| Status | `New` |
| Source URL | URL de la primera fuente (si hay) |
| Tab | `Costa Rica` / `AI` / `US` / `World` |
| Resumen | texto corto del card (si hay) |
| Briefing | vacío |
| Created | default de Notion |

Mapeo `tab`: `cr`→Costa Rica, `ai`→AI, `us`→US, `world`→World.

### Client

`index.html` → `ESTUDIAR_API_URL = '/api/estudiar'` (same-origin). Si el route de Cloudflare aún no está, el `POST` falla y el toast es `No se pudo enviar`.

Payload:

```json
{
  "name": "…",
  "status": "New",
  "sourceUrl": "…",
  "tab": "cr|ai|us|world",
  "resumen": "…",
  "requestedAt": "ISO-8601"
}
```

### Worker — route y secretos (Alfonso / Nora)

Código: `workers/estudiar/`. Route:

```
news.fut5belen.com/api/estudiar*
zona: fut5belen.com
```

(`wrangler.toml` ya lo declara.) El resto de `news.fut5belen.com` sigue en GitHub Pages. `news.*` tiene que estar **proxied** (nube naranja).

1. Notion: integración interna → copiar el token. Compartir **Temas de estudio** con esa integración.
2. Desde `workers/estudiar`:

```bash
npx wrangler login
npx wrangler secret put NOTION_TOKEN
# opcional; el default ya es e407609f-7e65-4551-863d-ee4809d0b73c
# npx wrangler secret put NOTION_DATABASE_ID
npx wrangler deploy
```

3. Confirmar: Worker `alfonso-estudiar`, route `news.fut5belen.com/api/estudiar*`.
4. Nunca commitear el token. Local: copiar `.dev.vars.example` → `.dev.vars` (gitignored). Tests: `npm test` en `workers/estudiar`.

CORS: `https://news.fut5belen.com` y localhost (`8080` / `8787`).

### Sheldon

Fuera de alcance. Nora: automatización de Notion cuando Status = `New`.

## Vistos

El control **visto** (bolita), **Mostrar vistas** y el sync `seen.json` no cambian. Estudiar no marca visto ni toca el gist.

## Clima Belén

Pronóstico de las próximas 24 horas para San Antonio de Belén, Heredia, Costa Rica. Datos de [Open-Meteo](https://open-meteo.com) (lat 9.9781, lon -84.1879, zona `America/Costa_Rica`). No usa API key.

## Uso

Abrí `index.html` en el navegador, o visitá la versión publicada.

## Stack

HTML estático + JavaScript (Pages). Cloudflare Worker solo para Estudiar → Notion.
