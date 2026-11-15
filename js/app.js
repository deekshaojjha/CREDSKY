// Controller: wires user actions to the API and the UI.

import { fetchCurrentWeather, WeatherError, ERROR_TYPES } from "./api.js";
import { createRequestGuard } from "./guard.js";
import * as ui from "./ui.js";

const DEFAULT_CITY = "Mumbai"; // FR-01.1

const guard = createRequestGuard();
const state = {
  lastGoodCity: null, // city of the weather currently on screen
  lastQuery: DEFAULT_CITY,
};

async function loadCity(rawCity) {
  const city = (rawCity ?? "").trim();

  // FR-02.4 / FR-08: empty input never hits the API
  if (!city) {
    ui.setValidation("Please enter a city name.");
    ui.focusInput();
    return;
  }
  ui.setValidation("");

  state.lastQuery = city;
  ui.setInputValue(city);          // FR-02 / FR-03.3: input retains the searched city
  ui.setSelectedChip(city);        // FR-03.4: highlight current selection
  ui.showLoading(city);            // FR-01.3 / FR-08: loading shown immediately; old card hidden

  const { id, signal } = guard.begin();

  try {
    const { data, rawText } = await fetchCurrentWeather(city, { signal });
    if (!guard.isLatest(id)) return; // a newer search owns the screen
    ui.renderWeather(data, rawText);
    state.lastGoodCity = data.location.name;
    ui.setSelectedChip(city);
  } catch (err) {
    if (err && err.name === "AbortError") return; // superseded by a newer request
    if (!guard.isLatest(id)) return;

    const type = err instanceof WeatherError ? err.type : ERROR_TYPES.UNKNOWN;
    ui.setSelectedChip("");        // don't highlight a city we failed to load
    ui.showError(type, {
      onRetry: () => loadCity(state.lastQuery),
      backTo: state.lastGoodCity && state.lastGoodCity.toLowerCase() !== city.toLowerCase() ? state.lastGoodCity : null,
      onBack: () => loadCity(state.lastGoodCity),
    });
  }
}

function init() {
  ui.renderChips((city) => loadCity(city));

  const form = document.getElementById("search-form");
  form.addEventListener("submit", (e) => {   // button click + Enter both submit the form
    e.preventDefault();
    loadCity(ui.getInputValue());
  });

  document.getElementById("city-input").addEventListener("input", () => ui.setValidation(""));

  // JSON viewer
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => ui.setJsonView(tab.dataset.view));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const next = tab.dataset.view === "formatted" ? "raw" : "formatted";
        ui.setJsonView(next);
        document.getElementById(`tab-${next}`).focus();
      }
    });
  });
  document.getElementById("copy-btn").addEventListener("click", () => ui.copyDisplayedJson());

  // FR-01: auto-load Mumbai
  loadCity(DEFAULT_CITY);
}

init();
