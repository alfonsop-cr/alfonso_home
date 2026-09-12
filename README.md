# Alfonso (news.fut5belen.com)

Página estática de Alfonso: tipo de cambio, clima Belén y briefing de noticias (CR / AI / US / World).

**Live:** https://news.fut5belen.com

Host: GitHub Pages (`index.html`) + Cloudflare Worker para `POST /api/estudiar`. Sin Notion token en el cliente.

## Estudiar → Notion

Cada hecho tiene **☆ Estudiar** (acción secundaria, al lado de **visto**). Un toque envía el hecho al Worker; el Worker crea la fila en Notion. **El token nunca va en este repo ni en el JS del cliente.**

Toasts (Almina): éxito `Tema enviado a Sheldon` · error `No se pudo enviar`. One-shot por hecho.

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

Mapeo `tab` del cliente → select de Notion: `cr`→Costa Rica, `ai`→AI, `us`→US, `world`→World.

### Client

`index.html` → `ESTUDIAR_API_URL = '/api/estudiar'` (same-origin). Si el route de Cloudflare aún no está, el `POST` falla y el toast es `No se pudo enviar`.

Si hace falta un host Worker aparte (temporal), cambiá esa constante a la URL absoluta (`https://alfonso-estudiar.<ACCOUNT>.workers.dev/api/estudiar`).

Payload:

```json
{
  "name": "…",
  "sourceUrl": "…",
  "tab": "cr|ai|us|world",
  "resumen": "…",
  "requestedAt": "ISO-8601"
}
```

### Cloudflare Worker — route y secretos (Alfonso / Nora)

Código: `workers/estudiar/`. Route locked:

```
news.fut5belen.com/api/estudiar*
zone: fut5belen.com
```

(`wrangler.toml` ya lo declara.) El resto de `news.fut5belen.com` sigue en GitHub Pages.

1. En Notion: integración interna → copiar el token. Compartir **Temas de estudio** con esa integración.
2. `news.fut5belen.com` tiene que estar en la zona `fut5belen.com` y **proxied** (nube naranja). Si el CNAME a GitHub Pages no pasa por Cloudflare, el Worker no ve `/api/estudiar`.
3. Desde `workers/estudiar`:

```bash
npx wrangler login
npx wrangler secret put NOTION_TOKEN
# opcional; el default ya es e407609f-7e65-4551-863d-ee4809d0b73c
# npx wrangler secret put NOTION_DATABASE_ID
npx wrangler deploy
```

4. Confirmar en el dashboard: Worker `alfonso-estudiar`, route `news.fut5belen.com/api/estudiar*`.
5. Probar: `POST https://news.fut5belen.com/api/estudiar` con el JSON de arriba debe devolver `{ "ok": true, "id": "…" }` y crear la fila en Status=`New`.

CORS: `https://news.fut5belen.com` y localhost (`8080` / `8787`).

Local: copiar `.dev.vars.example` → `.dev.vars` (gitignored) y `npx wrangler dev`. Tests: `npm test` en `workers/estudiar`.

### Sheldon

El Worker **no** pinea a Sheldon. Nora: automatización de Notion cuando Status = `New` (fila nueva en Temas de estudio).

## Vistos

El control **visto** y el sync `seen.json` (gist + token local) no cambian. Estudiar no marca visto ni toca el gist.

## Clima Belén

Pronóstico de las próximas 24 horas para San Antonio de Belén, Heredia, Costa Rica. Datos de [Open-Meteo](https://open-meteo.com) (lat 9.9781, lon -84.1879, zona `America/Costa_Rica`). No usa API key.

## Uso

Abrí `index.html` en el navegador, o visitá la versión publicada.

## Stack

HTML estático + JavaScript (Pages). Cloudflare Worker solo para Estudiar → Notion.
