import { el, $, fmt } from "./dom.js?v=pwa-1";

const MAX_MARKERS = 14667;
const COORD_PRECISION = 2;

let map = null;
let markersLayer = null;
let currentData = [];
let onFilmClick = null;
let userInteracted = false;
let isFirstRender = true;

function ensureMap() {
  if (map) return map;
  const container = $("#map-view");
  if (!container) return null;

  let mapDiv = container.querySelector("#world-map");
  if (!mapDiv) {
    mapDiv = el("div", { id: "world-map", class: "world-map" });
    container.append(mapDiv);
  }

  map = L.map("world-map", {
    center: [20, 0],
    zoom: 2,
    minZoom: 1,
    maxZoom: 18,
    worldCopyJump: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  markersLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 12,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    chunkedLoading: true,
    chunkInterval: 200,
    chunkDelay: 50,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      const size = Math.min(50, 30 + Math.log2(count + 1) * 8);
      return L.divIcon({
        className: "map-cluster",
        html: `<div class="map-cluster-inner" style="width:${size}px;height:${size}px;">${count}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    },
  }).addTo(map);

  map.on("moveend", () => {
    userInteracted = true;
  });

  setTimeout(() => map.invalidateSize(), 100);

  return map;
}

function groupByLocation(movies) {
  const groups = new Map();
  for (const movie of movies) {
    if (!movie.locations?.length) continue;
    for (const loc of movie.locations) {
      const key = `${loc.latitude.toFixed(COORD_PRECISION)}|${loc.longitude.toFixed(COORD_PRECISION)}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          name: loc.name,
          country: loc.country,
          films: [],
        };
        groups.set(key, group);
      }
      const exists = group.films.some(f => f.id === movie.id);
      if (!exists) group.films.push(movie);
    }
  }
  return [...groups.values()];
}

function createPopupContent(group, onFilmClick) {
  const container = el("div", { class: "map-popup" });
  container.append(
    el("h4", { class: "map-popup-title" }, group.name),
    el("p", { class: "map-popup-country" }, group.country || ""),
  );

  container.append(
    el("p", { class: "map-popup-count" }, `${group.films.length} film(s) tourné(s) ici :`),
  );

  const list = el("ul", { class: "map-popup-films" });
  const sorted = [...group.films].sort((a, b) =>
    (b.audienceRating ?? 0) - (a.audienceRating ?? 0)
  );

  for (const film of sorted.slice(0, 20)) {
    const item = el("li", { class: "map-popup-film" });
    const btn = el("button", {
      class: "map-popup-film-btn",
      onclick: () => {
        // ← → in the details then move between the films of this place.
        if (onFilmClick) onFilmClick(film.id, sorted.map((f) => f.id));
      },
    });
    btn.append(
      el("span", { class: "map-popup-film-title" }, film.title),
      film.year ? el("span", { class: "map-popup-film-year" }, ` (${film.year})`) : null,
    );
    if (film.audienceRating !== null && film.audienceRating !== undefined) {
      btn.append(
        el("span", { class: "map-popup-film-rating" }, ` ★ ${fmt(film.audienceRating, 1)}`),
      );
    }
    item.append(btn);
    list.append(item);
  }

  if (sorted.length > 20) {
    list.append(el("li", { class: "map-popup-more" }, `… et ${sorted.length - 20} autre(s)`));
  }

  container.append(list);
  return container;
}

function createMarkerIcon(filmCount) {
  const size = Math.min(40, 18 + Math.log2(filmCount + 1) * 6);
  return L.divIcon({
    className: "map-marker",
    html: `<div class="map-marker-inner" style="width:${size}px;height:${size}px;">${filmCount}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function renderMap(movies, onFilmClickCallback) {
  onFilmClick = onFilmClickCallback;
  currentData = movies;

  const container = $("#map-view");
  if (!container) return;

  const filmsWithLocations = movies.filter((m) => m.locations?.length);
  const allGroups = groupByLocation(filmsWithLocations);

  const totalLocations = allGroups.length;
  const isLimited = totalLocations > MAX_MARKERS;

  const groups = isLimited
    ? allGroups
        .sort((a, b) => {
          const scoreA = a.films.reduce((s, f) => s + (f.audienceRating ?? 0), 0);
          const scoreB = b.films.reduce((s, f) => s + (f.audienceRating ?? 0), 0);
          return scoreB - scoreA;
        })
        .slice(0, MAX_MARKERS)
    : allGroups;

  const legend = $("#map-legend");
  if (legend) {
    if (!filmsWithLocations.length) {
      legend.textContent = "";
    } else if (isLimited) {
      legend.textContent = `${filmsWithLocations.length} films · ${groups.length} / ${totalLocations} lieux affichés (les mieux notés)`;
    } else {
      legend.textContent = `${filmsWithLocations.length} films · ${groups.length} lieux de tournage`;
    }
  }

  if (!groups.length) {
    if (map) {
      markersLayer.clearLayers();
    }
    let emptyDiv = container.querySelector(".map-empty");
    if (!emptyDiv) {
      emptyDiv = el("div", { class: "empty map-empty" },
        el("strong", {}, "Aucun lieu de tournage dans cette sélection."),
        el("p", {}, "Les localisations proviennent du dataset filming-locations. Essayez d'élargir votre sélection."),
      );
      container.append(emptyDiv);
    }
    const mapDiv = container.querySelector("#world-map");
    if (mapDiv) mapDiv.remove();
    if (map) {
      map.remove();
      map = null;
      markersLayer = null;
    }
    return;
  }

  const emptyDiv = container.querySelector(".map-empty");
  if (emptyDiv) emptyDiv.remove();

  ensureMap();
  if (!map) return;

  const savedCenter = map.getCenter();
  const savedZoom = map.getZoom();

  markersLayer.clearLayers();

  const bounds = [];

  for (const group of groups) {
    const marker = L.marker([group.latitude, group.longitude], {
      icon: createMarkerIcon(group.films.length),
    });
    marker.bindPopup(() => createPopupContent(group, onFilmClick), {
      maxWidth: 320,
      className: "map-popup-wrapper",
    });
    markersLayer.addLayer(marker);
    bounds.push([group.latitude, group.longitude]);
  }

  if (!userInteracted || isFirstRender) {
    if (bounds.length === 1) {
      map.setView(bounds[0], 8, { animate: false });
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8, animate: false });
    }
    isFirstRender = false;
  } else {
    map.setView(savedCenter, savedZoom, { animate: false });
  }

  setTimeout(() => map.invalidateSize(), 50);
}

export function resetMapView() {
  userInteracted = false;
  isFirstRender = true;
  if (currentData.length && map) {
    renderMap(currentData, onFilmClick);
  }
}

export function centerOnData() {
  userInteracted = false;
  if (currentData.length && map) {
    renderMap(currentData, onFilmClick);
  }
}

export function invalidateMap() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}

export function destroyMap() {
  if (map) {
    map.remove();
    map = null;
    markersLayer = null;
  }
}
