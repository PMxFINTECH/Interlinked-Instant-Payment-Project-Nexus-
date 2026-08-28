const state = {
  countries: [],
};

// Feature: Amount — symbols shown to the sender/recipient. Currency codes
// match countries.json (SGD, MYR, THB, IDR, PHP, VND).
const CURRENCY_SYMBOLS = {
  SGD: 'S$',
  MYR: 'RM',
  THB: '฿',
  IDR: 'Rp',
  PHP: '₱',
  VND: '₫',
};

// Feature: Amount / Currency Conversion — IDR and VND are conventionally
// displayed with no decimal places; the rest use 2.
const CURRENCY_DECIMALS = {
  SGD: 2,
  MYR: 2,
  THB: 2,
  IDR: 0,
  PHP: 2,
  VND: 0,
};

// Feature: Receipt — each country's real-world domestic instant payment
// rail name, shown on the generated PDF for context (e.g. "DuitNow").
const RAIL_NAMES = {
  SG: 'FAST',
  MY: 'DuitNow',
  TH: 'PromptPay',
  PH: 'InstaPay',
  VN: 'NAPAS 247',
  ID: 'BI-FAST',
};

const senderCountrySelect = document.getElementById('senderCountry');
const senderBankSelect = document.getElementById('senderBank');
const senderCurrencyPrefix = document.getElementById('senderCurrencyPrefix');
const amountInput = document.getElementById('amount');
const fxRateLine = document.getElementById('fxRateLine');
const convertedAmountWrapper = document.getElementById('convertedAmountWrapper');
const convertedAmountInput = document.getElementById('convertedAmount');

const recipientCountrySelect = document.getElementById('recipientCountry');
const recipientPhoneInput = document.getElementById('recipientPhone');
const recipientPhoneHint = document.getElementById('recipientPhoneHint');
const recipientPreview = document.getElementById('recipientPreview');
const recipientPreviewName = document.getElementById('recipientPreviewName');
const recipientPreviewBank = document.getElementById('recipientPreviewBank');

const form = document.getElementById('payment-form');
const submitBtn = document.getElementById('submitBtn');
const submitHint = document.getElementById('submitHint');

// UX restructure: the payment trace is now a fluid segmented pill progress
// bar (gradient fill + checkmark steps), living directly under the submit
// row inside the same hub-panel card, replacing the old SVG rail line.
const trace = document.getElementById('trace');
const progressFill = document.getElementById('progressFill');

const STATION_LABELS = ['Compliance', 'Proxy resolution', 'FX conversion', 'Message translation', 'Settled'];

// ---------- Feature: Send confirmation ----------
// Asks "are you sure?" before the payment actually fires, showing exactly
// who the money is going to (name / phone / country) so the sender can
// catch a wrong number before it's too late. Built once and reused so we
// don't leave stray overlay nodes behind on every submit.

function buildConfirmModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;

  const box = document.createElement('div');
  box.className = 'modal-box confirm-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'confirmModalTitle');

  const title = document.createElement('h3');
  title.id = 'confirmModalTitle';
  title.className = 'modal-title confirm-title';
  title.textContent = 'Payment Confirmation';

  const amountBox = document.createElement('div');
  amountBox.className = 'confirm-amount-box';

  const amountEyebrow = document.createElement('span');
  amountEyebrow.className = 'confirm-amount-eyebrow';
  amountEyebrow.textContent = 'Recipient receives';
  amountBox.appendChild(amountEyebrow);

  const amount = document.createElement('div');
  amount.className = 'confirm-amount';
  amountBox.appendChild(amount);

  const amountDivider = document.createElement('hr');
  amountDivider.className = 'confirm-amount-divider';
  amountBox.appendChild(amountDivider);

  const detailsBox = document.createElement('div');
  detailsBox.className = 'confirm-details-box';

  function buildDetailRow(labelText) {
    const row = document.createElement('p');
    row.className = 'confirm-detail-row';
    const label = document.createElement('span');
    label.className = 'confirm-detail-label';
    label.textContent = labelText;
    const value = document.createElement('span');
    value.className = 'confirm-detail-value';
    row.appendChild(label);
    row.appendChild(value);
    detailsBox.appendChild(row);
    return value;
  }

  const nameValue = buildDetailRow('Name');
  const currencyValue = buildDetailRow('Currency');
  const countryValue = buildDetailRow('Country');

  const actions = document.createElement('div');
  actions.className = 'modal-actions confirm-actions';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'modal-btn modal-btn-primary confirm-btn';
  sendBtn.textContent = 'Send Payment';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'modal-btn modal-btn-secondary confirm-btn';
  cancelBtn.textContent = 'Cancel Payment';

  actions.appendChild(sendBtn);
  actions.appendChild(cancelBtn);
  box.appendChild(title);
  box.appendChild(amountBox);
  box.appendChild(detailsBox);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  return { overlay, amount, nameValue, currencyValue, countryValue, cancelBtn, sendBtn };
}

const confirmModalEls = buildConfirmModal();

// Resolves true if the sender clicked Send, false for Cancel / Escape /
// backdrop click. Listeners are attached and torn down per-call so repeat
// opens never double-fire.
function showConfirmModal({ recipientName, countryName, currencyCode, amountText }) {
  return new Promise((resolve) => {
    confirmModalEls.amount.textContent = amountText;
    confirmModalEls.nameValue.textContent = recipientName;
    confirmModalEls.currencyValue.textContent = currencyCode;
    confirmModalEls.countryValue.textContent = countryName;

    confirmModalEls.overlay.hidden = false;
    requestAnimationFrame(() => confirmModalEls.overlay.classList.add('is-open'));
    document.body.classList.add('modal-open');

    function cleanup(result) {
      confirmModalEls.overlay.classList.remove('is-open');
      window.setTimeout(() => { confirmModalEls.overlay.hidden = true; }, 180);
      document.body.classList.remove('modal-open');
      confirmModalEls.cancelBtn.removeEventListener('click', onCancel);
      confirmModalEls.sendBtn.removeEventListener('click', onSend);
      confirmModalEls.overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }

    function onCancel() {
      cleanup(false);
    }
    function onSend() {
      cleanup(true);
    }
    function onOverlayClick(e) {
      if (e.target === confirmModalEls.overlay) cleanup(false);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') cleanup(false);
    }

    confirmModalEls.cancelBtn.addEventListener('click', onCancel);
    confirmModalEls.sendBtn.addEventListener('click', onSend);
    confirmModalEls.overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);

    confirmModalEls.sendBtn.focus();
  });
}

