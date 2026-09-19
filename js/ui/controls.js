import { $, el, labels, fmt } from "./dom.js";
import { normalizeWeights } from "../scoring/scoring.js";
import { fold } from "../utils/values.js";
let refreshResults = () => {};
export function setupControls(state, update) {
  refreshResults = update;
  for (const decade of [1970, 1980, 1990, 2000, 2010, 2020])
    $("#decades").append(
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            state.config.filters.yearMin = decade;
            state.config.filters.yearMax = decade === 2020 ? null : decade + 9;
            syncControls(state);
            update();
          },
        },
        decade === 2020 ? "2020+" : String(decade).slice(2) + "s",
      ),
    );
  for (const rating of [3, 3.5, 4, 4.5])
    $("#rating-shortcuts").append(
      el(
        "button",
        {
          type: "button",
          onclick: () => {
            state.config.filters.ratingMin = rating;
            syncControls(state);
            update();
          },
        },
        "≥ " + fmt(rating, Number.isInteger(rating) ? 0 : 1),
      ),
    );
  for (const [key, label] of Object.entries(labels))
    $("#weights").append(
      el(
        "div",
        { class: "weight" },
        el(
          "label",
          {},
          label,
          el("input", {
            type: "number",
            min: 0,
            max: 10000,
            name: "weight-" + key,
            "aria-label": "Poids " + label,
          }),
          el("output", { id: "weight-output-" + key }),
        ),
      ),
    );
  for (const kind of ["hard", "soft"])
    $("#" + kind + "-tab").onclick = () => {
      for (const k of ["hard", "soft"]) {
        $("#" + k + "-form").hidden = k !== kind;
        $("#" + k + "-tab").classList.toggle("active", k === kind);
        $("#" + k + "-tab").setAttribute("aria-pressed", k === kind);
      }
    };
  for (const kind of ["hard", "soft"]) {
    const form = $("#" + kind + "-form");
    form.onsubmit = (e) => e.preventDefault();
    const applyInput = (e) => {
      const t = e.target;
      if (!t.name || !t.checkValidity()) return;
      const dest =
        kind === "hard" ? state.config.filters : state.config.scoring;
      const value =
        t.type === "checkbox"
          ? t.checked
          : t.type === "number"
            ? t.value === ""
              ? null
              : Number(t.value)
            : t.value;
      if (t.name.startsWith("weight-"))
        dest.weights[t.name.slice(7)] = value ?? 0;
      else if (t.name.startsWith("pref-"))
        dest.preferences[t.name.slice(5)] = value ?? 5;
      else if (t.name === "genre-choice")
        state.config.filters.genres = [
          ...form.querySelectorAll('[name="genre-choice"]:checked'),
        ].map((e) => e.value);
      else dest[t.name] = value;
      updateWeightLabels(state);
      update();
    };
    form.addEventListener("input", applyInput);
    form.addEventListener("change", applyInput);
    form.addEventListener("compositionend", applyInput);
  }
  $("#genre-search").oninput = (e) => {
    const q = e.target.value.toLocaleLowerCase("fr");
    for (const label of $("#genre-list").children)
      label.hidden = !label.textContent.toLocaleLowerCase("fr").includes(q);
  };
  setupCountryAutocomplete(state);
}
function setupCountryAutocomplete(state) {
  const input = $("#country-search"),
    box = $("#country-suggestions");
  let active = -1;
  const suggestions = () => {
    const q = fold(input.value).trim();
    if (!q) return [];
    const chosen = state.config.filters.countries;
    const all = state.summary?.countries || [];
    return all
      .filter((c) => !chosen.includes(c) && fold(c).includes(q))
      .sort((a, b) => {
        const ap = fold(a).startsWith(q),
          bp = fold(b).startsWith(q);
        return ap === bp ? a.localeCompare(b, "fr") : ap ? -1 : 1;
      })
      .slice(0, 8);
  };
  const close = () => {
    box.hidden = true;
    box.replaceChildren();
    active = -1;
    input.setAttribute("aria-expanded", "false");
  };
  const choose = (country) => {
    if (!state.config.filters.countries.includes(country))
      state.config.filters.countries = [
        ...state.config.filters.countries,
        country,
      ];
    input.value = "";
    close();
    renderCountrySelected(state);
    refreshResults();
  };
  const render = () => {
    const items = suggestions();
    active = -1;
    if (!items.length) return close();
    box.replaceChildren(
      ...items.map((c, i) =>
        el(
          "button",
          {
            type: "button",
            class: "suggestion",
            role: "option",
            onmousedown: (e) => {
              e.preventDefault();
              choose(c);
            },
            onmouseenter: () => setActive(i),
          },
          c,
        ),
      ),
    );
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };
  const setActive = (i) => {
    active = i;
    [...box.children].forEach((n, j) =>
      n.classList.toggle("active", j === i),
    );
  };
  input.oninput = render;
  input.onfocus = render;
  input.onblur = () => setTimeout(close, 120);
  input.onkeydown = (e) => {
    const items = [...box.children];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length) setActive((active + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setActive((active - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      const pick = items[active] || items[0];
      if (pick) {
        e.preventDefault();
        pick.dispatchEvent(new MouseEvent("mousedown"));
      }
    } else if (e.key === "Escape") close();
  };
}
export function renderCountrySelected(state) {
  const chosen = state.config.filters.countries;
  $("#country-selected").replaceChildren(
    ...chosen.map((c) =>
      el(
        "button",
        {
          type: "button",
          class: "chip-remove",
          "aria-label": "Retirer " + c,
          onclick: () => {
            state.config.filters.countries = chosen.filter((v) => v !== c);
            renderCountrySelected(state);
            refreshResults();
          },
        },
        c + " ×",
      ),
    ),
  );
}
export function renderGenres(state) {
  $("#genre-list").replaceChildren(
    ...state.summary.genres.map((g) =>
      el(
        "label",
        { class: "check" },
        el("input", { type: "checkbox", name: "genre-choice", value: g }),
        g,
      ),
    ),
  );
  $("#genre-preferences").replaceChildren(
    ...state.summary.genres.map((g) =>
      el(
        "label",
        { class: "preference" },
        g,
        el("input", {
          type: "number",
          min: 0,
          max: 10,
          name: "pref-" + g,
          "aria-label": "Préférence " + g,
          value: state.config.scoring.preferences[g] ?? 5,
        }),
      ),
    ),
  );
  $("#genre-count").textContent = state.summary.genres.length;
  $("#country-count").textContent = state.summary.countries.length;
}
export function updateWeightLabels(state) {
  const w = normalizeWeights(state.config.scoring.weights);
  for (const k of Object.keys(labels))
    $("#weight-output-" + k).textContent = fmt(w[k] * 100, 0) + " %";
  $("#weight-status").textContent = Object.values(w).some(Boolean)
    ? "Répartition normalisée sur 100 points."
    : "Tous les poids sont nuls : tous les scores valent 0.";
}
export function syncControls(state) {
  for (const [form, obj] of [
    ["hard-form", state.config.filters],
    ["soft-form", state.config.scoring],
  ]) {
    for (const input of $("#" + form).elements) {
      const key = input.name;
      if (!key) continue;
      if (key === "genre-choice") {
        input.checked = obj.genres.includes(input.value);
        continue;
      }
      const v = key.startsWith("weight-")
        ? obj.weights[key.slice(7)]
        : key.startsWith("pref-")
          ? (obj.preferences[key.slice(5)] ?? 5)
          : obj[key];
      if (input.type === "checkbox") input.checked = Boolean(v);
      else input.value = v ?? "";
    }
  }
  $("#search").value = state.config.filters.query;
  $("#sort").value =
    state.config.sorting.field + ":" + state.config.sorting.direction;
  $("#top").value = state.config.top;
  $("#page-size").value = state.config.pageSize;
  renderCountrySelected(state);
  updateWeightLabels(state);
}
