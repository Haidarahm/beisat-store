(function () {
  "use strict";

  var DRAFT_KEY = "checkout_preview_draft";

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
        message: "Full name is required",
      });
    }

    var phoneResult = { ok: false, message: "Phone number is required" };
    var api = window.AdvancedCartPreview;
    if (!phoneRaw) {
      phoneResult = { ok: false, message: "Phone number is required" };
    } else if (api && typeof api.validatePhoneNumber === "function") {
      try {
        phoneResult = api.validatePhoneNumber(phoneRaw) || phoneResult;
        if (!phoneResult || typeof phoneResult.ok === "undefined") {
          phoneResult = { ok: false, message: "Enter a valid phone number" };
        }
      } catch (e) {
        phoneResult = { ok: false, message: "Enter a valid phone number" };
      }
    } else {
      // Digits present but country rules not loaded yet — keep proceed disabled.
      phoneResult = { ok: false, message: "Enter a valid phone number" };
    }

    if (!phoneResult.ok) {
      issues.push({
        id: "phone",
        focusEl: phoneEl,
        scrollEl: document.getElementById("phone-number-field") || phoneEl,
        fieldId: "phone-number-field",
        errorId: "phone-number-error",
        inputId: "phone-number",
        message: phoneResult.message || "Enter a valid phone number",
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
        message: (byId.name && byId.name.message) || "Full name is required",
      },
      !!(revealedErrors.name && byId.name)
    );
    markFieldError(
      {
        fieldId: "phone-number-field",
        errorId: "phone-number-error",
        inputId: "phone-number",
        message: (byId.phone && byId.phone.message) || "Enter a valid phone number",
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

  function boot() {
    if (!document.getElementById("advanced-cart-preview-root")) return;
    var api = window.AdvancedCartPreview || {};
    api.draftGet = draftGet;
    api.draftPatch = draftPatch;
    api.collectCheckoutFields = collectCheckoutFields;
    api.goToCheckoutWithPrefill = goToCheckoutWithPrefill;
    api.ensureProceedReady = ensureProceedReady;
    api.syncProceedButton = syncProceedButton;
    window.AdvancedCartPreview = api;

    wireRequiredField("full-name", "full-name-field", "full-name-error");
    wireNameDraft();
    wireProceedGate();

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
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