// ---------- Feature: Payment sent confirmation ----------
// Sits directly under the sender/recipient form (.hub-panel), showing
// "here's what just happened to your money" once the rail finishes.

function buildSuccessPanel() {
  const panel = document.createElement('div');
  panel.className = 'success-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'status');

  const header = document.createElement('div');
  header.className = 'success-panel-header';

  const icon = document.createElement('span');
  icon.className = 'success-panel-icon';
  icon.textContent = '✓';
  icon.setAttribute('aria-hidden', 'true');

  const heading = document.createElement('h3');
  heading.textContent = 'Payment sent';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'success-panel-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
  });

  header.appendChild(icon);
  header.appendChild(heading);
  header.appendChild(closeBtn);

  const amountEyebrow = document.createElement('p');
  amountEyebrow.className = 'success-panel-eyebrow';
  amountEyebrow.textContent = 'Amount sent';

  const amount = document.createElement('div');
  amount.className = 'success-panel-amount';

  const body = document.createElement('div');
  body.className = 'success-panel-body';

  // Feature: Receipt — a quiet follow-up action below the recipient/country
  // rows. Disabled until a completed payment actually has data to print.
  const actions = document.createElement('div');
  actions.className = 'success-panel-actions';

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'success-panel-download-btn';
  downloadBtn.disabled = true;
  downloadBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Download receipt</span>';
  downloadBtn.addEventListener('click', () => {
    if (lastReceiptData) downloadReceipt(lastReceiptData);
  });

  actions.appendChild(downloadBtn);

  panel.appendChild(header);
  panel.appendChild(amountEyebrow);
  panel.appendChild(amount);
  panel.appendChild(body);
  panel.appendChild(actions);

  // form === .hub-panel (the sender/recipient info box), so this lands
  // immediately below it — below the whole form now, including the rail.
  form.insertAdjacentElement('afterend', panel);

  return { panel, amount, body, downloadBtn };
}

const successPanelEls = buildSuccessPanel();

// Feature: Receipt — the full payload behind the currently-shown success
// panel, kept around so the download button (which lives in the panel's
// persistent DOM, not the confirm-time closure) always has fresh data.
let lastReceiptData = null;

function showSuccessPanel(data) {
  const { recipientName, countryName, amountText, msgId, createdAt } = data;
  successPanelEls.amount.textContent = amountText;

  successPanelEls.body.innerHTML = '';
  // Reference + timestamp reuse the same msgId/createdAt already generated
  // for the PDF receipt (see downloadReceipt below) so the number on screen
  // always matches the number printed on the downloaded copy.
  const rows = [
    ['Recipient', recipientName],
    ['Country', countryName],
    ['Reference', msgId || '—', true],
    ['Date', formatReceiptDateTime(createdAt), true],
  ];
  rows.forEach(([label, value, mono]) => {
    const p = document.createElement('p');
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = label;
    const valueSpan = document.createElement('span');
    if (mono) valueSpan.className = 'success-panel-mono';
    valueSpan.textContent = value;
    p.appendChild(labelSpan);
    p.appendChild(valueSpan);
    successPanelEls.body.appendChild(p);
  });

  lastReceiptData = data;
  successPanelEls.downloadBtn.disabled = false;

  successPanelEls.panel.hidden = false;
}

function hideSuccessPanel() {
  successPanelEls.panel.hidden = true;
}

// ---------- Feature: Receipt — downloadable PDF ----------
// Draws the receipt directly with jsPDF (rather than rasterizing HTML) so
// the text stays sharp and selectable/searchable in the resulting PDF.
// Layout mirrors the approved prototype: perforation-style rule under the
// header, a faint diagonal watermark behind the cards, sender/recipient
// cards side by side, an amount block with the converted total called out,
// and a footer disclaimer + reference stamp.

function maskAccountId(accountId) {
  if (!accountId) return '—';
  const digits = accountId.replace(/[^0-9]/g, '');
  if (digits.length <= 4) return accountId;
  const prefix = accountId.split('-')[0];
  return `${prefix}-••${digits.slice(-4)}`;
}

