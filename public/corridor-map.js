// ============================================================
// Feature: FX ticker + corridor map (side card)
//
// This file is 100% additive. It does not modify app.js, and it never
// reaches into the payment box's own state directly — it only:
//   (a) reads the existing globals app.js already defines at top level
//       (state, getCountryObj, senderCountrySelect, recipientCountrySelect,
//       senderCountryDropdown, recipientCountryDropdown) — these are
//       ordinary top-level `const`/function bindings, which non-module
//       <script> tags share across files in load order, so no edits to
//       app.js or index.html's existing markup were needed to expose them;
//   (b) listens for 'change' on the two country <select> elements, the
//       same event app.js's own listeners already use, so selecting a
//       country from the real form updates the map/ticker automatically;
//   (c) drives the real form the same way a person would — by invoking
//       the existing custom-dropdown list items — so picking a country on
//       the map runs through the exact same bank-loading / phone-masking
//       logic app.js already has, rather than a parallel reimplementation.
//
// Rates are pulled live from the same /api/fx-quote/:from/:to endpoint the
// rest of the app already uses (open.er-api.com-backed), not mocked.
// ============================================================

(function () {
  'use strict';

  var GEO = window.NEXUS_MAP_GEO;
  if (!GEO) {
    console.error('corridor-map.js: NEXUS_MAP_GEO not found — is nexus-map-geo.js loaded first?');
    return;
  }

  var ORDER = ['SG', 'MY', 'TH', 'PH', 'VN', 'ID'];
  var RAILS = {
    SG: 'FAST',
    MY: 'DuitNow',
    TH: 'PromptPay',
    PH: 'InstaPay/PESONet',
    VN: 'NAPAS 247',
    ID: 'BI-FAST',
  };
  var FLAG_PATH = 'assets/flags/';

  function flagUrl(code) {
    return FLAG_PATH + code.toLowerCase() + '.svg';
  }

  // ---------- wait for app.js's country list to be loaded ----------
  // app.js's init() fetches /api/countries asynchronously and doesn't emit
  // an event when it's done, so we poll the shared `state` binding briefly
  // rather than editing app.js to add one.
  function waitForCountries(cb) {
    if (typeof state !== 'undefined' && state.countries && state.countries.length) {
      cb();
      return;
    }
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (typeof state !== 'undefined' && state.countries && state.countries.length) {
        clearInterval(timer);
        cb();
      } else if (tries > 200) {
        clearInterval(timer);
        var rowsEl = document.getElementById('fxRows');
        if (rowsEl) rowsEl.innerHTML = '<p class="fx-ticker-empty">Could not load country list.</p>';
      }
    }, 50);
  }

  waitForCountries(function () {
    initMap();
    initTicker();
    watchForPaymentCompletion();
  });

  // ============================================================
  // Map
  // ============================================================

  var mapSender = '';
  var mapRecipient = '';
  var pieceEls = {};
  var pulseAnim = null;

  function initMap() {
    var countriesLayer = document.getElementById('countriesLayer');
    var badgesLayer = document.getElementById('badgesLayer');

    ORDER.forEach(function (code) {
      if (code === 'SG') return; // built last, see buildSgMarker() below
      buildCountryPiece(code, countriesLayer, badgesLayer);
    });
    buildSgMarker('SG', countriesLayer, badgesLayer);

    buildConnectorEls();

    // Reflect the real form's current values (in case a country was
    // already picked before this script finished loading).
    mapSender = senderCountrySelect.value || '';
    mapRecipient = recipientCountrySelect.value || '';
    syncMapVisuals();

    // Real form -> map. Adds a second 'change' listener alongside app.js's
    // own; both fire independently, nothing here replaces theirs.
    senderCountrySelect.addEventListener('change', function () {
      mapSender = senderCountrySelect.value || '';
      syncMapVisuals();
      updateTicker();
    });
    recipientCountrySelect.addEventListener('change', function () {
      mapRecipient = recipientCountrySelect.value || '';
      syncMapVisuals();
      updateTicker();
    });
  }

  function buildCountryPiece(code, countriesLayer, badgesLayer) {
    var paths = GEO.paths[code];
    var c = GEO.centroids[code];
    var ns = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'country-piece');
    g.dataset.id = code;

    paths.forEach(function (d) {
      var glow = document.createElementNS(ns, 'path');
      glow.setAttribute('class', 'country-glow');
      glow.setAttribute('d', d);
      g.appendChild(glow);
    });
    paths.forEach(function (d) {
      var line = document.createElementNS(ns, 'path');
      line.setAttribute('class', 'country-line');
      line.setAttribute('d', d);
      g.appendChild(line);
    });
    paths.forEach(function (d) {
      var hit = document.createElementNS(ns, 'path');
      hit.setAttribute('class', 'country-hit');
      hit.setAttribute('d', d);
      g.appendChild(hit);
    });

    var label = document.createElementNS(ns, 'text');
    label.setAttribute('class', 'country-label');
    label.setAttribute('x', c[0]);
    label.setAttribute('y', c[1]);
    label.textContent = code;
    g.appendChild(label);

    countriesLayer.appendChild(g);
    pieceEls[code] = g;
    addFlagBadge(code, c, badgesLayer);

    g.querySelectorAll('.country-hit').forEach(function (hitEl) {
      hitEl.addEventListener('click', function () {
        handleMapClick(code);
      });
    });
  }

  // Singapore is built last so its (deliberately oversized, invisible)
  // click target sits on top of Malaysia's peninsula tip in paint/event
  // order — otherwise Malaysia's hit-path steals clicks near the strait.
  function buildSgMarker(code, countriesLayer, badgesLayer) {
    var c = GEO.centroids.SG;
    var ns = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'sg-marker country-piece');
    g.dataset.id = 'SG';

    var glow = document.createElementNS(ns, 'circle');
    glow.setAttribute('class', 'sg-dot-glow');
    glow.setAttribute('cx', c[0]);
    glow.setAttribute('cy', c[1]);
    glow.setAttribute('r', 6);
    var dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'sg-dot');
    dot.setAttribute('cx', c[0]);
    dot.setAttribute('cy', c[1]);
    dot.setAttribute('r', 3);
    var hit = document.createElementNS(ns, 'circle');
    hit.setAttribute('class', 'sg-hit');
    hit.setAttribute('cx', c[0]);
    hit.setAttribute('cy', c[1]);
    hit.setAttribute('r', 26);

    var label = document.createElementNS(ns, 'text');
    label.setAttribute('class', 'country-label');
    label.setAttribute('x', c[0]);
    label.setAttribute('y', c[1] - 12);
    label.textContent = 'SG';

    g.appendChild(glow);
    g.appendChild(dot);
    g.appendChild(label);
    g.appendChild(hit);
    countriesLayer.appendChild(g);
    pieceEls.SG = g;
    addFlagBadge(code, c, badgesLayer);

    hit.addEventListener('click', function () {
      handleMapClick('SG');
    });
  }

  function addFlagBadge(code, c, badgesLayer) {
    var ns = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'flag-badge');
    g.dataset.id = code;
    var w = 62, h = 22;
    var x = c[0] - w / 2, y = c[1] - h - 10;
    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('class', 'flag-badge-bg');
    bg.setAttribute('x', x); bg.setAttribute('y', y);
    bg.setAttribute('width', w); bg.setAttribute('height', h); bg.setAttribute('rx', 5);
    var img = document.createElementNS(ns, 'image');
    img.setAttribute('href', flagUrl(code));
    img.setAttribute('x', x + 6); img.setAttribute('y', y + 4);
    img.setAttribute('width', 16); img.setAttribute('height', 12);
    var text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'flag-badge-name');
    text.setAttribute('x', x + 27); text.setAttribute('y', y + 14.5);
    text.textContent = code;
    g.appendChild(bg); g.appendChild(img); g.appendChild(text);
    badgesLayer.appendChild(g);
  }

  var connLine, connPulse;
  function buildConnectorEls() {
    var ns = 'http://www.w3.org/2000/svg';
    var layer = document.getElementById('connectorLayer');
    connLine = document.createElementNS(ns, 'path');
    connLine.setAttribute('class', 'connector-line');
    connPulse = document.createElementNS(ns, 'path');
    connPulse.setAttribute('class', 'connector-pulse');
    layer.appendChild(connLine);
    layer.appendChild(connPulse);
  }

  function updateConnector() {
    if (mapSender && mapRecipient) {
      var a = GEO.centroids[mapSender], b = GEO.centroids[mapRecipient];
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var bow = Math.min(36, len * 0.14);
      var cx = mx + nx * bow, cy = my + ny * bow;
      var d = 'M ' + a[0] + ',' + a[1] + ' Q ' + cx + ',' + cy + ' ' + b[0] + ',' + b[1];
      connLine.setAttribute('d', d);
      connPulse.setAttribute('d', d);
      connLine.classList.add('show');
      connPulse.classList.add('show');

      var pathLen = connLine.getTotalLength();
      connPulse.setAttribute('stroke-dasharray', (pathLen * 0.12) + ' ' + (pathLen * 0.88));
      if (pulseAnim) pulseAnim.cancel();
      connPulse.setAttribute('stroke-dashoffset', 0);
      pulseAnim = connPulse.animate(
        [{ strokeDashoffset: 0 }, { strokeDashoffset: -pathLen }],
        { duration: 2200, iterations: Infinity, easing: 'linear' }
      );
    } else {
      connLine.classList.remove('show');
      connPulse.classList.remove('show');
      if (pulseAnim) { pulseAnim.cancel(); pulseAnim = null; }
    }
  }

  function syncMapVisuals() {
    ORDER.forEach(function (code) {
      var el = pieceEls[code];
      if (!el) return;
      el.classList.toggle('is-sender', code === mapSender);
      el.classList.toggle('is-recipient', code === mapRecipient);
    });
    document.querySelectorAll('.flag-badge').forEach(function (b) {
      b.classList.toggle('show', b.dataset.id === mapSender || b.dataset.id === mapRecipient);
    });
    updateConnector();
    updateRouteCard();
  }

  function updateRouteCard() {
    var card = document.getElementById('routeCard');
    if (mapSender && mapRecipient) {
      var s = getCountryObj(mapSender), r = getCountryObj(mapRecipient);
      card.classList.add('show');
      document.getElementById('routeSender').innerHTML =
        '<img src="' + flagUrl(mapSender) + '" alt="" /><div><div class="rs-country">' + s.name + '</div><div class="rs-rail">' + (RAILS[mapSender] || '') + '</div></div>';
      document.getElementById('routeRecipient').innerHTML =
        '<img src="' + flagUrl(mapRecipient) + '" alt="" /><div><div class="rs-country">' + r.name + '</div><div class="rs-rail">' + (RAILS[mapRecipient] || '') + '</div></div>';
    } else {
      card.classList.remove('show');
    }
  }

  // ---------- map click -> real form ----------
  // Selecting a country runs it through the existing custom-dropdown list
  // item, so bank loading / phone masking / everything else app.js already
  // does happens exactly as if the person had picked it from the dropdown.
  // Deselecting (clicking an already-selected country again) mirrors the
  // same reset the form would do, without touching app.js's own listener.
  function handleMapClick(code) {
    if (code === mapSender) {
      clearSenderSelection();
      return;
    }
    if (code === mapRecipient) {
      clearRecipientSelection();
      return;
    }
    if (!mapSender) {
      selectViaDropdown('senderCountryCustom', code);
      return;
    }
    if (!mapRecipient) {
      selectViaDropdown('recipientCountryCustom', code);
      return;
    }
    // Both already set and this is a third, different country: treat it as
    // a fresh sender pick, clearing the old recipient — same behavior the
    // corridor map has used throughout this project.
    clearRecipientSelection();
    selectViaDropdown('senderCountryCustom', code);
  }

  function selectViaDropdown(containerId, code) {
    var li = document.querySelector('#' + containerId + ' .custom-select-list li[data-code="' + code + '"]');
    if (li) li.click();
  }

  function clearSenderSelection() {
    senderCountryDropdown.reset('Select country');
    var prefixEl = document.getElementById('senderCurrencyPrefix');
    if (prefixEl) { prefixEl.textContent = '—'; prefixEl.classList.remove('currency-alt'); }
    senderBankDropdown.reset('Select country first');
    senderBankDropdown.setDisabled(true);
    var fxLine = document.getElementById('fxRateLine');
    if (fxLine) fxLine.hidden = true;
    var convWrap = document.getElementById('convertedAmountWrapper');
    if (convWrap) convWrap.hidden = true;
    mapSender = '';
    syncMapVisuals();
    updateTicker();
  }

  function clearRecipientSelection() {
    recipientCountryDropdown.reset('Select country');
    var phoneInput = document.getElementById('recipientPhone');
    if (phoneInput) { phoneInput.value = ''; phoneInput.disabled = true; phoneInput.placeholder = 'Select country first'; }
    var hint = document.getElementById('recipientPhoneHint');
    if (hint) { hint.hidden = true; hint.textContent = ''; hint.classList.remove('error'); }
    var preview = document.getElementById('recipientPreview');
    if (preview) preview.hidden = true;
    var fxLine = document.getElementById('fxRateLine');
    if (fxLine) fxLine.hidden = true;
    var convWrap = document.getElementById('convertedAmountWrapper');
    if (convWrap) convWrap.hidden = true;
    mapRecipient = '';
    syncMapVisuals();
    updateTicker();
  }

  // ============================================================
  // FX ticker — live data from /api/fx-quote/:from/:to
  // ============================================================

  var tickerToken = 0;

  function initTicker() {
    updateTicker();
    var refreshBtn = document.getElementById('fxRefreshBtn');
    refreshBtn.addEventListener('click', function () {
      updateTicker();
      refreshBtn.classList.remove('spin');
      void refreshBtn.offsetWidth;
      refreshBtn.classList.add('spin');
    });
  }

  function updateTicker() {
    var myToken = ++tickerToken;
    var baseCountry = mapSender ? getCountryObj(mapSender) : null;
    var baseCode = baseCountry ? baseCountry.currency : 'USD';

    document.getElementById('fxBaseCode').textContent = baseCode;
    document.getElementById('fxBaseChip').classList.toggle('is-set', !!mapSender);

    var targets = ORDER.filter(function (c) { return c !== mapSender; })
      .map(function (c) { return getCountryObj(c); })
      .filter(Boolean);

    Promise.all(targets.map(function (country) {
      return fetch('/api/fx-quote/' + baseCode + '/' + country.currency)
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          return data && typeof data.rate === 'number'
            ? { code: country.code, currency: country.currency, rate: data.rate }
            : null;
        })
        .catch(function () { return null; });
    })).then(function (results) {
      if (myToken !== tickerToken) return; // a newer refresh started; drop this one
      renderTicker(baseCode, results.filter(Boolean));
    });
  }

  function fmtRate(n) {
    if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  function renderTicker(baseCode, rows) {
    var container = document.getElementById('fxRows');
    container.innerHTML = '';

    if (!rows.length) {
      if (!mapSender) {
        // USD-quote endpoint may not be supported by every backend build —
        // fall back to telling the person to pick a sender instead of
        // showing an empty box.
        container.innerHTML = '<p class="fx-ticker-empty">Select a sender to see live rates.</p>';
      } else {
        container.innerHTML = '<p class="fx-ticker-empty">Rates unavailable right now.</p>';
      }
      return;
    }

    rows.sort(function (a, b) { return b.rate - a.rate; });

    rows.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'fx-row' + (i === 0 ? ' best' : '') + (r.code === mapRecipient ? ' is-recipient' : '');
      row.innerHTML =
        '<span class="fx-row-left">' +
          '<span class="fx-rank">' + (i + 1) + '</span>' +
          '<img class="fx-row-flag" src="' + flagUrl(r.code) + '" alt="" />' +
          '<span class="fx-row-ccy">' + r.currency + '</span>' +
        '</span>' +
        '<span class="fx-row-right">' +
          '<span class="fx-row-value">1 ' + baseCode + ' = ' + fmtRate(r.rate) + '</span>' +
        '</span>';
      container.appendChild(row);
    });
  }

  // ---------- Reset after a completed payment ----------
  // app.js's resetForm() clears the sender/recipient dropdowns via
  // dropdown.reset(), which intentionally doesn't dispatch a 'change'
  // event (it's also used mid-flow, e.g. while banks are loading, where a
  // real change event would be wrong). So instead of relying on that
  // event, this watches the success panel app.js already creates and
  // inserts after the form (.success-panel, toggled via its `hidden`
  // attribute in showSuccessPanel()/hideSuccessPanel()). The moment it
  // becomes visible, the payment has completed, so:
  //   - the map/ticker are cleared back to their default state, and
  //   - the five-step trace bar is hidden again (app.js shows it via
  //     `trace.hidden = false` in resetTrace() at the start of a send,
  //     but never hides it again once the steps finish).
  // Nothing in app.js is read or modified beyond toggling #trace's
  // existing `hidden` attribute, the same mechanism app.js itself uses.
  function watchForPaymentCompletion() {
    var successPanel = document.querySelector('.success-panel');
    if (!successPanel) return;

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === 'hidden' && !successPanel.hidden) {
          onPaymentCompleted();
        }
      });
    });
    observer.observe(successPanel, { attributes: true });
  }

  function onPaymentCompleted() {
    mapSender = '';
    mapRecipient = '';
    syncMapVisuals();
    updateTicker();

    var traceEl = document.getElementById('trace');
    if (traceEl) traceEl.hidden = true;
  }
})();
