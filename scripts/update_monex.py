#!/usr/bin/env python3
"""Fetch official BCCR MONEX session summary (cuadro 770) and write monex.json."""
from __future__ import annotations

import json
import re
import ssl
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

URL = (
    "https://gee.bccr.fi.cr/indicadoreseconomicos/Cuadros/"
    "frmVerCatCuadro.aspx?CodCuadro=770&idioma=1"
)
OUT = Path("monex.json")

MONTHS = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


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


def parse_cr_number(text: str) -> float | None:
    t = text.strip().replace("\xa0", "").replace(" ", "")
    if not t or t in (".", "-"):
        return None
    t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def parse_date(text: str) -> tuple[str, str] | None:
    m = re.search(r"(\d{1,2})\s+([A-Za-záéíóú]+)\s+(\d{4})", text, re.I)
    if not m:
        return None
    day = int(m.group(1))
    mon = MONTHS.get(m.group(2).lower()[:3])
    year = int(m.group(3))
    if not mon:
        return None
    iso = f"{year:04d}-{mon:02d}-{day:02d}"
    meses = "ene feb mar abr may jun jul ago set oct nov dic".split()
    return iso, f"{day} {meses[mon - 1]} {year}"


def last_nonzero(values: list[float | None]) -> tuple[int, float] | None:
    for i in range(len(values) - 1, -1, -1):
        v = values[i]
        if v is not None and v != 0:
            return i, v
    return None


def fetch_html() -> str:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; clima-belen/1.0)",
            "Accept": "text/html",
        },
    )
    with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extract(html: str) -> dict:
    parser = TableParser()
    parser.feed(html)

    dates: list[tuple[str, str]] = []
    rows_by_label: dict[str, list[float | None]] = {}

    for row in parser.rows:
        if not dates:
            found = [parse_date(c) for c in row]
            found = [d for d in found if d]
            if len(found) >= 2:
                dates = found
                continue
        label = re.sub(r"\s+", " ", row[0]).strip().lower()
        if label.startswith("monto negociado") or label.startswith("mejores ofertas"):
            break
        nums = [parse_cr_number(c) for c in row[1:]]
        if any(n is not None for n in nums) and label not in rows_by_label:
            rows_by_label[label] = nums

    pond = None
    for key, nums in rows_by_label.items():
        if "promedio ponderado" in key and "anterior" not in key:
            pond = last_nonzero(nums)
            break
    if not pond:
        raise SystemExit("No encontré promedio ponderado en el cuadro 770")

    idx, promedio = pond

    def pick(substr: str) -> float | None:
        for key, nums in rows_by_label.items():
            if substr in key and "monto" not in key and "oferta" not in key:
                if idx < len(nums) and nums[idx] is not None:
                    return nums[idx]
        return None

    minimo = pick("mínimo") or pick("minimo")
    maximo = pick("máximo") or pick("maximo")
    if minimo is None or maximo is None:
        raise SystemExit("No encontré mínimo/máximo de tipo de cambio")

    if idx < len(dates):
        fecha, fecha_texto = dates[idx]
    else:
        fecha, fecha_texto = datetime.now(timezone.utc).strftime("%Y-%m-%d"), "sesión reciente"

    return {
        "fecha": fecha,
        "fechaTexto": fecha_texto,
        "promedioPonderado": round(promedio, 2),
        "minimo": round(minimo, 2),
        "maximo": round(maximo, 2),
        "fuente": "BCCR / MONEX",
        "fuenteUrl": URL,
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main() -> None:
    html = fetch_html()
    data = extract(html)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False))


if __name__ == "__main__":
    main()
