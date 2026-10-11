#!/usr/bin/env python3
"""Inline web/ + data/tides.json into one offline file: dist/chesapeake-tides.html."""
import json
import os
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ET = ZoneInfo("America/New_York")
STATION = "8575512"


def rd(rel):
    with open(os.path.join(HERE, rel), encoding="utf-8") as f:
        return f.read()


def moon_phase(dt):
    import math
    from datetime import timezone

    jd = dt.astimezone(timezone.utc).timestamp() / 86400.0 + 2440587.5
    synodic = 29.530588853
    age = (jd - 2451550.1) % synodic
    if age < 0:
        age += synodic
    illum = (1 - math.cos(2 * math.pi * age / synodic)) / 2
    frac = age / synodic
    if frac < 0.03 or frac > 0.97:
        name = "New Moon"
    elif frac < 0.22:
        name = "Waxing Crescent"
    elif frac < 0.28:
        name = "First Quarter"
    elif frac < 0.47:
        name = "Waxing Gibbous"
    elif frac < 0.53:
        name = "Full Moon"
    elif frac < 0.72:
        name = "Waning Gibbous"
    elif frac < 0.78:
        name = "Last Quarter"
    else:
        name = "Waning Crescent"
    return {
        "age_days": round(age, 2),
        "illumination": round(illum * 100, 1),
        "phase": name,
        "fraction": round(frac, 4),
    }


def noaa_url(product, begin, end, interval):
    return (
        "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
        f"?product={product}&application=ChesapeakeTides"
        f"&begin_date={begin}&end_date={end}&datum=MLLW&station={STATION}"
        f"&time_zone=lst_ldt&units=english&interval={interval}&format=json"
    )


def fetch_live():
    now = datetime.now(ET)
    begin = now.strftime("%Y%m%d")
    end = (now + timedelta(days=6)).strftime("%Y%m%d")
    with urllib.request.urlopen(noaa_url("predictions", begin, end, "hilo"), timeout=18) as r:
        hilo = json.loads(r.read().decode())
    with urllib.request.urlopen(noaa_url("predictions", begin, end, "30"), timeout=18) as r:
        curve = json.loads(r.read().decode())
    extremes = [
        {"t": p["t"], "v": round(float(p["v"]), 3), "type": p["type"]}
        for p in hilo.get("predictions", [])
    ]
    curve_pts = [
        {"t": p["t"], "v": round(float(p["v"]), 3)} for p in curve.get("predictions", [])
    ]
    if not extremes or not curve_pts:
        raise RuntimeError("empty NOAA predictions")
    return {
        "source": "NOAA CO-OPS",
        "live": True,
        "fetched_at": now.isoformat(timespec="seconds"),
        "station": {
            "id": STATION,
            "name": "Annapolis, MD",
            "lat": 38.9833,
            "lon": -76.4800,
            "datum": "MLLW",
            "units": "feet",
            "timezone": "America/New_York",
        },
        "note": (
            "Chesapeake Bay tides at Annapolis are semi-diurnal with a modest range "
            "(~1–2 ft typical). Predictions are harmonic; wind and pressure can shift "
            "real water levels."
        ),
        "moon": moon_phase(now),
        "extremes": extremes,
        "curve": curve_pts,
    }


def load_or_fetch():
    demo_path = os.path.join(HERE, "data", "tides-demo.json")
    live_path = os.path.join(HERE, "data", "tides.json")
    try:
        data = fetch_live()
        with open(live_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        # keep demo as labeled copy of last good shape if missing
        if not os.path.isfile(demo_path):
            demo = dict(data)
            demo["source"] = "EXAMPLE / demo (embedded)"
            demo["live"] = False
            demo["note"] = (
                "Demo fallback dataset for Annapolis station 8575512. "
                "Not live NOAA. Use only when network fetch fails."
            )
            with open(demo_path, "w", encoding="utf-8") as f:
                json.dump(demo, f, indent=2)
        print(f"NOAA live · extremes={len(data['extremes'])} curve={len(data['curve'])}")
        return data
    except Exception as ex:
        print(f"NOAA fetch failed ({ex}); using demo fallback")
        if os.path.isfile(demo_path):
            with open(demo_path, encoding="utf-8") as f:
                data = json.load(f)
        elif os.path.isfile(live_path):
            with open(live_path, encoding="utf-8") as f:
                data = json.load(f)
            data["live"] = False
            data["source"] = "EXAMPLE / demo (embedded)"
        else:
            raise SystemExit("no tide data available")
        data["live"] = False
        if "EXAMPLE" not in data.get("source", ""):
            data["source"] = "EXAMPLE / demo (embedded)"
        return data


def main():
    tides = load_or_fetch()
    tides_js = json.dumps(tides, ensure_ascii=False)
    html = rd("web/index.html")
    html = html.replace("/*__CSS__*/", rd("web/app.css"))
    html = html.replace("/*__TIDES__*/ null /*__/TIDES__*/", tides_js)
    app = rd("web/app.js").replace("</script", "<\\/script")
    html = html.replace("/*__APP__*/", app)
    os.makedirs(os.path.join(HERE, "dist"), exist_ok=True)
    out = os.path.join(HERE, "dist", "chesapeake-tides.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    mode = "live NOAA" if tides.get("live") else "demo"
    print(f"built {out} ({os.path.getsize(out):,} bytes) · {mode}")


if __name__ == "__main__":
    main()
