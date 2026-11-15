import test from "node:test";
import assert from "node:assert/strict";

import { getPersonality, PERSONALITIES, THRESHOLDS } from "../js/personality.js";
import {
  classifyResponse, isValidPayload, fetchCurrentWeather, buildUrl,
  ERROR_TYPES, WeatherError,
} from "../js/api.js";
import { createRequestGuard } from "../js/guard.js";

/* ---------- FR-05 personality ---------- */

const p = (tempC, conditionCode = 1000, windKph = 5) => getPersonality({ tempC, conditionCode, windKph });

test("very cold -> Freeze Frame", () => {
  assert.equal(p(2), PERSONALITIES.COLD);
  assert.equal(p(THRESHOLDS.veryColdMaxC), PERSONALITIES.COLD);
});
test("snow -> Freeze Frame even above threshold", () => assert.equal(p(8, 1225), PERSONALITIES.COLD));
test("pleasant -> Perfect Day", () => assert.equal(p(24), PERSONALITIES.PERFECT));
test("very hot -> Sun Alert", () => assert.equal(p(38), PERSONALITIES.HOT));
test("rain -> Rain Check", () => assert.equal(p(24, 1183), PERSONALITIES.RAIN));
test("windy -> Breezy Mode", () => assert.equal(p(24, 1000, 40), PERSONALITIES.WINDY));
test("cool but unremarkable -> Easy Going", () => assert.equal(p(12), PERSONALITIES.MILD));
test("priority: rain beats hot, cold and windy", () => {
  assert.equal(p(38, 1195, 50), PERSONALITIES.RAIN);
  assert.equal(p(1, 1189, 50), PERSONALITIES.RAIN);
});
test("priority: cold beats windy; hot beats windy", () => {
  assert.equal(p(0, 1000, 60), PERSONALITIES.COLD);
  assert.equal(p(36, 1000, 60), PERSONALITIES.HOT);
});
test("boundaries", () => {
  assert.equal(p(35), PERSONALITIES.HOT);
  assert.equal(p(34.9, 1000, 5), PERSONALITIES.MILD);
  assert.equal(p(18), PERSONALITIES.PERFECT);
  assert.equal(p(30), PERSONALITIES.PERFECT);
  assert.equal(p(24, 1000, 30), PERSONALITIES.WINDY);
});

/* ---------- FR-08 error classification ---------- */

const ok = {
  location: { name: "Mumbai", tz_id: "Asia/Kolkata" },
  current: { temp_c: 30, condition: { text: "Sunny", code: 1000 } },
};

test("200 with valid payload is not an error", () => assert.equal(classifyResponse(200, ok), null));
test("200 with incomplete payload -> UNKNOWN", () => {
  assert.equal(classifyResponse(200, { location: ok.location }), ERROR_TYPES.UNKNOWN);
  assert.equal(classifyResponse(200, null), ERROR_TYPES.UNKNOWN);
});
test("1006 -> NOT_FOUND", () => assert.equal(classifyResponse(400, { error: { code: 1006 } }), ERROR_TYPES.NOT_FOUND));
test("2006 / 2008 / 1002 -> API_KEY", () => {
  for (const code of [2006, 2008, 1002]) {
    assert.equal(classifyResponse(401, { error: { code } }), ERROR_TYPES.API_KEY);
  }
});
test("2007 and HTTP 429 -> RATE_LIMIT", () => {
  assert.equal(classifyResponse(403, { error: { code: 2007 } }), ERROR_TYPES.RATE_LIMIT);
  assert.equal(classifyResponse(429, null), ERROR_TYPES.RATE_LIMIT);
});
test("5xx -> SERVER", () => {
  assert.equal(classifyResponse(503, null), ERROR_TYPES.SERVER);
  assert.equal(classifyResponse(500, { error: { code: 9999 } }), ERROR_TYPES.SERVER);
});
test("isValidPayload", () => {
  assert.equal(isValidPayload(ok), true);
  assert.equal(isValidPayload({}), false);
});

/* ---------- FR-10 request building and fetch behaviour (stubbed fetch) ---------- */

const stub = (status, body, raw) => async () => ({
  status,
  text: async () => raw ?? JSON.stringify(body),
});

test("URL uses /v1/current.json with key and q params", () => {
  const u = new URL(buildUrl("New York", "K123"));
  assert.equal(u.origin + u.pathname, "https://api.weatherapi.com/v1/current.json");
  assert.equal(u.searchParams.get("key"), "K123");
  assert.equal(u.searchParams.get("q"), "New York");
});
test("empty city rejects with EMPTY and makes no request", async () => {
  let called = false;
  await assert.rejects(
    fetchCurrentWeather("   ", { key: "k", fetchImpl: async () => { called = true; } }),
    (e) => e instanceof WeatherError && e.type === ERROR_TYPES.EMPTY
  );
  assert.equal(called, false);
});
test("missing key -> API_KEY", async () => {
  await assert.rejects(fetchCurrentWeather("Delhi", { key: "" }), (e) => e.type === ERROR_TYPES.API_KEY);
});
test("network failure -> NETWORK", async () => {
  await assert.rejects(
    fetchCurrentWeather("Delhi", { key: "k", fetchImpl: async () => { throw new TypeError("Failed to fetch"); } }),
    (e) => e.type === ERROR_TYPES.NETWORK
  );
});
test("AbortError is rethrown untouched", async () => {
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  await assert.rejects(
    fetchCurrentWeather("Delhi", { key: "k", fetchImpl: async () => { throw abort; } }),
    (e) => e.name === "AbortError"
  );
});
test("success preserves raw response text exactly", async () => {
  const raw = '{"location":{"name":"Mumbai","tz_id":"Asia/Kolkata"},"current":{"temp_c":30,"condition":{"text":"Sunny","code":1000}}}';
  const { data, rawText } = await fetchCurrentWeather("Mumbai", { key: "k", fetchImpl: stub(200, null, raw) });
  assert.equal(rawText, raw);
  assert.equal(data.location.name, "Mumbai");
});
test("non-JSON 502 -> SERVER", async () => {
  await assert.rejects(
    fetchCurrentWeather("Delhi", { key: "k", fetchImpl: stub(502, null, "<html>Bad gateway</html>") }),
    (e) => e.type === ERROR_TYPES.SERVER
  );
});

/* ---------- FR-08 stale response protection ---------- */

test("only the latest request is considered current; earlier ones are aborted", () => {
  const g = createRequestGuard();
  const a = g.begin();
  const b = g.begin();
  assert.equal(a.signal.aborted, true);
  assert.equal(b.signal.aborted, false);
  assert.equal(g.isLatest(a.id), false);
  assert.equal(g.isLatest(b.id), true);
});
