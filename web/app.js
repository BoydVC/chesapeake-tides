(function () {
  "use strict";

  const TZ = "America/New_York";
  const CIRC = 2 * Math.PI * 96; // ring radius 96

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function parseLocal(t) {
    // "YYYY-MM-DD HH:MM" as America/New_York civil time
    const [d, hm] = t.split(" ");
    const [Y, M, D] = d.split("-").map(Number);
    const [h, m] = hm.split(":").map(Number);
    // Build an ISO string with ET offset approximation via Intl
    const guess = new Date(Date.UTC(Y, M - 1, D, h, m));
    // Correct by reading ET parts of a candidate
    // Better: use temporal-free approach — create formatter and binary search
    return civilToDate(Y, M, D, h, m);
  }

  function civilToDate(Y, M, D, h, m) {
    // Find the UTC instant whose America/New_York parts equal Y-M-D h:m
    let utc = Date.UTC(Y, M - 1, D, h + 4, m); // EDT guess (+4)
    for (let i = 0; i < 4; i++) {
      const parts = etParts(new Date(utc));
      const want = (((Y * 12 + M) * 31 + D) * 24 + h) * 60 + m;
      const got =
        (((parts.Y * 12 + parts.M) * 31 + parts.D) * 24 + parts.h) * 60 +
        parts.m;
      utc += (want - got) * 60 * 1000;
    }
    return new Date(utc);
  }

  function etParts(dt) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const map = {};
    for (const p of fmt.formatToParts(dt)) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    let h = Number(map.hour);
    if (h === 24) h = 0;
    return {
      Y: Number(map.year),
      M: Number(map.month),
      D: Number(map.day),
      h,
      m: Number(map.minute),
    };
  }

  function fmtTime(dt) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(dt);
  }

  function fmtDay(dt) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(dt);
  }

  function fmtClock(dt) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(dt);
  }

  function fmtDateLong(dt) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(dt);
  }

  function dayKey(dt) {
    const p = etParts(dt);
    return `${p.Y}-${String(p.M).padStart(2, "0")}-${String(p.D).padStart(2, "0")}`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function countdownStr(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  }

  function typeLabel(t) {
    return t === "H" ? "HIGH" : "LOW";
  }

  let DATA = null;
  let extremes = [];
  let curve = [];

  function loadData() {
    if (window.__TIDES__ && window.__TIDES__.extremes) {
      return window.__TIDES__;
    }
    // fallback empty
    return {
      live: false,
      source: "EXAMPLE / demo (embedded)",
      station: { id: "8575512", name: "Annapolis, MD" },
      moon: { phase: "—", illumination: 0, age_days: 0, fraction: 0 },
      extremes: [],
      curve: [],
      note: "No tide data embedded.",
      fetched_at: new Date().toISOString(),
    };
  }

  function enrichExtremes(raw) {
    return raw.map((e) => ({
      ...e,
      at: parseLocal(e.t),
      height: Number(e.v),
    }));
  }

  function nextOfType(type, now) {
    return extremes.find((e) => e.type === type && e.at > now) || null;
  }

  function nextAny(now) {
    return extremes.find((e) => e.at > now) || null;
  }

  function prevExtreme(now) {
    let prev = null;
    for (const e of extremes) {
      if (e.at <= now) prev = e;
      else break;
    }
    return prev;
  }

  function setView(name) {
    $$(".tab").forEach((btn) => {
      const on = btn.dataset.view === name;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".view").forEach((v) => {
      const on = v.id === "view-" + name;
      v.classList.toggle("active", on);
      if (on) v.removeAttribute("hidden");
      else v.setAttribute("hidden", "");
    });
    if (location.hash.replace("#", "") !== name) {
      history.replaceState(null, "", "#" + name);
    }
    if (name === "curve") drawChart();
  }

  function bindNav() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });
    window.addEventListener("hashchange", () => {
      const h = location.hash.replace("#", "") || "home";
      if (["home", "curve", "week", "about"].includes(h)) setView(h);
    });
    const start = (location.hash || "#home").replace("#", "");
    setView(["home", "curve", "week", "about"].includes(start) ? start : "home");
  }

  function renderMoon() {
    const m = DATA.moon || {};
    $("#moonPhase").textContent = m.phase || "—";
    $("#moonIllum").textContent = `${Number(m.illumination || 0).toFixed(1)}% illuminated`;
    $("#moonAge").textContent = `Age ${Number(m.age_days || 0).toFixed(1)} days`;
    $("#moonDate").textContent = fmtDateLong(new Date());
    // shade: new moon more shaded, full less
    const frac = Number(m.fraction || 0);
    // illumination-based shade for CSS overlay
    const shade = 1 - Number(m.illumination || 0) / 100;
    $("#moonOrb").style.setProperty("--shade", String(0.15 + shade * 0.7));
  }

  function renderTodayExtremes(now) {
    const key = dayKey(now);
    const todays = extremes.filter((e) => dayKey(e.at) === key);
    const box = $("#todayExtremes");
    if (!todays.length) {
      box.innerHTML = '<p class="hint">No extremes for today in dataset.</p>';
      return;
    }
    box.innerHTML = todays
      .map(
        (e) => `
      <div class="ex-row">
        <span class="ex-badge ${e.type}">${typeLabel(e.type)}</span>
        <span class="ex-time">${fmtTime(e.at)}</span>
        <span class="ex-h">${e.height.toFixed(2)} ft</span>
      </div>`
      )
      .join("");
  }

  function renderWeek(now) {
    const tbody = $("#weekTable tbody");
    const todayKey = dayKey(now);
    let lastDay = "";
    tbody.innerHTML = extremes
      .map((e) => {
        const dk = dayKey(e.at);
        const day = dk === lastDay ? "" : fmtDay(e.at);
        const isToday = dk === todayKey;
        lastDay = dk;
        return `<tr class="${isToday ? "today" : ""}">
          <td class="day-cell">${day}${isToday && day ? " · today" : ""}</td>
          <td class="mono">${fmtTime(e.at)}</td>
          <td class="type-${e.type}">${typeLabel(e.type)}</td>
          <td class="mono">${e.height.toFixed(2)} ft</td>
        </tr>`;
      })
      .join("");
  }

  function renderAbout() {
    $("#aboutSource").textContent = DATA.source || "—";
    $("#aboutFetched").textContent = DATA.fetched_at
      ? new Date(DATA.fetched_at).toLocaleString("en-US", { timeZone: TZ })
      : "—";
    $("#aboutLive").textContent = DATA.live ? "Yes — NOAA CO-OPS" : "No — demo fallback";
    $("#aboutNote").textContent = DATA.note || "—";
  }

  function updateClock() {
    const now = new Date();
    $("#clockPill").textContent = fmtClock(now) + " ET";

    const next = nextAny(now);
    const nextH = nextOfType("H", now);
    const nextL = nextOfType("L", now);
    const prev = prevExtreme(now);

    if (next) {
      $("#nextLabel").textContent = "Next " + (next.type === "H" ? "high" : "low");
      $("#nextType").textContent = typeLabel(next.type);
      $("#nextHeight").textContent = next.height.toFixed(2) + " ft";
      $("#nextWhen").textContent = fmtTime(next.at) + " ET";
      const ms = next.at - now;
      $("#countdown").textContent = countdownStr(ms);

      // progress between prev and next
      let pct = 0.5;
      if (prev) {
        const span = next.at - prev.at;
        pct = span > 0 ? (now - prev.at) / span : 0.5;
      } else {
        pct = 0;
      }
      pct = Math.max(0, Math.min(1, pct));
      const ring = $("#ringProgress");
      if (ring) {
        ring.style.strokeDasharray = String(CIRC);
        ring.style.strokeDashoffset = String(CIRC * (1 - pct));
        ring.style.stroke = next.type === "H" ? "#38bdf8" : "#94a3b8";
      }
    } else {
      $("#nextType").textContent = "—";
      $("#nextHeight").textContent = "—";
      $("#nextWhen").textContent = "end of dataset";
      $("#countdown").textContent = "00:00:00";
    }

    if (nextH) {
      $("#nextHigh").textContent = nextH.height.toFixed(2) + " ft";
      $("#nextHighSub").textContent = fmtTime(nextH.at) + " · " + countdownStr(nextH.at - now);
    }
    if (nextL) {
      $("#nextLow").textContent = nextL.height.toFixed(2) + " ft";
      $("#nextLowSub").textContent = fmtTime(nextL.at) + " · " + countdownStr(nextL.at - now);
    }

    renderTodayExtremes(now);
  }

  function drawChart() {
    const svg = $("#tideChart");
    if (!svg) return;
    const now = new Date();
    const key = dayKey(now);
    const pts = curve
      .map((p) => ({ at: parseLocal(p.t), v: Number(p.v), t: p.t }))
      .filter((p) => dayKey(p.at) === key);

    const W = 900, H = 360;
    const pad = { l: 52, r: 24, t: 28, b: 48 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    if (!pts.length) {
      svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" fill="#8fb3cc" text-anchor="middle" font-size="16">No curve points for today</text>`;
      $("#chartMeta").textContent = "No data";
      return;
    }

    const vs = pts.map((p) => p.v);
    let vmin = Math.min(...vs);
    let vmax = Math.max(...vs);
    const padY = Math.max(0.15, (vmax - vmin) * 0.15);
    vmin -= padY;
    vmax += padY;

    const t0 = pts[0].at.getTime();
    const t1 = pts[pts.length - 1].at.getTime();

    const xOf = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * iw;
    const yOf = (v) => pad.t + (1 - (v - vmin) / (vmax - vmin || 1)) * ih;

    const path = pts
      .map((p, i) => `${i ? "L" : "M"}${xOf(p.at.getTime()).toFixed(1)},${yOf(p.v).toFixed(1)}`)
      .join(" ");

    // area fill
    const area =
      path +
      ` L${xOf(pts[pts.length - 1].at.getTime()).toFixed(1)},${(pad.t + ih).toFixed(1)}` +
      ` L${xOf(pts[0].at.getTime()).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

    // gridlines
    const yTicks = 5;
    let grids = "";
    for (let i = 0; i <= yTicks; i++) {
      const v = vmin + ((vmax - vmin) * i) / yTicks;
      const y = yOf(v);
      grids += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="rgba(148,163,184,0.12)" />`;
      grids += `<text x="${pad.l - 8}" y="${(y + 4).toFixed(1)}" fill="#8fb3cc" font-size="11" text-anchor="end">${v.toFixed(1)}</text>`;
    }

    // hour labels
    let xLabels = "";
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i];
      const x = xOf(p.at.getTime());
      xLabels += `<text x="${x.toFixed(1)}" y="${H - 16}" fill="#8fb3cc" font-size="11" text-anchor="middle">${fmtTime(p.at).replace(" ", "")}</text>`;
    }

    // extremes markers for today
    const todays = extremes.filter((e) => dayKey(e.at) === key);
    let marks = "";
    for (const e of todays) {
      const x = xOf(e.at.getTime());
      const y = yOf(e.height);
      const col = e.type === "H" ? "#7dd3fc" : "#94a3b8";
      marks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${col}" stroke="#06101c" stroke-width="2"/>`;
      marks += `<text x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" fill="${col}" font-size="11" text-anchor="middle" font-weight="700">${e.type} ${e.height.toFixed(2)}</text>`;
    }

    // now marker
    let nowMark = "";
    if (now >= pts[0].at && now <= pts[pts.length - 1].at) {
      const x = xOf(now.getTime());
      // interpolate height
      let hv = pts[0].v;
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].at >= now) {
          const a = pts[i - 1], b = pts[i];
          const f = (now - a.at) / (b.at - a.at || 1);
          hv = a.v + (b.v - a.v) * f;
          break;
        }
      }
      const y = yOf(hv);
      nowMark = `
        <line x1="${x.toFixed(1)}" y1="${pad.t}" x2="${x.toFixed(1)}" y2="${pad.t + ih}" stroke="#fde68a" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.85"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#fde68a" stroke="#06101c" stroke-width="2"/>
        <text x="${(x + 8).toFixed(1)}" y="${(y - 10).toFixed(1)}" fill="#fde68a" font-size="12" font-weight="700">now ${hv.toFixed(2)} ft</text>`;
    }

    svg.innerHTML = `
      <defs>
        <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#38bdf8" stop-opacity="0.35"/>
          <stop offset="1" stop-color="#38bdf8" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${grids}
      <path d="${area}" fill="url(#tideFill)"/>
      <path d="${path}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round"/>
      ${xLabels}
      ${marks}
      ${nowMark}
      <text x="${pad.l}" y="18" fill="#8fb3cc" font-size="12">ft MLLW</text>
    `;

    const lo = Math.min(...vs).toFixed(2);
    const hi = Math.max(...vs).toFixed(2);
    $("#chartMeta").textContent = `${fmtDateLong(now)} · range ${lo}–${hi} ft · ${pts.length} points · ${DATA.live ? "NOAA live" : "demo"}`;
  }

  function applyDataBanner() {
    const live = !!DATA.live;
    const pill = $("#dataPill");
    pill.textContent = live ? "NOAA live" : "demo data";
    pill.classList.toggle("live", live);
    pill.classList.toggle("demo", !live);
    const ban = $("#demoBanner");
    if (!live) ban.removeAttribute("hidden");
    else ban.setAttribute("hidden", "");
    $("#footStatus").textContent = live
      ? `NOAA CO-OPS · ${DATA.station?.name || "Annapolis"} · fetched ${DATA.fetched_at || ""}`
      : "Demo data — live NOAA fetch unavailable";
  }

  function init() {
    DATA = loadData();
    extremes = enrichExtremes(DATA.extremes || []);
    extremes.sort((a, b) => a.at - b.at);
    curve = DATA.curve || [];

    applyDataBanner();
    renderMoon();
    renderWeek(new Date());
    renderAbout();
    bindNav();
    updateClock();
    drawChart();
    setInterval(updateClock, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
