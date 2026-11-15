// DOM rendering. No fetching or business rules here.

import { ERROR_COPY } from "./api.js";
import { personalityFromResponse } from "./personality.js";

const $ = (id) => document.getElementById(id);

export const POPULAR_CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai",
  "Kolkata", "Pune", "Ahmedabad", "New York", "London",
];

const el = {
  input: $("city-input"),
  hint: $("search-hint"),
  chips: $("chips"),
  status: $("status"),
  stage: $("stage"),
  loading: $("loading"),
  error: $("error"),
  errorTitle: $("error-title"),
  errorMsg: $("error-message"),
  retryBtn: $("retry-btn"),
  backBtn: $("back-btn"),
  backCity: $("back-city"),
  weather: $("weather"),
  jsonView: $("json-view"),
  copyBtn: $("copy-btn"),
};

let clockTimer = null;

/* ---------- helpers ---------- */

const fmt = (n, digits = 0) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";

function setText(id, value) {
  $(id).textContent = value;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function normalizeIconUrl(url) {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

export function formatLocalTime(tzId, now = new Date()) {
  try {
    const time = new Intl.DateTimeFormat("en-IN", {
      timeZone: tzId, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
    }).format(now);
    const zone = new Intl.DateTimeFormat("en-US", {
      timeZone: tzId, timeZoneName: "short",
    }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
    return { time, zone: zone ? `${tzId} (${zone})` : tzId };
  } catch {
    return { time: "—", zone: tzId || "—" };
  }
}

/** Syntax-highlight pretty-printed JSON (safe: input is escaped first). */
export function highlightJson(pretty) {
  return escapeHtml(pretty).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, lit, num) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (lit) return `<span class="j-lit">${lit}</span>`;
      if (num) return `<span class="j-num">${num}</span>`;
      return m;
    }
  );
}

/* ---------- search + chips ---------- */

export function renderChips(onSelect) {
  el.chips.innerHTML = "";
  for (const city of POPULAR_CITIES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = city;
    b.dataset.city = city;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => onSelect(city));
    el.chips.appendChild(b);
  }
}

export function setSelectedChip(city) {
  const target = (city ?? "").trim().toLowerCase();
  el.chips.querySelectorAll(".chip").forEach((chip) => {
    const on = target !== "" && chip.dataset.city.toLowerCase() === target;
    chip.classList.toggle("is-selected", on);
    chip.setAttribute("aria-pressed", String(on));
  });
}

export function setInputValue(v) { el.input.value = v; }
export function getInputValue() { return el.input.value; }
export function focusInput() { el.input.focus(); }

export function setValidation(message) {
  el.hint.textContent = message || "";
  el.input.setAttribute("aria-invalid", message ? "true" : "false");
}

/* ---------- state panels ---------- */

function show(which) {
  el.loading.hidden = which !== "loading";
  el.error.hidden = which !== "error";
  el.weather.hidden = which !== "weather";
  el.stage.setAttribute("aria-busy", String(which === "loading"));
}

export function showLoading(city) {
  show("loading");
  el.status.textContent = `Loading weather for ${city}`;
}

export function showError(type, { onRetry, backTo, onBack } = {}) {
  const copy = ERROR_COPY[type] ?? ERROR_COPY.UNKNOWN;
  show("error");
  document.body.removeAttribute("data-tone"); // neutral theme on errors
  el.errorTitle.textContent = copy.title;
  el.errorMsg.textContent = copy.message;
  el.retryBtn.hidden = !copy.retry;
  el.retryBtn.onclick = onRetry ?? null;
  if (backTo) {
    el.backBtn.hidden = false;
    el.backCity.textContent = backTo;
    el.backBtn.onclick = onBack ?? null;
  } else {
    el.backBtn.hidden = true;
  }
  el.status.textContent = `${copy.title}. ${copy.message}`;
}

/* ---------- weather ---------- */

export function renderWeather(data, rawText) {
  const { location: loc, current: c } = data;
  const mood = personalityFromResponse(data);

  setText("w-city", loc.name);
  setText("w-region", [loc.region, loc.country].filter(Boolean).join(", "));
  setText("w-temp", fmt(c.temp_c, 1));
  setText("w-feels", fmt(c.feelslike_c, 1));
  setText("w-cond", c.condition.text);

  const icon = $("w-icon");
  icon.src = normalizeIconUrl(c.condition.icon);
  icon.alt = c.condition.text;

  const vibe = $("vibe");
  vibe.dataset.tone = mood.key;
  document.body.dataset.tone = mood.key; // weather-reactive theme
  setText("vibe-title", mood.title);
  setText("vibe-text", mood.description);

  setText("m-humidity", fmt(c.humidity));
  setText("m-wind", fmt(c.wind_kph, 1));
  setText("m-uv", fmt(c.uv, 1));

  setText("s-cloud", fmt(c.cloud));
  setText("s-vis", fmt(c.vis_km, 1));
  setText("s-pressure", fmt(c.pressure_mb));
  setText("s-wind", fmt(c.wind_kph, 1));
  setText("s-dir", c.wind_dir ? `from ${c.wind_dir}` : "");
  setText("s-temp-f", fmt(c.temp_f, 1));
  setText("s-updated", c.last_updated ?? "—");

  startClock(loc.tz_id);
  renderJson(data, rawText);

  show("weather");
  el.status.textContent = `Weather loaded for ${loc.name}: ${fmt(c.temp_c, 1)} degrees Celsius, ${c.condition.text}`;
}

function startClock(tzId) {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    const { time, zone } = formatLocalTime(tzId);
    setText("w-time", time);
    setText("w-tz", zone);
  };
  tick();
  clockTimer = setInterval(tick, 15000);
}

/* ---------- JSON viewer (FR-07) ---------- */

let jsonState = { formatted: "", raw: "", view: "formatted" };

function renderJson(data, rawText) {
  jsonState.formatted = JSON.stringify(data, null, 2);
  jsonState.raw = rawText;
  paintJson();
}

function paintJson() {
  if (jsonState.view === "formatted") {
    el.jsonView.innerHTML = highlightJson(jsonState.formatted);
  } else {
    el.jsonView.textContent = jsonState.raw;
  }
}

export function setJsonView(view) {
  jsonState.view = view;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.view === view;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  el.jsonView.setAttribute("aria-labelledby", `tab-${view}`);
  paintJson();
}

export function getDisplayedJson() {
  return jsonState.view === "formatted" ? jsonState.formatted : jsonState.raw;
}

export async function copyDisplayedJson() {
  const text = getDisplayedJson();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return flashCopy(true);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return flashCopy(ok);
  }
}

function flashCopy(ok) {
  el.copyBtn.textContent = ok ? "Copied ✓" : "Copy failed";
  el.status.textContent = ok ? "JSON copied to clipboard" : "Could not copy JSON";
  setTimeout(() => { el.copyBtn.textContent = "Copy"; }, 1600);
  return ok;
}
