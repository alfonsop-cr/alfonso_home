# Alfonso (news.fut5belen.com)

Página estática de Alfonso: tipo de cambio, clima Belén y briefing de noticias (CR / AI / US / World).

**Live:** https://news.fut5belen.com

Host: GitHub Pages (`index.html`). Sin Notion token en el cliente.

## Estudiar → Notion

**☆ Estudiar** vive en la fila meta (`[hora] … [Estudiar]`, `padding-left: 36px`). En ~390 va debajo de la hora. No está dentro de `.visto-btn`. One-shot, sin modal.

Toasts: éxito `Tema enviado a Sheldon` (3–4 s) · error `No se pudo enviar`. Tras éxito el botón muestra `Enviado` y queda deshabilitado.

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

### Catch Hook / Zapier (Nora, AEL-style)

En `index.html`, `ESTUDIAR_WEBHOOK_URL` (vacío hasta que Zapier esté listo). Si falta, el toast es `No se pudo enviar` — no hay no-op silencioso. **Nunca pegar un token de Notion en el cliente.**

1. Crear Catch Hook (Zapier Webhooks).
2. Pegar la URL en `ESTUDIAR_WEBHOOK_URL`.
3. El Zap crea la fila en Temas de estudio, Status=`New`, con Name / Source URL / Tab / Resumen.
4. CORS: aceptar `POST` + `application/json` desde `https://news.fut5belen.com`.
5. **Sheldon:** el payload lleva `"notify": "sheldon"`. El Zap (o una automatización de Notion en Status=`New`) avisa a Sheldon. Pages no pinea al bot.

Payload:

```json
{
  "name": "…",
  "status": "New",
  "sourceUrl": "…",
  "tab": "cr|ai|us|world",
  "resumen": "…",
  "requestedAt": "ISO-8601",
  "notify": "sheldon"
}
```

`workers/estudiar/` queda como scaffold opcional (Cloudflare); el camino locked de Nora es el Catch Hook.

## Vistos

El control **visto** (bolita), **Mostrar vistas** y el sync `seen.json` no cambian. Estudiar no marca visto ni toca el gist.

## Clima Belén

Pronóstico de las próximas 24 horas para San Antonio de Belén, Heredia, Costa Rica. Datos de [Open-Meteo](https://open-meteo.com) (lat 9.9781, lon -84.1879, zona `America/Costa_Rica`). No usa API key.

## Uso

Abrí `index.html` en el navegador, o visitá la versión publicada.

## Stack

HTML estático + JavaScript. Sin build, sin dependencias. Estudiar sale por webhook (Zapier), no por token en Pages.
