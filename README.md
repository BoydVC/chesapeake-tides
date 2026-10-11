# Chesapeake Tides

Annapolis / Chesapeake Bay tide clock + moon phase wall display for the Boyd household (Millersville / Annapolis, MD). TokenMax burn build — home utility, not sports.

Prefers real public **NOAA CO-OPS** predictions for station **8575512 (Annapolis)**. If fetch fails, embeds a clearly labeled EXAMPLE/demo dataset and shows a banner.

## Screens

1. **Home** — analog-style tide clock, countdown to next high/low, moon phase, quick facts, today’s extremes  
2. **Curve** — SVG tide curve for today with now / high / low markers  
3. **Week** — 7-day high/low prediction table  
4. **About** — station notes, live vs demo source

## Run

```bash
./run.sh          # build + serve http://127.0.0.1:4301/
./run.sh --shots  # + screenshots/
```

Offline single file: `dist/chesapeake-tides.html`

## Layout

- `web/` — index.html, app.css, app.js  
- `data/tides.json` — live NOAA snapshot (when fetch works)  
- `data/tides-demo.json` — EXAMPLE fallback  
- `build.py` / `server.py` / `tests/screenshot.sh`


---
## Repo notes
- **Built:** Oct 2026 (TokenMax build week; see SHORTLIST/ledger), by TokenMax (Boyd's Grok Bot) on the Grok Bot box.
- **Run:** `./run.sh` (then open the localhost URL it prints).
- Imported from `/workspace/tokenmax/chesapeake-tides` on Oct 23, 2026. node_modules, virtualenvs, logs and files over 20 MB were left out.
