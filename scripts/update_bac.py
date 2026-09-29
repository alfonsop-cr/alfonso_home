#!/usr/bin/env python3
"""Fetch BAC San José ventanilla buy/sell rates and write bac.json.

Primary source: BCCR SDDE (the public site that replaced
frmConsultaTCVentanilla.aspx, which now returns HTTP 404). The cuadro is
"Lista de intermediarios cambiarios autorizados y sus tipos de cambio
vigentes de ventanilla" (idGrupoVariable 1015, estructura 2039).

Fallbacks, in order, only if SDDE fails:
- the legacy ASPX table, in case it comes back
- BAC sucursalelectronica XML (often 403/timeout from datacenter IPs)
"""
from __future__ import annotations

import json
import re
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

OUT = Path("bac.json")
CR = ZoneInfo("America/Costa_Rica")
MONTHS_ES = "ene feb mar abr may jun jul ago set oct nov dic".split()

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
SDDE_ORIGIN = "https://sdd.bccr.fi.cr"
SDDE_CSRF = (
    "https://apim.bccr.fi.cr/SDDE/api/"
    "Bccr.GE.SDDE.IndicadoresSitioExterno.ServiciosUsuario.API/Token/GenereCSRF"
)
SDDE_SEARCH = (
    "https://apim.bccr.fi.cr/SDDE/api/"
    "Bccr.GE.SDDE.IndicadoresSitioExterno.Buscador.API/"
    "Buscador/ObtengaResultados/ventanilla/ES/0"
)
SDDE_CUADRO = (
    "https://apim.bccr.fi.cr/SDDE/api/"
    "Bccr.GE.SDDE.IndicadoresSitioExterno.GrupoVariables.API/"
    "CuadroPersonalizadoGrupoVariables/ObtenerDatosCuadroPersonalizado"
)
# Public identifiers from the SDDE buscador (tipo de cambio vigentes de ventanilla).
DEFAULT_GRUPO = 1015
DEFAULT_ESTRUCTURA = 2039
PAGE_URL = (
    "https://sdd.bccr.fi.cr/es/IndicadoresEconomicos/Inicio/Personalizado/{estructura}"
)
LEGACY_URL = (
    "https://gee.bccr.fi.cr/IndicadoresEconomicos/Cuadros/"
    "frmConsultaTCVentanilla.aspx"
)
BAC_XML_URL = "https://www.sucursalelectronica.com/exchangerate/showXmlExchangeRate.do"

FUENTE_SDDE = "Ventanilla BAC San José (BCCR SDDE)"
FUENTE_LEGACY = "Ventanilla BAC San José (anunciada al BCCR)"
FUENTE_XML = "Ventanilla BAC San José (sucursalelectronica)"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._row is not None:
            text = re.sub(r"\s+", " ", "".join(self._cell)).strip()
            self._row.append(text)
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if any(self._row):
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


class SourceError(RuntimeError):
    pass


def http_get(url: str, headers: dict[str, str], timeout: int) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers=headers)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        body = e.read()[:180] if e.fp else b""
        raise SourceError(f"HTTP {e.code} {url} {body!r}") from e
    except urllib.error.URLError as e:
        raise SourceError(f"URLError {url} {e.reason}") from e
    except TimeoutError as e:
        raise SourceError(f"timeout {url}") from e


def browser_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CR,es;q=0.9,en;q=0.8",
    }
    if extra:
        headers.update(extra)
    return headers


def parse_cr_number(text: str) -> float | None:
    t = text.strip().replace("\xa0", "").replace(" ", "")
    if not t or t in (".", "-"):
        return None
    t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def parse_source_stamp(text: str) -> tuple[str, str, str] | None:
    m = re.search(
        r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}:\d{2}\s*[ap]\.m\.))?",
        text,
        re.I,
    )
    if not m:
        return None
    day, mon, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not 1 <= mon <= 12:
        return None
    iso = f"{year:04d}-{mon:02d}-{day:02d}"
    texto = f"{day} {MONTHS_ES[mon - 1]} {year}"
    hora = re.sub(r"\s+", " ", (m.group(4) or "")).strip()
    return iso, texto, hora


