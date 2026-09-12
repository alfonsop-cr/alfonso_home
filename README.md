# Alfonso (news.fut5belen.com)

Página estática de Alfonso: tipo de cambio, clima Belén y briefing de noticias (CR / AI / US / World).

**Live:** https://news.fut5belen.com

Host: GitHub Pages (`index.html`). Sin backend propio. Sin token de Notion en el cliente.

## Estudiar → Zapier Catch Hook → Notion

**☆ Estudiar** vive en la fila meta (`[hora] … [Estudiar]`, `padding-left: 36px`). En ~390 va debajo de la hora. No está dentro de `.visto-btn`. One-shot, sin modal.

Toasts: éxito `Tema enviado a Sheldon` (3–4 s) · error `No se pudo enviar`. Tras éxito el botón muestra `Enviado` y queda deshabilitado.

El navegador hace `POST` a `ESTUDIAR_WEBHOOK_URL` (Catch Hook de Zapier). El Zap crea la fila en Notion. **No hay Cloudflare Worker ni `NOTION_TOKEN` en este repo.**

### Destino Notion (el Zap lo escribe)

- Base: [Temas de estudio](https://app.notion.com/p/e407609f7e654551863dee4809d0b73c)
- Database id: `e407609f-7e65-4551-863d-ee4809d0b73c`
- Status = `New`
- Props: Name, Source URL, Tab, Resumen (Briefing vacío; Created = default)

Mapeo `tab` del cliente → select de Notion: `cr`→Costa Rica, `ai`→AI, `us`→US, `world`→World.

### Cómo cablear `ESTUDIAR_WEBHOOK_URL`

En `index.html`, arriba del JS:

```js
var ESTUDIAR_WEBHOOK_URL = '';
```

Hoy está vacío a propósito (la URL del Catch Hook llega por canal secreto). Mientras esté vacío o sea un placeholder, Estudiar muestra `No se pudo enviar` — no hay no-op silencioso.

Cuando Zapier entregue la URL:

1. Pegala en `ESTUDIAR_WEBHOOK_URL` (string entre comillas). Ejemplo: `https://hooks.zapier.com/hooks/catch/…/…/`.
2. Commit + deploy de Pages (este repo).
3. El Zap debe crear la página en Temas de estudio con Status=`New` y mapear el JSON de abajo. CORS: `POST` + `application/json` desde `https://news.fut5belen.com`.
4. Sheldon: que el Zap o una automatización de Notion en Status=`New` avise. Pages no pinea al bot.

Payload que envía el cliente:

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

## Vistos

El control **visto** (bolita), **Mostrar vistas** y el sync `seen.json` no cambian. Estudiar no marca visto ni toca el gist.

## Clima Belén

Pronóstico de las próximas 24 horas para San Antonio de Belén, Heredia, Costa Rica. Datos de [Open-Meteo](https://open-meteo.com) (lat 9.9781, lon -84.1879, zona `America/Costa_Rica`). No usa API key.

## Uso

Abrí `index.html` en el navegador, o visitá la versión publicada.

## Stack

HTML estático + JavaScript. Sin build, sin dependencias.