function downloadReceipt(data) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error('jsPDF failed to load — cannot generate receipt.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  const ink = [26, 26, 26];
  const inkSoft = [85, 82, 76];
  const inkFaint = [148, 143, 131];
  const lineColor = [216, 212, 200];
  const amber = [190, 128, 32];
  const amberBg = [253, 243, 226];
  const green = [40, 105, 66];

  // Watermark first, so it sits visually behind the white content cards
  // drawn afterward (same effect as z-index in the HTML prototype).
  try {
    doc.setGState(new doc.GState({ opacity: 0.05 }));
  } catch (err) {
    /* older jsPDF builds without the GState plugin — skip transparency */
  }
  doc.setTextColor(...green);
  doc.setFont('courier', 'bold');
  doc.setFontSize(70);
  doc.text('SETTLED', pageWidth / 2, 160, { align: 'center', angle: 18 });
  try {
    doc.setGState(new doc.GState({ opacity: 1 }));
  } catch (err) {
    /* no-op */
  }

  let y = 20;

  // ---- Header ----
  doc.setFillColor(...ink);
  doc.roundedRect(margin, y, 8, 8, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('N', margin + 4, y + 5.6, { align: 'center' });

  doc.setTextColor(...ink);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10.5);
  doc.text('NEXUS IPS', margin + 11, y + 3.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...inkSoft);
  doc.text('Interlinked Instant Payment Simulator', margin + 11, y + 7.6);

  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Payment Receipt', margin + contentWidth, y + 4, { align: 'right' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...inkSoft);
  doc.text(data.msgId || '—', margin + contentWidth, y + 9, { align: 'right' });

  y += 16;
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.6);
  doc.line(margin, y, margin + contentWidth, y);
  y += 8;

  // ---- Status row ----
  const statusRowH = 16;
  doc.setDrawColor(...lineColor);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, contentWidth, statusRowH, 1.5, 1.5, 'FD');

  doc.setFillColor(...green);
  doc.circle(margin + 6, y + statusRowH / 2, 1.1, 'F');
  doc.setTextColor(...green);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.text('COMPLETED', margin + 9, y + statusRowH / 2 + 1.2);

  const createdDate = new Date(data.createdAt);
  const dateText = formatReceiptDateTime(createdDate);
  const corridor = `${data.senderCountryCode || '—'} -> ${data.recipientCountryCode || '—'}`;
  const processingText = Number.isFinite(data.processingSeconds)
    ? `${data.processingSeconds.toFixed(1)}s`
    : '—';

  const metaCols = [
    { label: 'DATE ISSUED', value: dateText, width: 44 },
    { label: 'PROCESSING TIME', value: processingText, width: 30 },
    { label: 'CORRIDOR', value: corridor, width: 22 },
  ];
  const metaTotalWidth = metaCols.reduce((sum, col) => sum + col.width, 0);
  let metaX = margin + contentWidth - metaTotalWidth - 4;
  metaCols.forEach((col) => {
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...inkFaint);
    doc.text(col.label, metaX, y + 5.5);
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...ink);
    doc.text(col.value, metaX, y + 10.5);
    metaX += col.width;
  });

  y += statusRowH + 10;

  // ---- Sender / Recipient cards ----
  const partyGap = 6;
  const partyWidth = (contentWidth - partyGap) / 2;
  const partyHeight = 34;

  function drawParty(x, title, name, rows) {
    doc.setDrawColor(...lineColor);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, partyWidth, partyHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...amber);
    doc.text(title.toUpperCase(), x + 5, y + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...ink);
    doc.text(name || '—', x + 5, y + 14);

    let ry = y + 19;
    rows.forEach(([label, value], idx) => {
      if (idx > 0) {
        doc.setDrawColor(...lineColor);
        doc.setLineDashPattern([0.6, 0.6], 0);
        doc.line(x + 5, ry - 3.4, x + partyWidth - 5, ry - 3.4);
        doc.setLineDashPattern([], 0);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...inkSoft);
      doc.text(label, x + 5, ry);
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...ink);
      doc.text(String(value || '—'), x + partyWidth - 5, ry, { align: 'right' });
      ry += 5.2;
    });
  }

  drawParty(margin, 'Sender', data.senderName, [
    ['Country', data.senderCountryName],
    ['Bank', data.senderBankName],
    ['Sending rail', RAIL_NAMES[data.senderCountryCode] || '—'],
  ]);

  drawParty(margin + partyWidth + partyGap, 'Recipient', data.recipientName, [
    ['Country', data.countryName],
    ['Bank', data.recipientBankName],
    ['Account', maskAccountId(data.recipientAccountId)],
  ]);

  y += partyHeight + 8;

  // ---- Amount block ----
  const amtRowH = 10;
  const totalRowH = 16;
  const amtBlockH = amtRowH * 2 + totalRowH;

  doc.setDrawColor(...lineColor);
  doc.setLineWidth(0.3);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, contentWidth, amtBlockH, 1.5, 1.5, 'FD');

  function amtRow(label, value, ry, rh, big) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...inkSoft);
    doc.text(label, margin + 6, ry + rh / 2 + 1);
    doc.setFont('courier', big ? 'bold' : 'normal');
    doc.setFontSize(big ? 15 : 9.5);
    doc.setTextColor(...ink);
    doc.text(value, margin + contentWidth - 6, ry + rh / 2 + (big ? 1.6 : 1), { align: 'right' });
  }

  const rateText = data.exchangeRate
    ? `1 ${data.fromCurrency} = ${Number(data.exchangeRate).toFixed(4)} ${data.toCurrency}`
    : '—';
  const sentAmountText = formatCurrencyPlain(data.senderAmountRaw, data.fromCurrency);
  const receivedAmountText = formatCurrencyPlain(data.recipientAmountRaw, data.toCurrency);

  amtRow('Amount sent', sentAmountText, y, amtRowH);
  doc.setDrawColor(...lineColor);
  doc.line(margin, y + amtRowH, margin + contentWidth, y + amtRowH);

  amtRow('Exchange rate', rateText, y + amtRowH, amtRowH);
  doc.line(margin, y + amtRowH * 2, margin + contentWidth, y + amtRowH * 2);

  doc.setFillColor(...amberBg);
  doc.rect(margin + 0.3, y + amtRowH * 2 + 0.3, contentWidth - 0.6, totalRowH - 0.6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...ink);
  doc.text('Amount received', margin + 6, y + amtRowH * 2 + totalRowH / 2 + 1.5);
  doc.setFont('courier', 'bold');
  doc.setFontSize(15);
  doc.text(receivedAmountText, margin + contentWidth - 6, y + amtRowH * 2 + totalRowH / 2 + 2, {
    align: 'right',
  });

  y += amtBlockH + 12;

  // ---- Footer ----
  doc.setDrawColor(...lineColor);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  const disclaimer =
    'Bank and recipient names are fictionally generated for illustrative purposes only in a demo. ' +
    'Not affiliated with or endorsed by any institution listed. This receipt is a system-generated ' +
    'record of a simulated transaction and holds no legal or financial value.';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...inkSoft);
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth - 62);
  doc.text(disclaimerLines, margin, y + 3);

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...inkFaint);
  const generatedText = formatReceiptDateTime(new Date());
  doc.text(
    [`Generated ${generatedText}`, `Nexus IPS - Reference ${data.msgId || '—'}`],
    margin + contentWidth,
    y + 3,
    { align: 'right' }
  );

  y += Math.max(disclaimerLines.length * 3.4, 8) + 8;

  // ---- Barcode strip (decorative, deterministic per reference number) ----
  const seed = (data.msgId || 'nexus').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const barWidths = [0.5, 0.9, 1.5, 0.6, 2, 0.8, 1.1];
  const barH = 8;
  let bx = margin;
  let i = 0;
  doc.setFillColor(...ink);
  while (bx < margin + contentWidth) {
    const w = barWidths[(seed + i) % barWidths.length];
    doc.rect(bx, y, w, barH, 'F');
    bx += w + 1.3;
    i += 1;
  }

  const filenameSafe = (data.msgId || `nexus-receipt-${Date.now()}`).replace(/[^a-zA-Z0-9-]/g, '');
  doc.save(`${filenameSafe}.pdf`);
}

