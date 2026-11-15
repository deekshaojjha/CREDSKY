// WeatherAPI client (FR-10) + error classification (FR-08).
// NOTE: a key shipped to the browser is NOT a secret. Restrict it in the WeatherAPI dashboard.

import { WEATHER_API_KEY } from "./config.js";

export const ENDPOINT = "https://api.weatherapi.com/v1/current.json";

export const ERROR_TYPES = Object.freeze({
  EMPTY: "EMPTY",
  NOT_FOUND: "NOT_FOUND",
  API_KEY: "API_KEY",
  RATE_LIMIT: "RATE_LIMIT",
  NETWORK: "NETWORK",
  SERVER: "SERVER",
  UNKNOWN: "UNKNOWN",
});

export const ERROR_COPY = {
  EMPTY: { title: "Enter a city", message: "Type a city name to see its weather.", retry: false },
  NOT_FOUND: { title: "City not found", message: "We couldn't find that city. Check the spelling or try another one.", retry: false },
  API_KEY: { title: "API configuration error", message: "The weather service key is missing, invalid or disabled. Check your API key setup.", retry: false },
  RATE_LIMIT: { title: "Temporary service error", message: "Too many requests right now. Please wait a moment and try again.", retry: true },
  NETWORK: { title: "You're offline", message: "We couldn't reach the weather service. Check your internet connection.", retry: true },
  SERVER: { title: "Service unavailable", message: "The weather service is unavailable at the moment. Please try again shortly.", retry: true },
  UNKNOWN: { title: "Something went wrong", message: "We got an unexpected response. Please try again.", retry: true },
};

export class WeatherError extends Error {
  constructor(type, detail = "") {
    super(ERROR_COPY[type]?.message ?? "Unknown error");
    this.name = "WeatherError";
    this.type = type;
    this.detail = detail;
  }
}

/** Pure: map an HTTP status + parsed body (or null) to an ERROR_TYPES value, or null when OK. */
export function classifyResponse(status, body) {
  const code = body && body.error && typeof body.error.code === "number" ? body.error.code : null;

  if (code !== null) {
    if (code === 1006) return ERROR_TYPES.NOT_FOUND;
    if ([1002, 2006, 2008, 2009].includes(code)) return ERROR_TYPES.API_KEY;
    if (code === 2007) return ERROR_TYPES.RATE_LIMIT;
    if (code === 1003) return ERROR_TYPES.EMPTY;
    if (code === 9999) return ERROR_TYPES.SERVER;
    if (status >= 500) return ERROR_TYPES.SERVER;
    return ERROR_TYPES.UNKNOWN;
  }
  if (status === 429) return ERROR_TYPES.RATE_LIMIT;
  if (status === 401 || status === 403) return ERROR_TYPES.API_KEY;
  if (status >= 500) return ERROR_TYPES.SERVER;
  if (status >= 200 && status < 300) {
    return isValidPayload(body) ? null : ERROR_TYPES.UNKNOWN;
  }
  return ERROR_TYPES.UNKNOWN;
}

/** Pure: has every field the UI needs? Prevents rendering a blank/incomplete card. */
export function isValidPayload(body) {
  return Boolean(
    body &&
      body.location && typeof body.location.name === "string" && body.location.tz_id &&
      body.current &&
      typeof body.current.temp_c === "number" &&
      body.current.condition && typeof body.current.condition.text === "string"
  );
}

export function buildUrl(city, key = WEATHER_API_KEY) {
  const params = new URLSearchParams({ key, q: city });
  return `${ENDPOINT}?${params.toString()}`;
}

/**
 * Fetch current weather for a city.
 * Resolves { data, rawText }. Rejects with WeatherError.
 */
export async function fetchCurrentWeather(city, { signal, key = WEATHER_API_KEY, fetchImpl = fetch } = {}) {
  const q = (city ?? "").trim();
  if (!q) throw new WeatherError(ERROR_TYPES.EMPTY);
  if (!key || key === "YOUR_API_KEY") throw new WeatherError(ERROR_TYPES.API_KEY, "No API key configured");

  let res;
  try {
    res = await fetchImpl(buildUrl(q, key), { method: "GET", signal });
  } catch (err) {
    if (err && err.name === "AbortError") throw err; // caller handles cancellations
    throw new WeatherError(ERROR_TYPES.NETWORK, String(err));
  }

  const rawText = await res.text();
  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = null;
  }

  const type = classifyResponse(res.status, data);
  if (type) throw new WeatherError(type, `HTTP ${res.status}`);
  return { data, rawText };
}