def cr_read_stamp() -> tuple[str, str, str]:
    now = datetime.now(CR)
    iso = now.strftime("%Y-%m-%d")
    texto = f"{now.day} {MONTHS_ES[now.month - 1]} {now.year}"
    hour24 = now.hour
    suffix = "a.m." if hour24 < 12 else "p.m."
    hour12 = hour24 % 12 or 12
    hora = f"{hour12:02d}:{now.minute:02d} {suffix}"
    return iso, texto, hora


def stamp_or_read_time(text: str) -> tuple[str, str, str]:
    return parse_source_stamp(text) or cr_read_stamp()


def build_record(
    compra: float,
    venta: float,
    stamp_text: str,
    fuente: str,
    fuente_url: str,
) -> dict:
    if not (200 <= compra <= 1000 and 200 <= venta <= 1000 and venta > compra):
        raise SourceError(f"compra/venta fuera de rango: {compra} / {venta}")
    fecha, fecha_texto, hora = stamp_or_read_time(stamp_text)
    return {
        "banco": "BAC San José",
        "compra": round(compra, 2),
        "venta": round(venta, 2),
        "fecha": fecha,
        "fechaTexto": fecha_texto,
        "horaTexto": hora,
        "fuente": fuente,
        "fuenteUrl": fuente_url,
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def sdde_headers(token: str | None = None) -> dict[str, str]:
    headers = browser_headers(
        {
            "Accept": "application/json, text/plain, */*",
            "Origin": SDDE_ORIGIN,
            "Referer": SDDE_ORIGIN + "/es/IndicadoresEconomicos/Inicio/",
        }
    )
    if token:
        headers["Token_CSRF"] = token
    return headers


def sdde_token() -> str:
    status, body = http_get(SDDE_CSRF, sdde_headers(), timeout=30)
    token = body.decode("utf-8", errors="replace").strip().strip('"')
    if status != 200 or len(token) < 20:
        raise SourceError(f"CSRF HTTP {status} token vacío")
    return token


def discover_ids(token: str) -> tuple[int, int]:
    _status, body = http_get(SDDE_SEARCH, sdde_headers(token), timeout=30)
    try:
        items = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as e:
        raise SourceError(f"buscador SDDE no devolvió JSON: {e}") from e
    if not isinstance(items, list):
        raise SourceError("buscador SDDE inesperado")
    for item in items:
        title = str(item.get("tituloEspanol") or "").lower()
        if "tipos de cambio vigentes de ventanilla" not in title:
            continue
        grupo = item.get("idObjeto")
        estructura = item.get("idEnlace")
        if isinstance(grupo, int) and isinstance(estructura, int) and grupo and estructura:
            return grupo, estructura
    raise SourceError("el buscador SDDE no devolvió el cuadro de ventanilla")


def bac_from_indicadores(indicadores: list, fuente_url: str) -> dict:
    rows: list[list[str]] = []
    for row in indicadores:
        if not isinstance(row, list):
            continue
        texts = [str((cell or {}).get("valorEspanol") or "").strip() for cell in row]
        if any(texts):
            rows.append(texts)
    header_idx = None
    for i, texts in enumerate(rows):
        low = " ".join(texts).lower()
        if "compra" in low and "venta" in low:
            header_idx = i
            break
    if header_idx is None:
        raise SourceError("el cuadro SDDE no trae columnas Compra/Venta")
    header = [c.lower() for c in rows[header_idx]]

    def col(name: str) -> int | None:
        for i, cell in enumerate(header):
            if name in cell:
                return i
        return None

    i_compra = col("compra")
    i_venta = col("venta")
    i_fecha = col("actualiza")
    if i_compra is None or i_venta is None:
        raise SourceError("no ubiqué columnas Compra/Venta en el cuadro SDDE")

    bac = None
    for texts in rows[header_idx + 1 :]:
        if "bac san jos" in " ".join(texts).lower():
            bac = texts
            break
    if not bac:
        raise SourceError("no encontré Banco BAC San José en el cuadro SDDE")

    def cell(i: int | None) -> str:
        if i is None or i >= len(bac):
            return ""
        return bac[i]

    compra = parse_cr_number(cell(i_compra))
    venta = parse_cr_number(cell(i_venta))
    if compra is None or venta is None:
        raise SourceError(f"no pude leer compra/venta de BAC: {bac}")
    return build_record(compra, venta, cell(i_fecha), FUENTE_SDDE, fuente_url)


def fetch_sdde_cuadro(token: str, grupo: int, estructura: int) -> dict:
    today = datetime.now(CR).strftime("%Y-%m-%d")
    url = f"{SDDE_CUADRO}?idGrupoVariable={grupo}&fechaAConsultar={today}"
    _status, body = http_get(url, sdde_headers(token), timeout=30)
    try:
        payload = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as e:
        raise SourceError(f"cuadro SDDE no devolvió JSON: {e}") from e
    datos = payload.get("datos") if isinstance(payload, dict) else None
    indicadores = datos.get("indicadores") if isinstance(datos, dict) else None
    if not payload.get("estado") or not indicadores:
        raise SourceError(
            f"cuadro SDDE vacío (estado={payload.get('estado')!r}, "
            f"mensaje={payload.get('mensaje')!r})"
        )
    return bac_from_indicadores(indicadores, PAGE_URL.format(estructura=estructura))


def fetch_sdde() -> dict:
    token = sdde_token()
    try:
        return fetch_sdde_cuadro(token, DEFAULT_GRUPO, DEFAULT_ESTRUCTURA)
    except SourceError as first:
        grupo, estructura = discover_ids(token)
        if grupo == DEFAULT_GRUPO and estructura == DEFAULT_ESTRUCTURA:
            raise first
        return fetch_sdde_cuadro(token, grupo, estructura)


def fetch_legacy() -> dict:
    _status, body = http_get(
        LEGACY_URL,
        browser_headers({"Accept": "text/html"}),
        timeout=30,
    )
    html = body.decode("utf-8", errors="replace")
    parser = TableParser()
    parser.feed(html)
    row = None
    for cells in parser.rows:
        joined = " ".join(cells).lower()
        if "bac san jos" in joined or "bac san jose" in joined:
            row = cells
            break
    if not row:
        raise SourceError("la tabla legacy no incluye BAC San José")
    rates = [n for n in (parse_cr_number(c) for c in row) if n is not None and 200 <= n <= 1000]
    if len(rates) < 2:
        raise SourceError("no pude leer compra/venta en la tabla legacy")
    return build_record(rates[0], rates[1], " ".join(row), FUENTE_LEGACY, LEGACY_URL)


def fetch_bac_xml() -> dict:
    _status, body = http_get(
        BAC_XML_URL,
        browser_headers(
            {
                "Accept": "application/xml,text/xml,*/*;q=0.8",
                "Referer": "https://www.sucursalelectronica.com/",
            }
        ),
        timeout=15,
    )
    text = body.decode("utf-8", errors="replace")
    if "<" not in text:
        raise SourceError("respuesta XML vacía o no XML")

    def tag(name: str) -> str | None:
        m = re.search(rf"<{name}[^>]*>\s*([^<]+?)\s*</{name}>", text, re.I)
        return m.group(1).strip() if m else None

    compra = parse_cr_number(tag("buyRate") or tag("compra") or "")
    venta = parse_cr_number(tag("sellRate") or tag("venta") or "")
    if compra is None or venta is None:
        raise SourceError("el XML no trae buyRate/sellRate")
    stamp = " ".join(p for p in (tag("date"), tag("fecha"), tag("time")) if p)
    return build_record(compra, venta, stamp, FUENTE_XML, BAC_XML_URL)


def main() -> None:
    errors: list[str] = []
    data = None
    for name, fn in (("sdde", fetch_sdde), ("legacy-bccr", fetch_legacy), ("bac-xml", fetch_bac_xml)):
        try:
            data = fn()
            print(f"fuente-ok {name}", flush=True)
            break
        except Exception as e:
            errors.append(f"{name}: {type(e).__name__}: {e}")
            print(f"fuente-fail {name}: {type(e).__name__}: {e}", flush=True)
    if data is None:
        raise SystemExit("No pude leer la ventanilla BAC\n" + "\n".join(errors))
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False))


if __name__ == "__main__":
    main()