// Set right before the real payment request fires, read back once the
// COMPLETED response comes in — keeps the success panel's wording
// identical to what the sender already confirmed in the modal.
let pendingPaymentSummary = null;

init();

async function init() {
  try {
    const res = await fetch('/api/countries');
    state.countries = await res.json();
    populateCountrySelect(senderCountrySelect, state.countries);
    populateCountrySelect(recipientCountrySelect, state.countries);
    senderCountryDropdown.populate(state.countries);
    recipientCountryDropdown.populate(state.countries);
  } catch (err) {
    submitHint.textContent = 'Could not load country list. Is the server running?';
    submitHint.classList.add('error');
  }
}

function populateCountrySelect(select, countries) {
  countries.forEach((country) => {
    const opt = document.createElement('option');
    opt.value = country.code;
    opt.textContent = `${country.name} (${country.currency})`;
    select.appendChild(opt);
  });
}

function getCountryObj(code) {
  return state.countries.find((c) => c.code === code);
}

// ---------- Countries — flag rendering ----------
// Feature: Countries — renders each country's flag as a sourced SVG image
// instead of a Unicode flag emoji. Windows renders flag emoji as plain
// two-letter codes rather than pictures (a platform-level font choice, not
// a bug in this app), so an image asset is the only way to guarantee the
// flag actually looks like a flag for every user regardless of OS. Same
// pattern as BANK_LOGOS below: a lookup map + a neutral fallback.
const COUNTRY_FLAGS = {
  SG: 'sg.svg',
  MY: 'my.svg',
  TH: 'th.svg',
  ID: 'id.svg',
  PH: 'ph.svg',
  VN: 'vn.svg',
};

const FLAG_BASE_PATH = 'assets/flags/';

function buildFlagImg(countryCode, countryName) {
  const img = document.createElement('img');
  img.className = 'flag-icon';
  const file = COUNTRY_FLAGS[countryCode];
  if (file) {
    img.src = FLAG_BASE_PATH + file;
  }
  img.alt = '';
  img.loading = 'lazy';
  img.title = countryName || '';
  return img;
}

// Builds a fully custom, keyboard-accessible listbox over a hidden native
// <select>. The native select stays the source of truth for .value and still
// fires real 'change' events, so all existing logic that reads
// senderCountrySelect.value / recipientCountrySelect.value or listens for
// 'change' on those elements keeps working untouched.
function setupCountryDropdown(containerId, selectEl) {
  const container = document.getElementById(containerId);
  const trigger = container.querySelector('.custom-select-trigger');
  const triggerFlagSlot = trigger.querySelector('.custom-select-flag');
  const triggerLabel = trigger.querySelector('.custom-select-label');
  const list = container.querySelector('.custom-select-list');

  function close() {
    list.classList.remove('is-open');
    window.setTimeout(() => { list.hidden = true; }, 150);
    trigger.setAttribute('aria-expanded', 'false');
  }

  function open() {
    list.hidden = false;
    requestAnimationFrame(() => list.classList.add('is-open'));
    trigger.setAttribute('aria-expanded', 'true');
    const active = list.querySelector('[aria-selected="true"]') || list.querySelector('li');
    if (active) active.focus();
  }

  function toggle() {
    if (!list.classList.contains('is-open')) open();
    else close();
  }

  function selectCountry(country) {
    selectEl.value = country.code;
    triggerFlagSlot.innerHTML = '';
    triggerFlagSlot.appendChild(buildFlagImg(country.code, country.name));
    triggerLabel.textContent = `${country.name} (${country.currency})`;
    list.querySelectorAll('li').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.code === country.code ? 'true' : 'false');
    });
    close();
    trigger.focus();
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function reset(placeholder) {
    selectEl.value = '';
    triggerFlagSlot.innerHTML = '';
    triggerLabel.textContent = placeholder;
    list.querySelectorAll('li').forEach((li) => li.setAttribute('aria-selected', 'false'));
  }

  function populate(countries) {
    list.innerHTML = '';
    countries.forEach((country) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.setAttribute('aria-selected', 'false');
      li.dataset.code = country.code;

      li.appendChild(buildFlagImg(country.code, country.name));

      const textSpan = document.createElement('span');
      textSpan.textContent = `${country.name} (${country.currency})`;

      li.appendChild(textSpan);

      li.addEventListener('click', () => selectCountry(country));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCountry(country);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (li.nextElementSibling) li.nextElementSibling.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (li.previousElementSibling) li.previousElementSibling.focus();
        } else if (e.key === 'Escape') {
          close();
          trigger.focus();
        }
      });

      list.appendChild(li);
    });
  }

  trigger.addEventListener('click', toggle);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) close();
  });

  return { populate, reset };
}

const senderCountryDropdown = setupCountryDropdown('senderCountryCustom', senderCountrySelect);
const recipientCountryDropdown = setupCountryDropdown('recipientCountryCustom', recipientCountrySelect);

