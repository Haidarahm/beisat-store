(function () {
  "use strict";

  var DRAFT_KEY = "checkout_preview_draft";

  function t(key, fallback) {
    if (window.AdvancedCartI18n) return window.AdvancedCartI18n(key, fallback);
    return fallback;
  }

  function draftGet() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function draftPatch(patch) {
    var next = draftGet();
    for (var key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  }

  function splitName(full) {
    var parts = String(full || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return { first: "", last: "" };
    return {
      first: parts[0],
      last: parts.length > 1 ? parts.slice(1).join(" ") : parts[0],
    };
  }

  function parseLocation(label) {
    var parts = String(label || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
    if (!parts.length) {
      return { address1: "", city: "", province: "", country: "Oman", zip: "" };
    }
    var country = parts.length > 1 ? parts[parts.length - 1] : "Oman";
    var address1 = parts[0];
    var province = parts.length > 2 ? parts[1] : "";
    var city = parts.length > 2 ? parts[parts.length - 2] : address1;
    // Same rules as store gps-address for GCC.
    if (
      country === "United Arab Emirates" ||
      country === "Kuwait" ||
      country === "Bahrain" ||
      country === "Qatar"
    ) {
      return { address1: address1, city: "N/A", province: address1, country: country, zip: "" };
    }
    return { address1: address1, city: city, province: province, country: country, zip: "" };
  }

  function getLocationText() {
    var draft = draftGet();
    var locEl = document.getElementById("shipping-address-text");
    var locationText = "";
    if (locEl && locEl.getAttribute("aria-busy") !== "true") {
      locationText = (locEl.textContent || "").trim();
    }
    if (!locationText) locationText = (draft.location || "").trim();
    return locationText;
  }

  function getFormIssues() {
    var draft = draftGet();
    var nameEl = document.getElementById("full-name");
    var phoneEl = document.getElementById("phone-number");
    var name = ((nameEl && nameEl.value) || draft.name || "").trim();
    var phoneRaw = ((phoneEl && phoneEl.value) || draft.phone || "").trim();
    var location = getLocationText();
    var issues = [];

    if (!location) {
      issues.push({
        id: "location",
        focusEl: document.getElementById("address-action-btn"),
        scrollEl:
          document.getElementById("shipping-address-row") ||
          document.getElementById("address-action-btn") ||
          document.getElementById("shipping-title"),
      });
    }
    if (!name) {
      issues.push({
        id: "name",
        focusEl: nameEl,
        scrollEl: document.getElementById("full-name-field") || nameEl,
        fieldId: "full-name-field",
        errorId: "full-name-error",
        inputId: "full-name",
        message: t("full_name_required", "Full name is required"),
      });
    }

    var phoneResult = {
      ok: false,
      message: t("phone_required", "Phone number is required"),
    };
    var api = window.AdvancedCartPreview;
    if (!phoneRaw) {
      phoneResult = {
        ok: false,
        message: t("phone_required", "Phone number is required"),
      };
    } else if (api && typeof api.validatePhoneNumber === "function") {
      try {
        phoneResult = api.validatePhoneNumber(phoneRaw) || phoneResult;
        if (!phoneResult || typeof phoneResult.ok === "undefined") {
          phoneResult = {
            ok: false,
            message: t("phone_required", "Phone number is required"),
          };
        }
      } catch (e) {
        phoneResult = {
          ok: false,
          message: t("phone_required", "Phone number is required"),
        };
      }
    } else {
      // Digits present but country rules not loaded yet — keep proceed disabled.
      phoneResult = {
        ok: false,
        message: t("phone_required", "Phone number is required"),
      };
    }

    if (!phoneResult.ok) {
      issues.push({
        id: "phone",
        focusEl: phoneEl,
        scrollEl: document.getElementById("phone-number-field") || phoneEl,
        fieldId: "phone-number-field",
        errorId: "phone-number-error",
        inputId: "phone-number",
        message: phoneResult.message || t("phone_required", "Phone number is required"),
      });
    }
    return issues;
  }

  function markFieldError(issue, on) {
    if (!issue.fieldId) return;
    var field = document.getElementById(issue.fieldId);
    var error = issue.errorId ? document.getElementById(issue.errorId) : null;
    var input = issue.inputId ? document.getElementById(issue.inputId) : null;
    if (field) field.classList.toggle("field--error", on);
    if (input) input.setAttribute("aria-invalid", on ? "true" : "false");
    if (error) {
      if (on && issue.message) error.textContent = issue.message;
      error.hidden = !on;
    }
  }

  function scrollToIssue(issue) {
    if (!issue) return;
    var target = issue.scrollEl || issue.focusEl;
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function focusTarget() {
      if (!issue.focusEl || typeof issue.focusEl.focus !== "function") return;
      try {
        issue.focusEl.focus({ preventScroll: true });
      } catch (e) {
        issue.focusEl.focus();
      }
      if (issue.id === "phone" && typeof issue.focusEl.select === "function") {
        try {
          issue.focusEl.select();
        } catch (e2) {}
      }
    }
    focusTarget();
    window.setTimeout(focusTarget, 280);
    window.setTimeout(focusTarget, 450);
  }

  // Keep error UI visible after a failed proceed click until that field is fixed.
  var revealedErrors = { name: false, phone: false, location: false };

  function applyRevealedErrors() {
    var issues = getFormIssues();
    var byId = {};
    for (var i = 0; i < issues.length; i++) byId[issues[i].id] = issues[i];

    ["name", "phone", "location"].forEach(function (id) {
      if (!byId[id]) revealedErrors[id] = false;
    });

    markFieldError(
      {
        fieldId: "full-name-field",
        errorId: "full-name-error",
        inputId: "full-name",
        message: (byId.name && byId.name.message) || t("full_name_required", "Full name is required"),
      },
      !!(revealedErrors.name && byId.name)
    );
    markFieldError(
      {
        fieldId: "phone-number-field",
        errorId: "phone-number-error",
        inputId: "phone-number",
        message: (byId.phone && byId.phone.message) || t("phone_invalid", "Enter a valid phone number"),
      },
      !!(revealedErrors.phone && byId.phone)
    );

    var locRow = document.getElementById("shipping-address-row");
    var locBtn = document.getElementById("address-action-btn");
    var locShow = !!(revealedErrors.location && byId.location);
    if (locBtn) locBtn.classList.toggle("is-invalid", locShow);
    if (locRow) locRow.classList.toggle("is-invalid", locShow);

    return {
      ok: issues.length === 0,
      issues: issues,
      first: issues[0] || null,
    };
  }

  function validateProceedFields(opts) {
    var showErrors = !opts || opts.showErrors !== false;
    var issues = getFormIssues();
    if (showErrors) {
      for (var i = 0; i < issues.length; i++) {
        revealedErrors[issues[i].id] = true;
      }
    }
    return applyRevealedErrors();
  }

  function syncProceedButton() {
    var btn = document.getElementById("checkout-continue-btn");
    var result = applyRevealedErrors();
    if (!btn) return result.ok;
    btn.classList.toggle("is-disabled", !result.ok);
    btn.setAttribute("aria-disabled", result.ok ? "false" : "true");
    if (result.ok) btn.removeAttribute("tabindex");
    else btn.setAttribute("tabindex", "-1");
    return result.ok;
  }

  function ensureProceedReady() {
    var result = validateProceedFields({ showErrors: true });
    syncProceedButton();
    if (!result.ok) {
      scrollToIssue(result.first);
      return false;
    }
    return true;
  }

  function wireProceedGate() {
    var nameEl = document.getElementById("full-name");
    var phoneEl = document.getElementById("phone-number");
    var locEl = document.getElementById("shipping-address-text");
    var locBtn = document.getElementById("address-action-btn");

    function refresh() {
      syncProceedButton();
    }

    if (nameEl) {
      nameEl.addEventListener("input", refresh);
      nameEl.addEventListener("change", refresh);
    }
    if (phoneEl) {
      phoneEl.addEventListener("input", refresh);
      phoneEl.addEventListener("change", refresh);
      phoneEl.addEventListener("blur", refresh);
    }
    var prefixBtn = document.getElementById("phone-prefix-btn");
    var prefixCode = document.getElementById("phone-prefix-code");
    if (prefixBtn) prefixBtn.addEventListener("click", function () {
      window.setTimeout(refresh, 300);
    });
    if (prefixCode && window.MutationObserver) {
      new MutationObserver(refresh).observe(prefixCode, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    var countryResults = document.getElementById("country-search-results");
    if (countryResults) {
      countryResults.addEventListener("click", function () {
        window.setTimeout(refresh, 50);
      });
    }
    if (locBtn) locBtn.addEventListener("click", function () {
      window.setTimeout(refresh, 300);
    });
    if (locEl && window.MutationObserver) {
      new MutationObserver(refresh).observe(locEl, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
      });
    }

    // Location / phone restore can finish after boot.
    window.setTimeout(refresh, 0);
    window.setTimeout(refresh, 500);
    window.setTimeout(refresh, 1500);
    refresh();
  }

  function collectCheckoutFields() {
    var draft = draftGet();
    var root = document.getElementById("advanced-cart-preview-root");
    var nameEl = document.getElementById("full-name");
    var phoneEl = document.getElementById("phone-number");
    var codeEl = document.getElementById("phone-prefix-code");

    var fullName = ((nameEl && nameEl.value) || draft.name || "").trim();
    var phoneNat = ((phoneEl && phoneEl.value) || draft.phone || "").replace(/\D/g, "");
    var dial = codeEl ? String(codeEl.textContent || "").replace(/\D/g, "") : "";
    var locationText = getLocationText();

    var names = splitName(fullName);
    var loc = parseLocation(locationText);
    var phone = phoneNat ? (dial ? "+" + dial + phoneNat : phoneNat) : "";
    var email = (root && root.getAttribute("data-customer-email")) || "";

    return {
      fullName: fullName,
      first_name: names.first,
      last_name: names.last,
      phone: phone,
      email: email,
      location: locationText,
      address1: loc.address1,
      city: loc.city,
      province: loc.province,
      country: loc.country,
      zip: loc.zip || "",
      phoneIso: draft.phoneIso || "",
    };
  }

  function buildPrefillParams(fields) {
    var params = new URLSearchParams();
    if (fields.email) params.set("checkout[email]", fields.email);
    if (fields.first_name) params.set("checkout[shipping_address][first_name]", fields.first_name);
    if (fields.last_name) params.set("checkout[shipping_address][last_name]", fields.last_name);
    if (fields.address1) params.set("checkout[shipping_address][address1]", fields.address1);
    if (fields.city) params.set("checkout[shipping_address][city]", fields.city);
    if (fields.province) params.set("checkout[shipping_address][province]", fields.province);
    if (fields.country) params.set("checkout[shipping_address][country]", fields.country);
    if (fields.zip) params.set("checkout[shipping_address][zip]", fields.zip);
    if (fields.phone) {
      params.set("checkout[shipping_address][phone]", fields.phone);
      params.set("checkout[phone]", fields.phone);
    }
    return params;
  }

  function buildCheckoutUrl(fields, cart) {
    var params = buildPrefillParams(fields);
    var qs = params.toString();
    // Cart permalink + checkout params is Shopify's documented prefill path.
    if (cart && cart.items && cart.items.length) {
      var path = cart.items
        .map(function (item) {
          return item.variant_id + ":" + item.quantity;
        })
        .join(",");
      return "/cart/" + path + (qs ? "?" + qs : "");
    }
    var base = "/checkout";
    var btn = document.getElementById("checkout-continue-btn");
    if (btn && btn.getAttribute("href") && btn.getAttribute("href").indexOf("checkout") !== -1) {
      base = btn.getAttribute("href").split("?")[0];
    }
    return qs ? base + "?" + qs : base;
  }

  function addressSyncForm() {
    var wrap = document.getElementById("cart-address-sync");
    if (!wrap) return null;
    return wrap.querySelector("form");
  }

  function fillCustomerAddressForm(fields, dest) {
    var form = addressSyncForm();
    if (!form) return false;
    function set(id, value) {
      var el = document.getElementById(id);
      if (el) el.value = value || "";
    }
    set("cart-addr-first-name", fields.first_name);
    set("cart-addr-last-name", fields.last_name);
    set("cart-addr-phone", fields.phone);
    set("cart-addr-address1", fields.address1 || fields.location);
    set("cart-addr-city", fields.city || fields.address1 || "N/A");
    set("cart-addr-province", fields.province || "");
    set("cart-addr-zip", fields.zip || "");
    var countryEl = document.getElementById("cart-addr-country");
    if (countryEl) {
      var want = fields.country || "Oman";
      countryEl.value = want;
      if (countryEl.value !== want) {
        for (var i = 0; i < countryEl.options.length; i++) {
          if (countryEl.options[i].text === want || countryEl.options[i].value === want) {
            countryEl.selectedIndex = i;
            break;
          }
        }
      }
    }
    var returnTo = form.querySelector('[name="return_to"]');
    if (returnTo && dest) returnTo.value = dest;
    return true;
  }

  function goToCheckoutWithPrefill() {
    if (!ensureProceedReady()) return Promise.resolve(false);

    var fields = collectCheckoutFields();
    draftPatch({
      name: fields.fullName,
      phone: (document.getElementById("phone-number") || {}).value || fields.phone,
      location: fields.location,
      phoneIso: fields.phoneIso,
    });

    var attributes = {
      "Full name": fields.fullName,
      "First name": fields.first_name,
      "Last name": fields.last_name,
      Phone: fields.phone,
      Location: fields.location,
      Address: fields.address1,
      City: fields.city,
      Country: fields.country,
    };
    var note = [fields.fullName, fields.phone, fields.location].filter(Boolean).join(" | ");

    return fetch((window.routes && window.routes.cart_update_url) || "/cart/update.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ attributes: attributes, note: note }),
    })
      .catch(function () {})
      .then(function () {
        return fetch(((window.theme && window.theme.routes && window.theme.routes.cart) || "/cart") + ".js", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        })
          .then(function (res) {
            return res.json();
          })
          .catch(function () {
            return null;
          });
      })
      .then(function (cart) {
        var dest = buildCheckoutUrl(fields, cart);
        // Write address to customer account → checkout middle step uses it / collapses to payment.
        if (fillCustomerAddressForm(fields, dest)) {
          addressSyncForm().submit();
          return true;
        }
        window.location.href = dest;
        return true;
      });
  }

  function wireRequiredField(inputId, fieldId, errorId) {
    var input = document.getElementById(inputId);
    var field = document.getElementById(fieldId);
    var error = document.getElementById(errorId);
    if (!input || !field || !error) return;

    function validate() {
      var empty = !input.value.trim();
      field.classList.toggle("field--error", empty);
      input.setAttribute("aria-invalid", empty ? "true" : "false");
      error.hidden = !empty;
    }

    input.addEventListener("input", validate);
    input.addEventListener("blur", validate);
  }

  function wireNameDraft() {
    var input = document.getElementById("full-name");
    if (!input) return;
    var draft = draftGet();
    if (draft.name) input.value = draft.name;
    function save() {
      draftPatch({ name: input.value.trim() });
    }
    input.addEventListener("input", save);
    input.addEventListener("change", save);
  }

  // Shopify Cart Ajax shipping rates:
  // https://shopify.dev/docs/api/ajax/reference/cart#generate-shipping-rates
  // Fee = rate.price, Estimated delivery = rate.description (Delivery details).
  var estimateRequestId = 0;

  function setRowValueText(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("skeleton-text");
    el.removeAttribute("aria-busy");
    el.replaceChildren();
    el.textContent = text;
  }

  function showRowValueSkeleton(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add("skeleton-text");
    el.setAttribute("aria-busy", "true");
    el.replaceChildren();
    var line = document.createElement("span");
    line.className = "skeleton-text__line skeleton-text__line--estimate";
    el.appendChild(line);
  }

  function emptyEstimateLabel() {
    var el = document.getElementById("estimated-delivery-value");
    return (el && el.getAttribute("data-empty")) || "—";
  }

  function feeFallbackLabel() {
    var el = document.getElementById("delivery-fee-value");
    return (el && el.getAttribute("data-fallback")) || "";
  }

  function formatMoneyFromRate(price, currency) {
    var amount = Number(price);
    if (!isFinite(amount)) return String(price);
    var cur = currency || "OMR";
    var digits = currencyFractionDigits(cur);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(amount);
    } catch (e) {
      return amount.toFixed(digits) + (cur ? " " + cur : "");
    }
  }

  function currencyFractionDigits(currency) {
    try {
      return (
        new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currency || "OMR",
        }).resolvedOptions().maximumFractionDigits || 2
      );
    } catch (e) {
      return (currency || "").toUpperCase() === "OMR" ? 3 : 2;
    }
  }

  // Total = cart subtotal + fee, formatted like Liquid | money (/100 subunits).
  function updateOrderTotal(feeMajor) {
    var el = document.getElementById("order-total-value");
    if (!el) return;
    var cents = Number(el.getAttribute("data-subtotal-cents") || 0) || 0;
    var fee = Number(feeMajor);
    if (!isFinite(fee) || fee < 0) fee = 0;
    var amount = ((cents + Math.round(fee * 100)) / 100).toFixed(2).replace(".", ",");
    var fmt =
      (window.theme && theme.settings && theme.settings.moneyWithCurrencyFormat) ||
      "{{amount_with_comma_separator}}0 OMR";
    setRowValueText("order-total-value", fmt.replace(/\{\{\s*amount[^}]*\}\}/, amount));
  }

  // Pick the Shopify rate whose name best matches the location label.
  // Location labels are "Area, State, Country" (from the map). Prefer the
  // longest matching token so "Muscat East" beats country-only "Oman", and
  // non-Muscat states (e.g. Salalah/Dhofar) land on the general Oman rate —
  // all from live rate names, no hardcoded carriers.
  function pickBestRate(rates, locationText) {
    if (!rates || !rates.length) return null;
    var loc = parseLocation(locationText);
    var needles = [loc.province, loc.city, loc.address1, loc.country]
      .map(function (s) {
        return String(s || "")
          .trim()
          .toLowerCase();
      })
      .filter(function (s) {
        return s.length >= 2 && s !== "n/a";
      });
    // Dedupe while keeping order (province first = most specific).
    var seen = {};
    needles = needles.filter(function (s) {
      if (seen[s]) return false;
      seen[s] = true;
      return true;
    });

    var best = null;
    var bestScore = 0;
    var i;
    for (i = 0; i < rates.length; i++) {
      var rate = rates[i];
      var name = String(rate.name || rate.presentment_name || "").toLowerCase();
      if (!name) continue;
      var score = 0;
      var n;
      for (n = 0; n < needles.length; n++) {
        if (name.indexOf(needles[n]) !== -1 && needles[n].length > score) {
          score = needles[n].length;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = rate;
      }
    }
    if (best) return best;

    var cheapest = rates[0];
    for (i = 1; i < rates.length; i++) {
      if (Number(rates[i].price) < Number(cheapest.price)) cheapest = rates[i];
    }
    return cheapest;
  }

  function shippingAddressParams(loc) {
    var params = new URLSearchParams();
    params.set("shipping_address[country]", loc.country || "Oman");
    params.set(
      "shipping_address[province]",
      loc.province || loc.city || loc.address1 || ""
    );
    params.set("shipping_address[zip]", loc.zip || "00000");
    return params.toString();
  }

  function pollAsyncShippingRates(query, requestId, attempt) {
    attempt = attempt || 0;
    return fetch("/cart/async_shipping_rates.json?" + query, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (requestId !== estimateRequestId) return null;
        if (data === null) {
          if (attempt >= 12) return { shipping_rates: [] };
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(pollAsyncShippingRates(query, requestId, attempt + 1));
            }, 350);
          });
        }
        return data;
      });
  }

  function refreshDeliveryEstimate() {
    var estimateEl = document.getElementById("estimated-delivery-value");
    if (!estimateEl) return Promise.resolve();

    var locationText = getLocationText();
    if (!locationText) {
      setRowValueText("estimated-delivery-value", emptyEstimateLabel());
      var feeFallback = feeFallbackLabel();
      if (feeFallback) setRowValueText("delivery-fee-value", feeFallback);
      updateOrderTotal(0);
      return Promise.resolve();
    }

    var loc = parseLocation(locationText);
    var query = shippingAddressParams(loc);
    var requestId = ++estimateRequestId;
    showRowValueSkeleton("estimated-delivery-value");
    showRowValueSkeleton("delivery-fee-value");
    showRowValueSkeleton("order-total-value");

    return fetch("/cart/prepare_shipping_rates.json?" + query, {
      method: "POST",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
    })
      .then(function () {
        return pollAsyncShippingRates(query, requestId);
      })
      .then(function (data) {
        if (requestId !== estimateRequestId) return;
        var rate = pickBestRate(data && data.shipping_rates, locationText);
        if (!rate) {
          setRowValueText("estimated-delivery-value", emptyEstimateLabel());
          setRowValueText("delivery-fee-value", feeFallbackLabel() || "—");
          updateOrderTotal(0);
          return;
        }
        // Delivery details from Shopify admin → rate.description
        var details = String(rate.description || "").trim();
        setRowValueText(
          "estimated-delivery-value",
          details || emptyEstimateLabel()
        );
        setRowValueText(
          "delivery-fee-value",
          formatMoneyFromRate(rate.price, rate.currency)
        );
        updateOrderTotal(rate.price, rate.currency);
      })
      .catch(function () {
        if (requestId !== estimateRequestId) return;
        setRowValueText("estimated-delivery-value", emptyEstimateLabel());
        setRowValueText("delivery-fee-value", feeFallbackLabel() || "—");
        updateOrderTotal(0);
      });
  }

  function boot() {
    if (!document.getElementById("advanced-cart-preview-root")) return;
    var api = window.AdvancedCartPreview || {};
    api.draftGet = draftGet;
    api.draftPatch = draftPatch;
    api.collectCheckoutFields = collectCheckoutFields;
    api.goToCheckoutWithPrefill = goToCheckoutWithPrefill;
    api.ensureProceedReady = ensureProceedReady;
    api.syncProceedButton = syncProceedButton;
    api.refreshDeliveryEstimate = refreshDeliveryEstimate;
    window.AdvancedCartPreview = api;

    wireRequiredField("full-name", "full-name-field", "full-name-error");
    wireNameDraft();
    wireProceedGate();
    setRowValueText("estimated-delivery-value", emptyEstimateLabel());

    var phoneReady = api.wirePhoneCountryPicker
      ? api.wirePhoneCountryPicker()
      : Promise.resolve();
    Promise.resolve(phoneReady).then(function () {
      if (api.restorePhoneDraft) api.restorePhoneDraft();
      var locating = api.resolveShippingAddress
        ? api.resolveShippingAddress()
        : Promise.resolve();
      return Promise.resolve(locating).then(function () {
        syncProceedButton();
        refreshDeliveryEstimate();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
