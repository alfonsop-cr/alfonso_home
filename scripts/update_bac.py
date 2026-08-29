#!/usr/bin/env python3
"""Fetch official BAC San José ventanilla rates from the BCCR table."""
from __future__ import annotations

import json
import re
import ssl
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

URL = (
    "https://gee.bccr.fi.cr/IndicadoresEconomicos/Cuadros/"
    "frmConsultaTCVentanilla.aspx"
)
OUT = Path("bac.json")

MONTHS_ES = "ene feb mar abr may jun jul ago set oct nov dic".split()


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
    if not t:
        return None
    t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def parse_update(text: str) -> tuple[str, str, str]:
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}:\d{2}\s*[ap]\.m\.))?", text, re.I)
    if not m:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return today, today, ""
    day, mon, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    iso = f"{year:04d}-{mon:02d}-{day:02d}"
    texto = f"{day} {MONTHS_ES[mon - 1]} {year}"
    hora = (m.group(4) or "").strip()
    return iso, texto, hora


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
    row = None
    for r in parser.rows:
        joined = " ".join(r).lower()
        if "bac san jos" in joined or "bac san jose" in joined:
            row = r
            break
    if not row:
        raise SystemExit("No encontré Banco BAC San José en la tabla de ventanilla")

    nums = [parse_cr_number(c) for c in row]
    nums = [n for n in nums if n is not None]
    # Compra, Venta, Diferencial — first two money-like values near 400-500
    rates = [n for n in nums if 300 <= n <= 700]
    if len(rates) < 2:
        raise SystemExit("No pude leer compra/venta de BAC")
    compra, venta = rates[0], rates[1]

    fecha, fecha_texto, hora = parse_update(" ".join(row))
    return {
        "banco": "BAC San José",
        "compra": round(compra, 2),
        "venta": round(venta, 2),
        "fecha": fecha,
        "fechaTexto": fecha_texto,
        "horaTexto": hora,
        "fuente": "Ventanilla BAC San José (anunciada al BCCR)",
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
