# Alfonso (news.fut5belen.com)

Página estática de Alfonso: tipo de cambio, clima Belén y briefing de noticias (CR / AI / US / World).

**Live:** https://news.fut5belen.com

Host: GitHub Pages (`index.html`). Sin build, sin dependencias, sin secretos en el cliente.

## Estudiar → Notion

Cada hecho tiene **Estudiar** (acción secundaria, al lado de **visto**). Al tocarlo, el navegador hace `POST` a un webhook público. **El token de Notion nunca va en este repo ni en el JS del cliente.**

### Destino Notion (locked)

- Base: [Temas de estudio](https://app.notion.com/p/e407609f7e654551863dee4809d0b73c)
- Database id: `e407609f-7e65-4551-863d-ee4809d0b73c`
- Data source: `collection://c65e34d4-0d4a-4d8d-aff1-4f4094ffd106`

| Propiedad | Valor al crear |
| --- | --- |
| Name | título del hecho |
| Status | `New` |
| Source URL | URL de la primera fuente (si hay) |
| Tab | select Notion: `Costa Rica` / `AI` / `US` / `World` |
| Resumen | texto corto del card (si hay) |
| Briefing | vacío |
| Created | default de Notion |

### Qué debe cablear Nora / Zapier

En `index.html`, constante `ESTUDIAR_WEBHOOK_URL` (arriba del JS). Hoy está vacía: el botón falla con un mensaje claro en español hasta que haya un Catch Hook.

1. Crear un **Zapier Catch Hook** (o webhook equivalente) y pegar la URL en `ESTUDIAR_WEBHOOK_URL`.
2. El hook debe aceptar `POST` desde el navegador en `https://news.fut5belen.com` (**CORS** + `Content-Type: application/json`).
3. Crear una fila en Temas de estudio con el mapeo de abajo.
4. **Ping Sheldon:** no se puede hacer desde GitHub Pages hacia Grok Bot. Opciones:
   - (preferida) automatización de Notion cuando Status = `New` notifica a Sheldon, **o**
   - el Zap lee `"notify": "sheldon"` y hace fan-out (Slack / el canal que usen).

Payload que envía el cliente:

```json
{
  "name": "…",
  "status": "New",
  "sourceUrl": "…",
  "tab": "cr|ai|us|world",
  "tabLabel": "Costa Rica|AI|US|World",
  "resumen": "…",
  "requestedAt": "ISO-8601",
  "notify": "sheldon"
}
```

Mapeo `tab` (id de la UI) → select de Notion:

| `tab` | Tab en Notion |
| --- | --- |
| `cr` | Costa Rica |
| `ai` | AI |
| `us` | US |
| `world` | World |

Doble tap puede crear dos filas (scaffold; no hay idempotencia).

## Vistos

El control **visto** y el sync `seen.json` (gist + token local) no cambian. Estudiar no marca visto ni toca el gist.

## Clima Belén

Pronóstico de las próximas 24 horas para San Antonio de Belén, Heredia, Costa Rica. Datos de [Open-Meteo](https://open-meteo.com) (lat 9.9781, lon -84.1879, zona `America/Costa_Rica`). No usa API key.

## Uso

Abrí `index.html` en el navegador, o visitá la versión publicada.

## Stack

HTML estático + JavaScript. Sin build, sin dependencias.
