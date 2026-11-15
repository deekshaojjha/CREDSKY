// FR-05: weather personality. Pure functions so thresholds are testable.

/** Thresholds live in one place (FR-05: "define clear condition thresholds"). */
export const THRESHOLDS = Object.freeze({
  veryColdMaxC: 5,      // <= 5°C
  veryHotMinC: 35,      // >= 35°C
  windyMinKph: 30,      // >= 30 km/h
  pleasantMinC: 18,     // 18–30°C, calm, dry
  pleasantMaxC: 30,
});

// WeatherAPI condition codes (https://www.weatherapi.com/docs/weather_conditions.json)
export const RAIN_CODES = new Set([
  1063, 1087, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195,
  1198, 1201, 1240, 1243, 1246, 1273, 1276,
]);
export const SNOW_CODES = new Set([
  1066, 1069, 1072, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222,
  1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264, 1279, 1282,
]);

export const PERSONALITIES = Object.freeze({
  RAIN: { key: "rain", title: "Rain Check", description: "Time to carry an umbrella. The sky is leaking again." },
  COLD: { key: "cold", title: "Freeze Frame", description: "Bone-chilling cold. Penguins would wear a jacket today." },
  HOT: { key: "hot", title: "Sun Alert", description: "The sun is showing off. Hydrate, find shade, don't forget sunglasses." },
  WINDY: { key: "windy", title: "Breezy Mode", description: "Hold onto your hat, and your dignity. The wind has opinions." },
  PERFECT: { key: "perfect", title: "Perfect Day", description: "The weather is in a great mood. Go outside before it changes its mind." },
  MILD: { key: "mild", title: "Easy Going", description: "Weather's keeping it low-key. A light layer and you're sorted." },
});

/**
 * Priority order (first match wins):
 *   1. Rain / drizzle / thunder  -> Rain Check   (most actionable: you get wet)
 *   2. Very cold or snow/ice     -> Freeze Frame (<= 5°C)
 *   3. Very hot                  -> Sun Alert    (>= 35°C)
 *   4. Windy                     -> Breezy Mode  (>= 30 km/h)
 *   5. Pleasant                  -> Perfect Day  (18–30°C)
 *   6. Anything else             -> Easy Going
 */
export function getPersonality({ tempC, conditionCode, windKph }) {
  const t = Number(tempC);
  const w = Number(windKph);

  if (RAIN_CODES.has(conditionCode)) return PERSONALITIES.RAIN;
  if (t <= THRESHOLDS.veryColdMaxC || SNOW_CODES.has(conditionCode)) return PERSONALITIES.COLD;
  if (t >= THRESHOLDS.veryHotMinC) return PERSONALITIES.HOT;
  if (w >= THRESHOLDS.windyMinKph) return PERSONALITIES.WINDY;
  if (t >= THRESHOLDS.pleasantMinC && t <= THRESHOLDS.pleasantMaxC) return PERSONALITIES.PERFECT;
  return PERSONALITIES.MILD;
}

/** Convenience wrapper over a WeatherAPI current.json payload. */
export function personalityFromResponse(data) {
  const c = data.current;
  return getPersonality({
    tempC: c.temp_c,
    conditionCode: c.condition && c.condition.code,
    windKph: c.wind_kph,
  });
}
