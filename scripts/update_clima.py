#!/usr/bin/env python3
"""Fetch Belén forecast from Open-Meteo and write clima.json (hourly Action cache)."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LAT = 9.9781
LON = -84.1879
HOURLY_FIELDS = (
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation_probability",
    "weather_code",
    "wind_speed_10m",
)
URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={LAT}&longitude={LON}"
    "&hourly=" + ",".join(HOURLY_FIELDS)
    + "&timezone=America%2FCosta_Rica"
    + "&forecast_days=3"
)
OUT = Path("clima.json")
UA = "Mozilla/5.0 (compatible; clima-belen/1.0)"


def fetch_open_meteo() -> dict:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        URL,
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if getattr(resp, "status", 200) != 200:
                raise SystemExit(f"Open-Meteo HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Open-Meteo HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Open-Meteo network: {exc.reason}") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Open-Meteo JSON inválido: {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit("Open-Meteo: respuesta no es un objeto")
    return data


def build_clima(data: dict, when: datetime | None = None) -> dict:
    hourly_in = data.get("hourly")
    if not isinstance(hourly_in, dict):
        raise SystemExit("Open-Meteo: falta hourly")
    times = hourly_in.get("time")
    if not isinstance(times, list) or not times:
        raise SystemExit("Open-Meteo: hourly.time vacío")
    hourly: dict = {"time": times}
    n = len(times)
    for key in HOURLY_FIELDS:
        series = hourly_in.get(key)
        if not isinstance(series, list) or len(series) != n:
            raise SystemExit(f"Open-Meteo: hourly.{key} inválido")
        hourly[key] = series
    stamp = (when or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "latitude": LAT,
        "longitude": LON,
        "timezone": "America/Costa_Rica",
        "hourly": hourly,
        "fuente": "Open-Meteo",
        "fuenteUrl": "https://open-meteo.com",
        "actualizado": stamp,
    }


def write_clima(payload: dict) -> None:
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def keep_last(reason: str) -> bool:
    if OUT.exists():
        print(f"keep last {OUT}: {reason}", file=sys.stderr)
        return True
    return False


def _self_check() -> None:
    sample = {
        "hourly": {
            "time": ["2026-09-10T10:00", "2026-09-10T11:00"],
            "temperature_2m": [24.1, 25.0],
            "relative_humidity_2m": [80, 78],
            "precipitation_probability": [40, 20],
            "weather_code": [3, 1],
            "wind_speed_10m": [8.2, 7.0],
        }
    }
    out = build_clima(sample, when=datetime(2026, 9, 10, 16, 10, tzinfo=timezone.utc))
    assert out["latitude"] == LAT
    assert out["timezone"] == "America/Costa_Rica"
    assert out["hourly"]["time"] == sample["hourly"]["time"]
    assert out["actualizado"] == "2026-09-10T16:10:00Z"
    try:
        build_clima({"hourly": {"time": []}})
        raise AssertionError("empty time should fail")
    except SystemExit:
        pass
    print("self-check ok")


def main() -> int:
    if "--self-check" in sys.argv:
        _self_check()
        return 0
    try:
        payload = build_clima(fetch_open_meteo())
    except SystemExit as exc:
        if keep_last(str(exc)):
            return 0
        raise
    write_clima(payload)
    print(json.dumps({"actualizado": payload["actualizado"], "hours": len(payload["hourly"]["time"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
