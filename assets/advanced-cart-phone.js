(function (global) {
  "use strict";

  var countries = [];
  var selectedIso = "OM";
  var phoneValidate = function () {};
  var phoneTouched = false;
  var countriesUrl = "";

  function root() {
    return document.getElementById("advanced-cart-preview-root");
  }

  function loadCountries() {
    if (countries.length) return Promise.resolve(countries);
    return fetch(countriesUrl).then(function (res) {
      if (!res.ok) throw new Error("Failed to load countries");
      return res.json();
    }).then(function (data) {
      countries = data || [];
      return countries;
    });
  }

  function flagUrl(iso) {
    return "https://flagcdn.com/w40/" + String(iso).toLowerCase() + ".png";
  }

  function flagImg(iso, className) {
    var img = document.createElement("img");
    img.className = className;
    img.src = flagUrl(iso);
    img.alt = "";
    img.width = 20;
    img.height = 15;
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  function selectedCountry() {
    for (var i = 0; i < countries.length; i++) {
      if (countries[i].iso === selectedIso) return countries[i];
    }
    return countries[0];
  }

  function normalizeNationalNumber(raw, country) {
    country = country || selectedCountry();
    var digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    if (country && digits.indexOf(country.dial) === 0) {
      digits = digits.slice(country.dial.length);
    }
    if (digits.charAt(0) === "0") {
      digits = digits.replace(/^0+/, "");
    }
    return digits;
  }

  function validatePhoneNumber(raw, country) {
    country = country || selectedCountry();
    var digits = normalizeNationalNumber(raw, country);
    var min = country.min;
    var max = country.max;
    var startsWith = country.startsWith;
    var requiredMsg =
      (window.AdvancedCartI18n &&
        window.AdvancedCartI18n("phone_required", "Phone number is required")) ||
      "Phone number is required";
    var invalidMsg =
      (window.AdvancedCartI18n &&
        window.AdvancedCartI18n("phone_invalid", "Enter a valid phone number")) ||
      "Enter a valid phone number";

    if (!digits) {
      return { ok: false, message: requiredMsg, digits: digits };
    }
    if (digits.length < min || digits.length > max) {
      return { ok: false, message: invalidMsg, digits: digits };
    }
    if (startsWith && startsWith.length) {
      var okPrefix = startsWith.some(function (p) {
        return digits.indexOf(p) === 0;
      });
      if (!okPrefix) {
        return { ok: false, message: invalidMsg, digits: digits };
      }
    }
    return { ok: true, message: "", digits: digits };
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

  function searchCountries(query) {
    var q = query.trim().replace(/^\+/, "");
    if (!q) return countries;
    return countries
      .map(function (c) {
        return Object.assign({}, c, {
          score: Math.max(
            fuzzyScore(q, c.name),
            fuzzyScore(q, c.iso),
            fuzzyScore(q, c.dial),
            fuzzyScore(q, "+" + c.dial)
          ),
        });
      })
      .filter(function (c) {
        return c.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score || a.name.localeCompare(b.name);
      });
  }

  function savePhoneDraft() {
    var api = global.AdvancedCartPreview;
    var phoneInput = document.getElementById("phone-number");
    if (!api || !api.draftPatch || !phoneInput) return;
    api.draftPatch({
      phone: phoneInput.value.trim(),
      phoneIso: selectedIso,
    });
  }

  function applyCountry(country, opts) {
    selectedIso = country.iso;
    var flagEl = document.getElementById("phone-prefix-flag");
    var codeEl = document.getElementById("phone-prefix-code");
    var btn = document.getElementById("phone-prefix-btn");
    var phoneInput = document.getElementById("phone-number");
    if (flagEl) {
      flagEl.src = flagUrl(country.iso);
      flagEl.alt = "";
    }
    if (codeEl) codeEl.textContent = "+" + country.dial;
    if (btn) {
      btn.setAttribute(
        "aria-label",
        "Country code " + country.name + " +" + country.dial
      );
    }
    if (phoneInput) {
      phoneInput.placeholder = country.placeholder;
      phoneInput.setAttribute("inputmode", "numeric");
      phoneInput.setAttribute("autocomplete", "tel-national");
      phoneInput.maxLength = country.max + 4;
    }
    if (phoneTouched) phoneValidate();
    if (!opts || opts.persist !== false) savePhoneDraft();
  }

  function openCountrySheet() {
    var sheet = document.getElementById("country-sheet");
    var input = document.getElementById("country-search-input");
    if (!sheet || !input) return;
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    input.value = "";
    renderCountryResults(searchCountries(""));
    requestAnimationFrame(function () {
      input.focus();
    });
  }

  function closeCountrySheet() {
    var sheet = document.getElementById("country-sheet");
    var input = document.getElementById("country-search-input");
    if (!sheet || !sheet.classList.contains("is-open")) return;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (input) input.value = "";
    renderCountryResults([]);
  }

  function renderCountryResults(matches) {
    var list = document.getElementById("country-search-results");
    if (!list) return;
    list.replaceChildren();
    matches.forEach(function (country) {
      var li = document.createElement("li");
      li.className = "location-sheet__option country-option";
      li.setAttribute("role", "option");
      li.tabIndex = 0;
      if (country.iso === selectedIso) li.setAttribute("aria-selected", "true");

      var name = document.createElement("span");
      name.className = "country-option__name";
      name.textContent = country.name;

      var dial = document.createElement("span");
      dial.className = "country-option__dial";
      dial.textContent = "+" + country.dial;

      li.append(flagImg(country.iso, "country-option__flag"), name, dial);

      function pick() {
        applyCountry(country);
        closeCountrySheet();
      }
      li.addEventListener("click", pick);
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      });
      list.appendChild(li);
    });
  }

  function isCountryPickerTarget(el) {
    return Boolean(el && el.closest && el.closest("#phone-prefix-btn, #country-sheet"));
  }

  function wirePhoneValidation() {
    var input = document.getElementById("phone-number");
    var field = document.getElementById("phone-number-field");
    var error = document.getElementById("phone-number-error");
    var prefixBtn = document.getElementById("phone-prefix-btn");
    if (!input || !field || !error) return;

    function clearError() {
      field.classList.remove("field--error");
      input.setAttribute("aria-invalid", "false");
      error.textContent = "";
      error.hidden = true;
    }

    phoneValidate = function () {
      if (!phoneTouched && !input.value.trim()) {
        clearError();
        return;
      }
      var result = validatePhoneNumber(input.value);
      field.classList.toggle("field--error", !result.ok);
      input.setAttribute("aria-invalid", result.ok ? "false" : "true");
      error.textContent = result.message;
      error.hidden = result.ok;
    };

    if (prefixBtn) {
      prefixBtn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
      });
    }

    input.addEventListener("input", function () {
      // Keep error style while invalid; only clear once the number validates.
      if (field.classList.contains("field--error")) {
        phoneTouched = true;
        phoneValidate();
      }
      savePhoneDraft();
      if (global.AdvancedCartPreview && typeof global.AdvancedCartPreview.syncProceedButton === "function") {
        global.AdvancedCartPreview.syncProceedButton();
      }
    });
    input.addEventListener("change", savePhoneDraft);
    input.addEventListener("blur", function (e) {
      if (isCountryPickerTarget(e.relatedTarget)) return;
      setTimeout(function () {
        if (isCountryPickerTarget(document.activeElement)) return;
        var sheet = document.getElementById("country-sheet");
        if (sheet && sheet.classList.contains("is-open")) return;
        phoneTouched = true;
        phoneValidate();
        savePhoneDraft();
        if (global.AdvancedCartPreview && typeof global.AdvancedCartPreview.syncProceedButton === "function") {
          global.AdvancedCartPreview.syncProceedButton();
        }
      }, 0);
    });

    clearError();
  }

  function restorePhoneDraft() {
    var api = global.AdvancedCartPreview;
    var draft = api && api.draftGet ? api.draftGet() : {};
    var phoneInput = document.getElementById("phone-number");
    if (!phoneInput) return;
    if (draft.phoneIso) {
      for (var i = 0; i < countries.length; i++) {
        if (countries[i].iso === draft.phoneIso) {
          applyCountry(countries[i], { persist: false });
          break;
        }
      }
    }
    if (draft.phone) {
      phoneInput.value = draft.phone;
    }
  }

  function wirePhoneCountryPicker() {
    var el = root();
    countriesUrl = (el && el.getAttribute("data-countries-url")) || "";
    var btn = document.getElementById("phone-prefix-btn");
    var input = document.getElementById("country-search-input");
    if (!btn || !input) return Promise.resolve();

    return loadCountries().then(function () {
      wirePhoneValidation();
      applyCountry(selectedCountry(), { persist: false });
      btn.addEventListener("click", openCountrySheet);
      input.addEventListener("input", function () {
        renderCountryResults(searchCountries(input.value));
      });
      var sheet = document.getElementById("country-sheet");
      var backdrop = document.getElementById("country-sheet-backdrop");
      function onOutsidePointer(e) {
        if (!sheet || !sheet.classList.contains("is-open")) return;
        if (e.target.closest && e.target.closest(".location-sheet__panel")) return;
        closeCountrySheet();
      }
      if (backdrop) {
        backdrop.addEventListener("pointerdown", closeCountrySheet);
      }
      if (sheet) {
        sheet.addEventListener("pointerdown", onOutsidePointer);
      }
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeCountrySheet();
      });
    });
  }

  global.AdvancedCartPreview = global.AdvancedCartPreview || {};
  global.AdvancedCartPreview.wirePhoneCountryPicker = wirePhoneCountryPicker;
  global.AdvancedCartPreview.restorePhoneDraft = restorePhoneDraft;
  global.AdvancedCartPreview.validatePhoneNumber = validatePhoneNumber;
  global.AdvancedCartPreview.normalizeNationalNumber = normalizeNationalNumber;
})(typeof window !== "undefined" ? window : this);
