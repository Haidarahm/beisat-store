(function () {
  var COMPACT_STYLE_ID = 'account-sheet-compact';
  var FALLBACK_ID = 'account-login-fallback';
  var isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function isLoggedIn() {
    return document.documentElement.getAttribute('data-customer-logged-in') === 'true';
  }

  function isCartPage() {
    return window.location.pathname.indexOf('/cart') !== -1;
  }

  function isCartEmpty() {
    return document.documentElement.getAttribute('data-cart-empty') === 'true';
  }

  function openEmptyCartDrawer() {
    var drawer = document.querySelector('.js-cart-drawer');
    if (!drawer || typeof drawer.open !== 'function') return false;
    drawer.open(document.querySelector('.cart-link') || null);
    return true;
  }

  function accountEl() {
    var nodes = document.querySelectorAll('shopify-account');
    var fallback = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var rect = el.getBoundingClientRect();
      var style = window.getComputedStyle(el);
      var parent = el.parentElement;
      var parentStyle = parent ? window.getComputedStyle(parent) : null;
      var parentHidden =
        parentStyle &&
        (parentStyle.display === 'none' || parentStyle.visibility === 'hidden');
      if (parentHidden || style.display === 'none') continue;
      if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden') return el;
      if (!fallback) fallback = el;
    }
    return fallback || nodes[0] || null;
  }

  function compactSheet(el) {
    if (!el || !el.shadowRoot) return;
    // Skip aggressive height overrides on iOS — they can make the dialog invisible in Safari.
    if (isIOS) return;

    if (!el.shadowRoot.getElementById(COMPACT_STYLE_ID)) {
      var style = document.createElement('style');
      style.id = COMPACT_STYLE_ID;
      style.textContent =
        '.dialog{height:fit-content!important;min-height:0!important;max-height:min(85vh,100%)!important;--dialog-min-height:0!important;border-radius:20px!important;overflow:hidden!important;}' +
        '.account__header{padding:10px 14px!important;gap:8px!important;}' +
        '.account__content{padding:12px 14px 14px!important;gap:10px!important;margin-top:-10px!important;}' +
        '.account__menu-region{margin-top:4px!important;}' +
        '.stack-inline{gap:6px!important;}' +
        '.button.outline{padding:10px 14px!important;min-height:0!important;}';
      el.shadowRoot.appendChild(style);
    }

    var dialog = el.shadowRoot.querySelector('dialog');
    if (!dialog) return;
    dialog.style.setProperty('--dialog-min-height', '0px', 'important');
    dialog.style.setProperty('min-height', '0', 'important');
    dialog.style.setProperty('height', 'fit-content', 'important');
    dialog.style.setProperty('max-height', '85vh', 'important');
  }

  function isOpen(el) {
    if (!el || !el.shadowRoot) return false;
    var dialog = el.shadowRoot.querySelector('dialog');
    return !!(dialog && dialog.open);
  }

  function openShopifyAccount() {
    var el = accountEl();
    if (!el) return false;
    compactSheet(el);
    if (isOpen(el)) {
      hideFallback();
      return true;
    }

    try {
      if (typeof el.showModal === 'function') {
        el.showModal();
        compactSheet(el);
        if (isOpen(el)) {
          hideFallback();
          return true;
        }
      }
    } catch (e) {}

    var btn =
      (el.shadowRoot &&
        (el.shadowRoot.querySelector('[part="signed-out-avatar"]') ||
          el.shadowRoot.querySelector('button'))) ||
      el.querySelector('[slot="signed-out-avatar"]') ||
      el;
    try {
      if (btn && typeof btn.click === 'function') {
        btn.click();
        compactSheet(el);
        if (isOpen(el)) {
          hideFallback();
          return true;
        }
      }
    } catch (e2) {}

    return isOpen(el);
  }

  function hideFallback() {
    var box = document.getElementById(FALLBACK_ID);
    if (box) box.classList.remove('is-visible');
    document.body.classList.remove('account-login-fallback-open');
  }

  function showFallback() {
    if (isLoggedIn() || !isCartPage() || isCartEmpty()) return;
    if (isOpen(accountEl())) return;

    var box = document.getElementById(FALLBACK_ID);
    if (!box) {
      box = document.createElement('div');
      box.id = FALLBACK_ID;
      box.className = 'account-login-fallback';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML =
        '<p class="account-login-fallback__title">Sign in or create account</p>' +
        '<p class="account-login-fallback__text">Continue with Google, Shop, or email to check out.</p>' +
        '<button type="button" class="account-login-fallback__btn" id="account-login-fallback-open">Continue to sign in</button>' +
        '<button type="button" class="account-login-fallback__dismiss" id="account-login-fallback-dismiss">Not now</button>';
      document.body.appendChild(box);

      document.getElementById('account-login-fallback-open').addEventListener('click', function () {
        // Real user gesture — required for iPhone Safari to open the Shopify sheet.
        if (openShopifyAccount()) {
          hideFallback();
          return;
        }
        // Last resort: go to Shopify hosted login (includes Google).
        window.location.href = '/customer_authentication/login?return_to=' + encodeURIComponent('/cart');
      });
      document.getElementById('account-login-fallback-dismiss').addEventListener('click', hideFallback);
    }

    box.classList.add('is-visible');
    document.body.classList.add('account-login-fallback-open');
  }

  function wireCompact() {
    document.querySelectorAll('shopify-account').forEach(function (el) {
      compactSheet(el);
      el.addEventListener('open', function () {
        hideFallback();
        compactSheet(el);
        requestAnimationFrame(function () {
          compactSheet(el);
        });
      });
      el.addEventListener('close', function () {
        // Keep cart usable after dismiss.
      });
    });
  }

  function wireContinue() {
    var btn = document.getElementById('checkout-continue-btn');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();

      if (isCartEmpty()) {
        openEmptyCartDrawer();
        return;
      }

      var api = window.AdvancedCartPreview;
      if (api && typeof api.ensureProceedReady === 'function' && !api.ensureProceedReady()) {
        return;
      }

      if (!isLoggedIn()) {
        if (!openShopifyAccount()) showFallback();
        return;
      }

      if (api && typeof api.goToCheckoutWithPrefill === 'function') {
        api.goToCheckoutWithPrefill();
        return;
      }
      window.location.href = btn.getAttribute('href') || 'https://beisat.space/checkout';
    });
  }

  function tryAutoOpen() {
    if (!isCartPage() || isLoggedIn()) return;

    // Empty cart: open Dawn's default empty drawer, never the login sheet.
    if (isCartEmpty()) {
      var tries = 0;
      var timer = window.setInterval(function () {
        tries += 1;
        if (openEmptyCartDrawer() || tries > 40) window.clearInterval(timer);
      }, 100);
    }

    // Do not auto-open the Shopify account sheet on cart load — on many devices
    // it sits in the browser top layer and hides the sticky Proceed button.
    // Login opens from the Proceed tap (real user gesture; required on iOS).
  }

  function boot() {
    wireCompact();
    wireContinue();
    tryAutoOpen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
