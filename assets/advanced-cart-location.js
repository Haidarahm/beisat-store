(function (global) {
  "use strict";

  var MAX_POINT_KM = 25;
  var MAX_RESULTS = 8;
  var mapFeatures = null;
  var locationOptions = [];
  var mapUrl = "";
  var i18nCache = null;
  var gpsLabel = null;
  var gpsState = "idle"; // idle | loading | ready | error
  var gpsRequestId = 0;

  function t(key, fallback) {
    if (!i18nCache) {
      var el = document.getElementById("advanced-cart-i18n");
      try {
        i18nCache = el ? JSON.parse(el.textContent) : {};
      } catch (e) {
        i18nCache = {};
      }
    }
    return i18nCache[key] || fallback;
  }
  global.AdvancedCartI18n = t;

  function root() {
    return document.getElementById("advanced-cart-preview-root");
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function pointInRing(lng, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      var intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(lng, lat, geometry) {
    var rings = geometry.type === "Polygon" ? geometry.coordinates : null;
    if (!rings || !rings.length) return false;
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (var i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) return false;
    }
    return true;
  }

  function formatLocation(props) {
    var parts = [];
    if (props.Area) parts.push(props.Area.trim());
    if (props.State && props.State !== ".") parts.push(props.State.trim());
    if (props.Country) parts.push(props.Country.trim());
    return parts.join(", ");
  }

  function specificity(props) {
    var score = 0;
    if (props.Area) score += 4;
    if (props.State && props.State !== ".") score += 2;
    if (props.Country) score += 1;
    return score;
  }

  function matchLocation(lat, lng, features) {
    var bestPoint = null;
    var bestPointKm = Infinity;
    var i;
    for (i = 0; i < features.length; i++) {
      var feature = features[i];
      var geometry = feature.geometry;
      var properties = feature.properties;
      if (!geometry || geometry.type !== "Point" || !properties || !properties.Area) continue;
      var pLng = geometry.coordinates[0];
      var pLat = geometry.coordinates[1];
      var km = distanceKm(lat, lng, pLat, pLng);
      if (km <= MAX_POINT_KM && km < bestPointKm) {
        bestPointKm = km;
        bestPoint = feature;
      }
    }
    if (bestPoint) return formatLocation(bestPoint.properties);

    var bestPoly = null;
    var bestScore = -1;
    for (i = 0; i < features.length; i++) {
      feature = features[i];
      geometry = feature.geometry;
      properties = feature.properties;
      if (!geometry || geometry.type !== "Polygon" || !properties) continue;
      if (!pointInPolygon(lng, lat, geometry)) continue;
      var score = specificity(properties);
      if (score > bestScore) {
        bestScore = score;
        bestPoly = feature;
      }
    }
    if (bestPoly) return formatLocation(bestPoly.properties);
    return null;
  }

  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve(pos.coords);
        },
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  function buildLocationOptions(features) {
    var seen = {};
    var options = [];
    for (var i = 0; i < features.length; i++) {
      var props = features[i].properties || {};
      var label = formatLocation(props);
      if (!label || seen[label]) continue;
      seen[label] = true;
      var country = (props.Country || "").trim();
      var searchText = [
        props.Area,
        props["Area-AR"],
        props.State !== "." ? props.State : "",
        props["State-AR"] !== "." ? props["State-AR"] : "",
        props.Country,
        props["Country-AR"],
        label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      options.push({ label: label, searchText: searchText, country: country });
    }
    return options;
  }

  var GCC_COUNTRY_ORDER = {
    Oman: 0,
    "United Arab Emirates": 1,
    "Saudi Arabia": 2,
    Kuwait: 3,
    Qatar: 4,
    Bahrain: 5,
  };

  // ISO → map Country label (Shopify localization is IP-based).
  var ISO_TO_MAP_COUNTRY = {
    OM: "Oman",
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
    KW: "Kuwait",
    QA: "Qatar",
    BH: "Bahrain",
  };

  function visitorCountryDefault(seen) {
    var el = root();
    var iso = ((el && el.getAttribute("data-visitor-country-iso")) || "").toUpperCase();
    var mapped = ISO_TO_MAP_COUNTRY[iso];
    if (mapped && seen[mapped]) return mapped;
    var name = ((el && el.getAttribute("data-visitor-country")) || "").trim();
    if (name && seen[name]) return name;
    var lower = name.toLowerCase();
    if (lower) {
      for (var c in seen) {
        if (Object.prototype.hasOwnProperty.call(seen, c) && c.toLowerCase() === lower) {
          return c;
        }
      }
    }
    if (seen.Oman) return "Oman";
    return "";
  }

  function fillCountryFilter() {
    var sel = document.getElementById("location-country-filter");
    if (!sel || sel.options.length) return;
    var seen = {};
    var list = [];
    for (var i = 0; i < locationOptions.length; i++) {
      var c = locationOptions[i].country;
      if (!c || seen[c]) continue;
      seen[c] = true;
      list.push(c);
    }
    list.sort(function (a, b) {
      var ai = Object.prototype.hasOwnProperty.call(GCC_COUNTRY_ORDER, a)
        ? GCC_COUNTRY_ORDER[a]
        : 100;
      var bi = Object.prototype.hasOwnProperty.call(GCC_COUNTRY_ORDER, b)
        ? GCC_COUNTRY_ORDER[b]
        : 100;
      return ai - bi || a.localeCompare(b);
    });
    list.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    });
    var preferred = visitorCountryDefault(seen);
    if (preferred) sel.value = preferred;
  }

  function selectedCountryFilter() {
    var sel = document.getElementById("location-country-filter");
    return sel ? sel.value : "";
  }

  function loadMap() {
    if (mapFeatures) {
      fillCountryFilter();
      return Promise.resolve(mapFeatures);
    }
    return fetch(mapUrl).then(function (res) {
      if (!res.ok) throw new Error("Failed to load map");
      return res.json();
    }).then(function (map) {
      mapFeatures = map.features || [];
      locationOptions = buildLocationOptions(mapFeatures);
      fillCountryFilter();
      return mapFeatures;
    });
  }

  function fuzzyScore(query, text) {
    var q = query.toLowerCase().trim();
    if (!q) return 0;
    var t = text.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 90;
    if (t.indexOf(q) !== -1) return 75;
    var qi = 0;
    var gaps = 0;
    var last = -1;
    for (var i = 0; i < t.length && qi < q.length; i++) {
      if (t.charAt(i) === q.charAt(qi)) {
        if (last >= 0) gaps += i - last - 1;
        last = i;
        qi++;
      }
    }
    if (qi !== q.length) return 0;
    return Math.max(20, 55 - gaps);
  }

  function fuzzySearch(query) {
    var country = selectedCountryFilter();
    var pool = country
      ? locationOptions.filter(function (opt) {
          return opt.country === country;
        })
      : locationOptions;
    var q = query.trim();
    if (!q) return pool.slice(0, MAX_RESULTS);
    return pool
      .map(function (opt) {
        return {
          label: opt.label,
          searchText: opt.searchText,
          score: Math.max(fuzzyScore(q, opt.label), fuzzyScore(q, opt.searchText) * 0.9),
        };
      })
      .filter(function (opt) {
        return opt.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score || a.label.localeCompare(b.label);
      })
      .slice(0, MAX_RESULTS);
  }

  function clearAddressSkeleton(addressEl) {
    addressEl.classList.remove("skeleton-text");
    addressEl.removeAttribute("aria-busy");
    addressEl.replaceChildren();
  }

  function showSetLocation() {
    var btn = document.getElementById("address-action-btn");
    var block = document.getElementById("shipping-address");
    if (btn) {
      btn.textContent =
        btn.getAttribute("data-label-set") || t("set_location", "Set location");
    }
    if (block) block.classList.remove("has-address");
    var row = document.getElementById("shipping-address-row");
    if (row) row.hidden = true;
    var empty = document.getElementById("shipping-address-empty");
    if (empty) empty.hidden = false;
    var sub = document.getElementById("shipping-subtitle");
    if (sub) {
      sub.hidden = false;
      sub.textContent = t("add_address", "Add an address for this order");
    }
    var api = global.AdvancedCartPreview;
    if (api && api.refreshDeliveryEstimate) api.refreshDeliveryEstimate();
  }

  function setAddress(label, opts) {
    var row = document.getElementById("shipping-address-row");
    var addressEl = document.getElementById("shipping-address-text");
    var btn = document.getElementById("address-action-btn");
    var block = document.getElementById("shipping-address");
    if (addressEl) {
      clearAddressSkeleton(addressEl);
      addressEl.textContent = label;
    }
    if (row) row.hidden = false;
    if (btn) {
      btn.textContent =
        btn.getAttribute("data-label-change") || t("change", "Change");
    }
    if (block) block.classList.add("has-address");
    var empty = document.getElementById("shipping-address-empty");
    if (empty) empty.hidden = true;
    var sub = document.getElementById("shipping-subtitle");
    if (sub) sub.hidden = true;
    if (!opts || opts.persist !== false) {
      var api = global.AdvancedCartPreview;
      if (api && api.draftPatch) api.draftPatch({ location: label });
    }
    closeLocationSheet();
    var preview = global.AdvancedCartPreview;
    if (preview && preview.refreshDeliveryEstimate) preview.refreshDeliveryEstimate();
  }

  function detectCurrentLocation() {
    var requestId = ++gpsRequestId;
    gpsState = "loading";
    gpsLabel = null;
    return Promise.all([getPosition(), loadMap()])
      .then(function (results) {
        if (requestId !== gpsRequestId) return null;
        var coords = results[0];
        var features = results[1];
        var label = matchLocation(coords.latitude, coords.longitude, features);
        if (label) {
          gpsLabel = label;
          gpsState = "ready";
        } else {
          gpsState = "error";
        }
        return label;
      })
      .catch(function () {
        if (requestId !== gpsRequestId) return null;
        gpsState = "error";
        gpsLabel = null;
        return null;
      });
  }

  function refreshSheetResults() {
    var input = document.getElementById("location-search-input");
    var sheet = document.getElementById("location-sheet");
    if (!sheet || !sheet.classList.contains("is-open") || !input) return;
    renderResults(fuzzySearch(input.value), { query: input.value });
  }

  function openLocationSheet() {
    var sheet = document.getElementById("location-sheet");
    var input = document.getElementById("location-search-input");
    if (!sheet || !input) return;
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    input.value = "";
    loadMap()
      .catch(function () {})
      .then(function () {
        renderResults(fuzzySearch(""), { query: "" });
      });
    // Always re-read GPS when the user opens the picker (not only first cart visit).
    detectCurrentLocation().then(function () {
      refreshSheetResults();
    });
    requestAnimationFrame(function () {
      input.focus();
    });
  }

  function closeLocationSheet() {
    var sheet = document.getElementById("location-sheet");
    var input = document.getElementById("location-search-input");
    if (!sheet || !sheet.classList.contains("is-open")) return;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (input) input.value = "";
    renderResults([]);
  }

  var PIN_SVG =
    '<svg class="location-sheet__option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>';

  var GPS_SVG =
    '<svg class="location-sheet__option-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>';

  function bindOptionPick(li, label) {
    li.addEventListener("click", function () {
      if (!label) return;
      setAddress(label);
    });
    li.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (!label) return;
        setAddress(label);
      }
    });
  }

  function renderGpsOption(list, query) {
    if ((query || "").trim()) return;
    var li = document.createElement("li");
    li.className = "location-sheet__option location-sheet__option--gps";
    li.setAttribute("role", "option");
    li.tabIndex = 0;
    li.innerHTML = GPS_SVG;
    var text = document.createElement("span");
    text.className = "location-sheet__option-text";
    var title = document.createElement("span");
    title.className = "location-sheet__option-title";
    var meta = document.createElement("span");
    meta.className = "location-sheet__option-meta";
    text.appendChild(title);
    text.appendChild(meta);
    li.appendChild(text);

    if (gpsState === "loading") {
      title.textContent = t("detecting_location", "Detecting your location…");
      meta.hidden = true;
      li.setAttribute("aria-disabled", "true");
      li.tabIndex = -1;
    } else if (gpsState === "ready" && gpsLabel) {
      title.textContent = t("use_current_location", "Use current location");
      meta.textContent = gpsLabel;
      meta.hidden = false;
      li.setAttribute("aria-selected", "true");
      bindOptionPick(li, gpsLabel);
    } else {
      title.textContent = t("location_unavailable", "Current location unavailable");
      meta.hidden = true;
      li.setAttribute("aria-disabled", "true");
      li.tabIndex = -1;
    }
    list.appendChild(li);
  }

  function renderResults(matches, opts) {
    var list = document.getElementById("location-search-results");
    if (!list) return;
    var query = opts && opts.query != null ? opts.query : "";
    list.replaceChildren();
    renderGpsOption(list, query);
    matches.forEach(function (match) {
      var li = document.createElement("li");
      li.className = "location-sheet__option";
      li.setAttribute("role", "option");
      li.tabIndex = 0;
      li.innerHTML = PIN_SVG;
      var span = document.createElement("span");
      span.textContent = match.label;
      li.appendChild(span);
      bindOptionPick(li, match.label);
      list.appendChild(li);
    });
  }

  function wireLocationSearch() {
    var btn = document.getElementById("address-action-btn");
    var input = document.getElementById("location-search-input");
    var countrySel = document.getElementById("location-country-filter");
    var sheet = document.getElementById("location-sheet");
    var backdrop = document.getElementById("location-sheet-backdrop");
    if (!btn || !input) return;
    btn.addEventListener("click", openLocationSheet);
    input.addEventListener("input", function () {
      renderResults(fuzzySearch(input.value), { query: input.value });
    });
    if (countrySel) {
      countrySel.addEventListener("change", function () {
        renderResults(fuzzySearch(input.value), { query: input.value });
      });
    }
    function onOutsidePointer(e) {
      if (!sheet || !sheet.classList.contains("is-open")) return;
      if (e.target.closest && e.target.closest(".location-sheet__panel")) return;
      closeLocationSheet();
    }
    if (backdrop) {
      backdrop.addEventListener("pointerdown", closeLocationSheet);
    }
    if (sheet) {
      sheet.addEventListener("pointerdown", onOutsidePointer);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLocationSheet();
    });
  }

  function resolveShippingAddress() {
    var el = root();
    mapUrl = (el && el.getAttribute("data-map-url")) || "";
    var addressEl = document.getElementById("shipping-address-text");
    if (!addressEl) return Promise.resolve();

    wireLocationSearch();

    var api = global.AdvancedCartPreview;
    var draft = api && api.draftGet ? api.draftGet() : {};
    var customerLoc = (el && el.getAttribute("data-customer-location")) || "";
    if (draft.location) {
      setAddress(draft.location, { persist: false });
      return loadMap().catch(function () {});
    }
    if (customerLoc) {
      setAddress(customerLoc, { persist: false });
      return loadMap().catch(function () {});
    }

    return Promise.all([getPosition(), loadMap()])
      .then(function (results) {
        var coords = results[0];
        var features = results[1];
        var label = matchLocation(coords.latitude, coords.longitude, features);
        clearAddressSkeleton(addressEl);
        if (label) {
          setAddress(label);
        } else {
          showSetLocation();
        }
      })
      .catch(function () {
        return loadMap()
          .catch(function () {})
          .then(function () {
            clearAddressSkeleton(addressEl);
            showSetLocation();
          });
      });
  }

  global.AdvancedCartPreview = global.AdvancedCartPreview || {};
  global.AdvancedCartPreview.resolveShippingAddress = resolveShippingAddress;
})(typeof window !== "undefined" ? window : this);