// ---------- Banks — logo chips ----------
// Feature: Banks — maps each bank name to a logo asset where we have one on
// file. Names not in this map fall back to an initials chip so every bank
// renders consistently (same tile shape/size) whether or not a real logo
// was sourced. Shared institutions (HSBC, Citibank, Standard Chartered,
// UOB, Maybank, CIMB, RHB) reuse one asset across the countries they
// appear in under slightly different label text.
const BANK_LOGOS = {
  'DBS Bank': 'D05.SI.svg',
  'OCBC Bank': 'O39.SI.svg',
  'UOB': 'U11.SI_BIG.svg',
  'UOB Malaysia': 'U11.SI_BIG.svg',
  'UOB Thailand': 'U11.SI_BIG.svg',
  'UOB Indonesia': 'U11.SI_BIG.svg',
  'HSBC': 'HSBC.svg',
  'Citibank': 'C.svg',
  'Standard Chartered': 'STAN.L.svg',
  'Maybank Singapore': 'MLYBY.svg',
  'Maybank': 'MLYBY.svg',
  'CIMB Singapore': '1023.KL.svg',
  'CIMB Bank': '1023.KL.svg',
  'CIMB Niaga': '1023.KL.svg',
  'RHB Bank Singapore': 'RHB_Logo.svg.webp',
  'RHB Bank': 'RHB_Logo.svg.webp',
  'Bank of China (Singapore)': '601988.SS.svg',
  'Public Bank': '1295.KL.svg',
  'Hong Leong Bank': '5819.KL.svg',
  'Bangkok Bank': 'BBL.BK.svg',
  'Kasikornbank': 'KBANK.BK.svg',
  'Siam Commercial Bank': 'SCB.BK.svg',
  'Krung Thai Bank': 'KTB.BK.svg',
  'Bank of Ayudhya (Krungsri)': 'BAY.BK.svg',
  'TMBThanachart Bank': 'TTB.BK.svg',
  'Bank Central Asia (BCA)': 'BBCA.JK.svg',
  'Bank Mandiri': 'BMRI.JK.svg',
  'Bank Rakyat Indonesia (BRI)': 'BBRI.JK.svg',
  'Bank Negara Indonesia (BNI)': 'BBNI.JK.svg',
  'Bank Danamon': 'BDMN.JK.png',
  'BDO Unibank': 'BDOUY.svg',
  'Bank of the Philippine Islands (BPI)': 'BPHLY.svg',
  'Metrobank': 'MTPOY.svg',
  'BIDV': 'BID.VN.svg',
  'AmBank': 'ambank.webp',
  'Land Bank of the Philippines': 'landbank.webp',
  'Philippine National Bank (PNB)': 'pnb.png',
  'Security Bank': 'security-bank.jpg',
  'UnionBank': 'unionbank.png',
  'Vietcombank': 'vietcombank.webp',
  'Techcombank': 'techcombank.png',
  'VietinBank': 'vietinbank.png',
  'Asia Commercial Bank (ACB)': 'acb.webp',
  'Sacombank': 'sacombank.png',
  'ANZ Vietnam': 'anz-vietnam.webp',
};

const LOGO_BASE_PATH = 'assets/banks/';

function getBankInitials(name) {
  const words = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function buildBankChip(bankName) {
  const chip = document.createElement('span');
  chip.className = 'bank-chip';

  const logoFile = BANK_LOGOS[bankName];
  if (logoFile) {
    const img = document.createElement('img');
    img.src = LOGO_BASE_PATH + logoFile;
    img.alt = '';
    img.loading = 'lazy';
    chip.appendChild(img);
  } else {
    chip.classList.add('bank-chip-fallback');
    chip.textContent = getBankInitials(bankName);
  }

  return chip;
}

// Same wrapping pattern as setupCountryDropdown: a hidden native <select>
// stays the source of truth for .value and 'change' events, with a custom
// listbox layered on top so each option can show a logo chip.
function setupBankDropdown(containerId, selectEl) {
  const container = document.getElementById(containerId);
  const trigger = container.querySelector('.custom-select-trigger');
  const triggerChipSlot = trigger.querySelector('.custom-select-chip-slot');
  const triggerLabel = trigger.querySelector('.custom-select-label');
  const list = container.querySelector('.custom-select-list');

  function close() {
    list.classList.remove('is-open');
    window.setTimeout(() => { list.hidden = true; }, 150);
    trigger.setAttribute('aria-expanded', 'false');
  }

  function open() {
    if (trigger.disabled) return;
    list.hidden = false;
    requestAnimationFrame(() => list.classList.add('is-open'));
    trigger.setAttribute('aria-expanded', 'true');
    const active = list.querySelector('[aria-selected="true"]') || list.querySelector('li');
    if (active) active.focus();
  }

  function toggle() {
    if (!list.classList.contains('is-open')) open();
    else close();
  }

  function selectBank(bankName) {
    selectEl.value = bankName;
    triggerChipSlot.innerHTML = '';
    triggerChipSlot.appendChild(buildBankChip(bankName));
    triggerLabel.textContent = bankName;
    list.querySelectorAll('li').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.bank === bankName ? 'true' : 'false');
    });
    close();
    trigger.focus();
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function reset(placeholder) {
    selectEl.value = '';
    triggerChipSlot.innerHTML = '';
    triggerLabel.textContent = placeholder;
    list.innerHTML = '';
  }

  function setDisabled(isDisabled) {
    trigger.disabled = isDisabled;
    trigger.classList.toggle('is-disabled', isDisabled);
    if (isDisabled) close();
  }

  function populate(bankNames) {
    list.innerHTML = '';
    bankNames.forEach((bankName) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.setAttribute('aria-selected', 'false');
      li.dataset.bank = bankName;

      li.appendChild(buildBankChip(bankName));

      const textSpan = document.createElement('span');
      textSpan.textContent = bankName;
      li.appendChild(textSpan);

      li.addEventListener('click', () => selectBank(bankName));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectBank(bankName);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (li.nextElementSibling) li.nextElementSibling.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (li.previousElementSibling) li.previousElementSibling.focus();
        } else if (e.key === 'Escape') {
          close();
          trigger.focus();
        }
      });

      list.appendChild(li);
    });
  }

  trigger.addEventListener('click', toggle);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) close();
  });

  return { populate, reset, setDisabled };
}

const senderBankDropdown = setupBankDropdown('senderBankCustom', senderBankSelect);

// ---------- Debounce helper ----------

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ---------- Amount formatting (box 1) ----------
// Feature: Amount — live thousands-separator formatting as the sender types,
// keeping a clean numeric value available underneath for calculations/submit.

function formatAmountInputValue(raw) {
  let cleaned = raw.replace(/[^\d.]/g, '');

  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  const [intPart, decPart] = cleaned.split('.');
  const intWithCommas = intPart ? Number(intPart).toLocaleString('en-US') : '';

  if (decPart !== undefined) {
    return `${intWithCommas}.${decPart.slice(0, 2)}`;
  }
  return intWithCommas;
}

