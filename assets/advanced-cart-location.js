(function (global) {
  "use strict";

  var MAX_POINT_KM = 25;
  var MAX_RESULTS = 8;
  var mapFeatures = null;
  var locationOptions = [];
  var mapUrl = "";

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
      options.push({ label: label, searchText: searchText });
    }
    return options;
  }

  function loadMap() {
    if (mapFeatures) return Promise.resolve(mapFeatures);
    return fetch(mapUrl).then(function (res) {
      if (!res.ok) throw new Error("Failed to load map");
      return res.json();
    }).then(function (map) {
      mapFeatures = map.features || [];
      locationOptions = buildLocationOptions(mapFeatures);
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
    var q = query.trim();
    if (!q) return locationOptions.slice(0, MAX_RESULTS);
    return locationOptions
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
    if (btn) btn.textContent = "Set location";
    var row = document.getElementById("shipping-address-row");
    if (row) row.hidden = true;
    var sub = document.getElementById("shipping-subtitle");
    if (sub) sub.hidden = false;
    var api = global.AdvancedCartPreview;
    if (api && api.refreshDeliveryEstimate) api.refreshDeliveryEstimate();
  }

  function setAddress(label, opts) {
    var row = document.getElementById("shipping-address-row");
    var addressEl = document.getElementById("shipping-address-text");
    var btn = document.getElementById("address-action-btn");
    if (addressEl) {
      clearAddressSkeleton(addressEl);
      addressEl.textContent = label;
    }
    if (row) row.hidden = false;
    if (btn) btn.textContent = "Change Address";
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

  function openLocationSheet() {
    var sheet = document.getElementById("location-sheet");
    var input = document.getElementById("location-search-input");
    if (!sheet || !input) return;
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    input.value = "";
    renderResults(fuzzySearch(""));
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

  function renderResults(matches) {
    var list = document.getElementById("location-search-results");
    if (!list) return;
    list.replaceChildren();
    matches.forEach(function (match) {
      var li = document.createElement("li");
      li.className = "location-sheet__option";
      li.setAttribute("role", "option");
      li.tabIndex = 0;
      li.innerHTML = PIN_SVG;
      var span = document.createElement("span");
      span.textContent = match.label;
      li.appendChild(span);
      li.addEventListener("click", function () {
        setAddress(match.label);
      });
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setAddress(match.label);
        }
      });
      list.appendChild(li);
    });
  }

  function wireLocationSearch() {
    var btn = document.getElementById("address-action-btn");
    var input = document.getElementById("location-search-input");
    var sheet = document.getElementById("location-sheet");
    var backdrop = document.getElementById("location-sheet-backdrop");
    if (!btn || !input) return;
    btn.addEventListener("click", openLocationSheet);
    input.addEventListener("input", function () {
      renderResults(fuzzySearch(input.value));
    });
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