function getRawAmountValue() {
  const numeric = Number(amountInput.value.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value, currencyCode) {
  const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  const decimals = CURRENCY_DECIMALS[currencyCode] ?? 2;
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const formatted = number.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol} ${formatted}`;
}

// Feature: Receipt — jsPDF's built-in fonts only cover WinAnsi/Latin
// characters, so ฿ (THB), ₱ (PHP), and ₫ (VND) either render as missing-
// glyph boxes or get measured at the wrong width (which is what pushed
// text off the page edge). The PDF uses ISO currency codes instead of
// symbols everywhere, never the CURRENCY_SYMBOLS glyphs.
function formatCurrencyPlain(value, currencyCode) {
  const decimals = CURRENCY_DECIMALS[currencyCode] ?? 2;
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const formatted = number.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currencyCode || ''} ${formatted}`.trim();
}

// Feature: Receipt — a fixed, locale-independent date formatter for the
// PDF. toLocaleString's AM/PM output varies by browser/OS (extra spaces,
// different casing) and was overflowing its column; this is always the
// same length and ASCII-only.
function formatReceiptDateTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

function formatRate(rate) {
  return Number(rate).toLocaleString('en-US', { maximumFractionDigits: 4 });
}

amountInput.addEventListener('input', () => {
  amountInput.value = formatAmountInputValue(amountInput.value);
  debouncedUpdateConvertedAmount();
});

// ---------- FX Rate + Currency Conversion (box 2) ----------
// Feature: FX Rate — shows "1 SGD = X IDR" as soon as both currencies are known.
// Feature: Currency Conversion — shows the live converted amount as the
// sender types into box 1. Both pull from GET /api/fx-quote/:from/:to.

async function updateFxRate() {
  const sender = getCountryObj(senderCountrySelect.value);
  const recipient = getCountryObj(recipientCountrySelect.value);

  if (!sender || !recipient) {
    fxRateLine.hidden = true;
    return;
  }

  try {
    const res = await fetch(`/api/fx-quote/${sender.currency}/${recipient.currency}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'FX quote failed');

    fxRateLine.textContent = `1 ${sender.currency} = ${formatRate(data.rate)} ${recipient.currency}`;
    fxRateLine.hidden = false;
  } catch (err) {
    fxRateLine.hidden = true;
  }
}

async function updateConvertedAmount() {
  const sender = getCountryObj(senderCountrySelect.value);
  const recipient = getCountryObj(recipientCountrySelect.value);
  const rawAmount = getRawAmountValue();

  if (!sender || !recipient || !rawAmount || rawAmount <= 0) {
    convertedAmountWrapper.hidden = true;
    convertedAmountInput.value = '';
    return;
  }

  try {
    const res = await fetch(`/api/fx-quote/${sender.currency}/${recipient.currency}?amount=${rawAmount}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'FX quote failed');

    convertedAmountInput.value = formatCurrency(data.convertedAmount, recipient.currency);
    convertedAmountWrapper.hidden = false;
  } catch (err) {
    convertedAmountWrapper.hidden = true;
    convertedAmountInput.value = '';
  }
}

const debouncedUpdateConvertedAmount = debounce(updateConvertedAmount, 300);

function refreshFxDisplays() {
  updateFxRate();
  updateConvertedAmount();
}

// ---------- Sender country / bank ----------

senderCountrySelect.addEventListener('change', async () => {
  const code = senderCountrySelect.value;
  const country = getCountryObj(code);
  senderCurrencyPrefix.textContent = country ? (CURRENCY_SYMBOLS[country.currency] || country.currency) : '—';

  senderBankSelect.disabled = true;
  senderBankDropdown.reset('Loading banks…');
  senderBankDropdown.setDisabled(true);

  try {
    const res = await fetch(`/api/banks/${code}`);
    const banks = await res.json();

    senderBankSelect.innerHTML = '<option value="" disabled selected>Select bank</option>';
    banks.forEach((bank) => {
      const opt = document.createElement('option');
      opt.value = bank;
      opt.textContent = bank;
      senderBankSelect.appendChild(opt);
    });

    senderBankDropdown.reset('Select bank');
    senderBankDropdown.populate(banks);
    senderBankDropdown.setDisabled(false);
    senderBankSelect.disabled = false;
  } catch (err) {
    senderBankDropdown.reset('Could not load banks');
  }

  refreshFxDisplays();
});

// ---------- Recipient phone masking ----------
// Feature: Recipient Phone Number — auto-inserts spaces as the person types,
// mirroring each country's phoneExample layout so it works for any country
// without needing extra formatting data.

function getPhoneFormat(country) {
  const dialDigits = country.dialCode.replace(/\D/g, '');
  const cleanExample = country.phoneExample.replace(/[^\d\s]/g, '').trim();
  const tokens = cleanExample.split(/\s+/).filter(Boolean);
  let groupSizes = tokens.slice(1).map((t) => t.length);

  if (groupSizes.length === 0) {
    groupSizes = [country.phoneDigits];
  }

  return { dialDigits, groupSizes };
}

function formatPhoneValue(digitsAfterDial, dialDigits, groupSizes) {
  let result = `+${dialDigits}`;
  let idx = 0;

  for (const size of groupSizes) {
    const chunk = digitsAfterDial.slice(idx, idx + size);
    if (chunk.length === 0) break;
    result += ` ${chunk}`;
    idx += size;
  }

  return result;
}

function applyPhoneMask() {
  const country = getCountryObj(recipientCountrySelect.value);
  if (!country) return;

  const { dialDigits, groupSizes } = getPhoneFormat(country);
  let digits = recipientPhoneInput.value.replace(/\D/g, '');

  // If there aren't more digits than the dial code itself, the person has
  // backspaced into (or not yet past) the dial code — snap back to the bare
  // dial code rather than treating a partially-deleted dial code as the
  // start of a national number (that's what produced a stray leftover digit).
  if (digits.length <= dialDigits.length) {
    recipientPhoneInput.value = `+${dialDigits}`;
    return;
  }

  if (digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }

  digits = digits.slice(0, country.phoneDigits);
  recipientPhoneInput.value = formatPhoneValue(digits, dialDigits, groupSizes);
}

recipientCountrySelect.addEventListener('change', () => {
  const code = recipientCountrySelect.value;
  const country = getCountryObj(code);

  hideRecipientPreview();

  if (!country) {
    clearPhoneHint();
    recipientPhoneInput.value = '';
    recipientPhoneInput.disabled = true;
    recipientPhoneInput.placeholder = 'Select country first';
    refreshFxDisplays();
    return;
  }

  recipientPhoneInput.disabled = false;
  recipientPhoneInput.placeholder = country.phoneExample;
  // Pre-fill the dial code so the person only has to type the national number.
  recipientPhoneInput.value = `+${country.dialCode.replace(/\D/g, '')}`;
  showFormatHint(country);

  refreshFxDisplays();
});

// Validates the recipient phone number against the selected recipient
// country's dial code + expected digit length. Mirrors the same check the
// server re-runs in routes/payments.js, so the person gets instant feedback
// here but the server never trusts this alone.
function validateRecipientPhone() {
  const code = recipientCountrySelect.value;
  const country = getCountryObj(code);
  if (!country) return true; // nothing to validate yet — country not chosen

  const value = recipientPhoneInput.value.trim();
  if (!value) {
    setPhoneError(`Phone number is required, e.g. ${country.phoneExample}`);
    return false;
  }

  const compact = value.replace(/[\s-]/g, '');

  if (!compact.startsWith(country.dialCode)) {
    setPhoneError(`Phone number must start with ${country.dialCode} for ${country.name}, e.g. ${country.phoneExample}`);
    return false;
  }

  const nationalNumber = compact.slice(country.dialCode.length);
  if (!/^\d+$/.test(nationalNumber) || nationalNumber.length !== country.phoneDigits) {
    setPhoneError(`${country.name} numbers need ${country.phoneDigits} digits after ${country.dialCode}, e.g. ${country.phoneExample}`);
    return false;
  }

  showFormatHint(country);
  return true;
}

// Side-effect-free version of the same check validateRecipientPhone runs —
// used while the person is still typing, where we want to know "is this
// number complete yet?" without flashing the red error hint on every
// debounce tick before they've finished entering it.
function isRecipientPhoneComplete(country) {
  const value = recipientPhoneInput.value.trim();
  if (!value) return false;

  const compact = value.replace(/[\s-]/g, '');
  if (!compact.startsWith(country.dialCode)) return false;

  const nationalNumber = compact.slice(country.dialCode.length);
  return /^\d+$/.test(nationalNumber) && nationalNumber.length === country.phoneDigits;
}

// Feature: Recipient Phone Number — the hint line under the field has two
// states: a neutral "here's the format" guide (shown as soon as a country is
// picked, and again once the number becomes valid) and a red validation
// error (shown only on blur/submit, never mid-typing, so the field doesn't
// flash red after the very first keystroke).
function showFormatHint(country) {
  recipientPhoneHint.textContent = `Format: ${country.phoneExample}`;
  recipientPhoneHint.hidden = false;
  recipientPhoneHint.classList.remove('error');
  recipientPhoneInput.classList.remove('input-error');
}

function setPhoneError(message) {
  recipientPhoneHint.textContent = message;
  recipientPhoneHint.hidden = false;
  recipientPhoneHint.classList.add('error');
  recipientPhoneInput.classList.add('input-error');
}

function clearPhoneHint() {
  recipientPhoneHint.textContent = '';
  recipientPhoneHint.hidden = true;
  recipientPhoneHint.classList.remove('error');
  recipientPhoneInput.classList.remove('input-error');
}

// ---------- Recipient preview (name + bank) ----------
// Feature: Recipient — reveals the resolved name/bank as soon as the phone
// number is valid, via GET /api/recipient/:country/:phone. Replaces waiting
// for full submission to learn who the money is going to.

function hideRecipientPreview() {
  recipientPreview.hidden = true;
  recipientPreviewName.textContent = '';
  recipientPreviewBank.textContent = '';
}

async function updateRecipientPreview() {
  const country = getCountryObj(recipientCountrySelect.value);
  if (!country || !isRecipientPhoneComplete(country)) {
    hideRecipientPreview();
    return;
  }

  const phone = recipientPhoneInput.value.trim();

  try {
    const res = await fetch(`/api/recipient/${country.code}/${encodeURIComponent(phone)}`);
    const data = await res.json();

    if (!res.ok || !data.valid) {
      hideRecipientPreview();
      return;
    }

    recipientPreviewName.textContent = data.recipient.recipientName;
    recipientPreviewBank.textContent = data.recipient.bankName;
    recipientPreview.hidden = false;
  } catch (err) {
    hideRecipientPreview();
  }
}

const debouncedUpdateRecipientPreview = debounce(updateRecipientPreview, 400);

recipientPhoneInput.addEventListener('keydown', (e) => {
  // Feature: Recipient Phone Number — group spacing is inserted
  // automatically by applyPhoneMask below based on each country's format,
  // so a manually typed space is never meaningful here. Blocking it
  // outright (rather than stripping it after the fact) avoids the caret
  // jumping around when the mask rewrites the field's value mid-type.
  if (e.key === ' ') {
    e.preventDefault();
  }
});

recipientPhoneInput.addEventListener('input', () => {
  applyPhoneMask();

  // No validation here — the format hint underneath already shows the
  // expected pattern, and switching to a red error mid-keystroke felt
  // premature. Real validation runs on blur and on submit instead.
  debouncedUpdateRecipientPreview();
});

recipientPhoneInput.addEventListener('blur', () => {
  validateRecipientPhone();
  updateRecipientPreview();
});

// ---------- Submit ----------

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitHint.textContent = '';
  submitHint.classList.remove('error');

  if (!validateRecipientPhone()) {
    submitHint.textContent = 'Fix the recipient phone number before sending.';
    submitHint.classList.add('error');
    recipientPhoneInput.focus();
    return;
  }

  const rawAmount = getRawAmountValue();
  if (!rawAmount || rawAmount <= 0) {
    submitHint.textContent = 'Enter a valid amount before sending.';
    submitHint.classList.add('error');
    amountInput.focus();
    return;
  }

  // Feature: Send confirmation — gate the actual request behind an explicit
  // Send/Cancel so a mistyped digit doesn't move money before the sender
  // has a chance to double-check who it's going to.
  const senderCountry = getCountryObj(senderCountrySelect.value);
  const recipientCountry = getCountryObj(recipientCountrySelect.value);
  const senderAmountText = formatCurrency(rawAmount, senderCountry ? senderCountry.currency : '');
  const recipientAmountText = convertedAmountInput.value || senderAmountText;
  const recipientNameForConfirm = recipientPreviewName.textContent || 'the recipient';
  const countryNameForConfirm = recipientCountry ? recipientCountry.name : recipientCountrySelect.value;

  const confirmed = await showConfirmModal({
    recipientName: recipientNameForConfirm,
    countryName: countryNameForConfirm,
    currencyCode: recipientCountry ? recipientCountry.currency : '',
    amountText: recipientAmountText,
  });

  if (!confirmed) {
    submitHint.textContent = 'Payment cancelled.';
    return;
  }

  pendingPaymentSummary = {
    recipientName: recipientNameForConfirm,
    countryName: countryNameForConfirm,
    amountText: recipientAmountText,
    senderName: document.getElementById('senderName').value,
    senderCountryCode: senderCountrySelect.value,
    senderCountryName: senderCountry ? senderCountry.name : senderCountrySelect.value,
    senderBankName: senderBankSelect.value,
    senderCurrency: senderCountry ? senderCountry.currency : '',
    senderAmountText,
    senderAmountRaw: rawAmount,
    recipientCountryCode: recipientCountrySelect.value,
    // Feature: Receipt — "processing time" on the receipt is measured from
    // here (when the sender's request actually starts going out), not from
    // when Send was first clicked, so it doesn't include time spent on the
    // confirm modal.
    requestStartedAt: performance.now(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  resetTrace();

  const payload = {
    senderName: document.getElementById('senderName').value,
    senderCountry: senderCountrySelect.value,
    senderBank: senderBankSelect.value,
    amount: rawAmount,
    recipientCountry: recipientCountrySelect.value,
    recipientPhone: recipientPhoneInput.value.trim(),
  };

  try {
    const res = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.status === 'BLOCKED') {
      await runBlockedTrace(data);
    } else if (data.status === 'COMPLETED') {
      await runCompletedTrace(data);
    } else {
      submitHint.textContent = data.error || 'Payment could not be processed.';
      submitHint.classList.add('error');
    }
  } catch (err) {
    submitHint.textContent = 'Request failed. Is the server running?';
    submitHint.classList.add('error');
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send payment';
});

function resetTrace() {
  trace.hidden = false;
  hideSuccessPanel();
  progressFill.style.width = '0%';
  progressFill.classList.remove('blocked');
  document.querySelectorAll('.progress-dot').forEach((s) => s.classList.remove('done', 'blocked'));
  document.querySelectorAll('.progress-label').forEach((s) => s.classList.remove('done', 'blocked'));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lightStation(index, blocked = false) {
  const statusClass = blocked ? 'blocked' : 'done';
  document.querySelector(`.progress-dot[data-station="${index}"]`).classList.add(statusClass);
  document.querySelector(`.progress-label[data-station="${index}"]`).classList.add(statusClass);
  progressFill.style.width = `${(index / (STATION_LABELS.length - 1)) * 100}%`;
  if (blocked) progressFill.classList.add('blocked');
}

async function runBlockedTrace(data) {
  await wait(200);
  lightStation(0, true);

  const reason = data.compliance?.reason || data.reason || 'Sender failed sanctions screening.';
  submitHint.textContent = `Payment blocked at compliance screening — ${reason}`;
  submitHint.classList.add('error');
}

async function runCompletedTrace(data) {
  await wait(200);
  lightStation(0);

  await wait(500);
  lightStation(1);

  await wait(500);
  lightStation(2);

  await wait(500);
  lightStation(3);

  await wait(500);
  lightStation(4);

  if (pendingPaymentSummary) {
    const msg = data.message || {};
    const grpHdr = msg.GrpHdr || {};
    const txInf = msg.CdtTrfTxInf || {};
    const recipient = data.recipient || {};
    const fx = data.fx || {};

    const elapsedSeconds =
      (performance.now() - (pendingPaymentSummary.requestStartedAt || performance.now())) / 1000;

    const receiptData = {
      ...pendingPaymentSummary,
      recipientBankName: recipient.bankName || txInf.CdtrAgt?.FinInstnId?.Nm || '',
      recipientAccountId: recipient.accountId || txInf.CdtrAcct?.Id || '',
      msgId: grpHdr.MsgId || '',
      createdAt: grpHdr.CreDtTm || new Date().toISOString(),
      exchangeRate: fx.rate ?? txInf.XchgRateInf?.XchgRate ?? null,
      fromCurrency: fx.fromCurrency || pendingPaymentSummary.senderCurrency,
      toCurrency: fx.toCurrency || '',
      recipientAmountRaw: Number.isFinite(fx.convertedAmount) ? fx.convertedAmount : null,
      processingSeconds: elapsedSeconds,
    };

    showSuccessPanel(receiptData);
    pendingPaymentSummary = null;
  }

  resetForm();
}

// Feature: Payment sent confirmation — once the money's on its way, clear
// every field so the form is ready for the next payment rather than
// leaving the last recipient's details sitting on screen.
function resetForm() {
  document.getElementById('senderName').value = '';
  senderCountryDropdown.reset('Select country');
  senderCurrencyPrefix.textContent = '—';
  senderBankDropdown.reset('Select country first');
  senderBankDropdown.setDisabled(true);

  amountInput.value = '';
  fxRateLine.hidden = true;
  fxRateLine.textContent = '';
  convertedAmountWrapper.hidden = true;
  convertedAmountInput.value = '';

  recipientCountryDropdown.reset('Select country');
  recipientPhoneInput.value = '';
  recipientPhoneInput.disabled = true;
  recipientPhoneInput.placeholder = 'Select country first';
  clearPhoneHint();
  hideRecipientPreview();
}
