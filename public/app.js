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

const trace = document.getElementById('trace');
const railProgress = document.getElementById('rail-progress');
const stationCardsEl = document.getElementById('stationCards');
const messageBlock = document.getElementById('messageBlock');
const messageJsonEl = document.getElementById('messageJson');
const toggleMessageBtn = document.getElementById('toggleMessage');

const STATION_X = [60, 255, 450, 645, 840];
const STATION_LABELS = ['Compliance', 'Proxy resolution', 'FX conversion', 'Message translation', 'Settled'];

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
// Feature: Countries — derives the flag emoji directly from each country's
// ISO 3166-1 alpha-2 code (SG, MY, TH, ID, PH, VN) rather than fetching
// external logo images, so there's no asset loading or licensing to manage.

function countryCodeToFlagEmoji(code) {
  if (!code || code.length !== 2) return '';
  const codePoints = [...code.toUpperCase()].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Builds a fully custom, keyboard-accessible listbox over a hidden native
// <select>. The native select stays the source of truth for .value and still
// fires real 'change' events, so all existing logic that reads
// senderCountrySelect.value / recipientCountrySelect.value or listens for
// 'change' on those elements keeps working untouched.
function setupCountryDropdown(containerId, selectEl) {
  const container = document.getElementById(containerId);
  const trigger = container.querySelector('.custom-select-trigger');
  const triggerFlag = trigger.querySelector('.custom-select-flag');
  const triggerLabel = trigger.querySelector('.custom-select-label');
  const list = container.querySelector('.custom-select-list');

  function close() {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function open() {
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const active = list.querySelector('[aria-selected="true"]') || list.querySelector('li');
    if (active) active.focus();
  }

  function toggle() {
    if (list.hidden) open();
    else close();
  }

  function selectCountry(country) {
    selectEl.value = country.code;
    triggerFlag.textContent = countryCodeToFlagEmoji(country.code);
    triggerLabel.textContent = `${country.name} (${country.currency})`;
    list.querySelectorAll('li').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.code === country.code ? 'true' : 'false');
    });
    close();
    trigger.focus();
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function populate(countries) {
    list.innerHTML = '';
    countries.forEach((country) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.setAttribute('aria-selected', 'false');
      li.dataset.code = country.code;

      const flagSpan = document.createElement('span');
      flagSpan.className = 'custom-select-flag';
      flagSpan.textContent = countryCodeToFlagEmoji(country.code);

      const textSpan = document.createElement('span');
      textSpan.textContent = `${country.name} (${country.currency})`;

      li.appendChild(flagSpan);
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

  return { populate };
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
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function open() {
    if (trigger.disabled) return;
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const active = list.querySelector('[aria-selected="true"]') || list.querySelector('li');
    if (active) active.focus();
  }

  function toggle() {
    if (list.hidden) open();
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

  if (digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }

  digits = digits.slice(0, country.phoneDigits);
  recipientPhoneInput.value = formatPhoneValue(digits, dialDigits, groupSizes);
}

recipientCountrySelect.addEventListener('change', () => {
  const code = recipientCountrySelect.value;
  const country = getCountryObj(code);

  clearPhoneHint();
  hideRecipientPreview();

  if (!country) {
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
    setPhoneHint(`Phone number is required, e.g. ${country.phoneExample}`);
    return false;
  }

  const compact = value.replace(/[\s-]/g, '');

  if (!compact.startsWith(country.dialCode)) {
    setPhoneHint(`Phone number must start with ${country.dialCode} for ${country.name}, e.g. ${country.phoneExample}`);
    return false;
  }

  const nationalNumber = compact.slice(country.dialCode.length);
  if (!/^\d+$/.test(nationalNumber) || nationalNumber.length !== country.phoneDigits) {
    setPhoneHint(`${country.name} numbers need ${country.phoneDigits} digits after ${country.dialCode}, e.g. ${country.phoneExample}`);
    return false;
  }

  clearPhoneHint();
  return true;
}

function setPhoneHint(message) {
  recipientPhoneHint.textContent = message;
  recipientPhoneHint.hidden = false;
  recipientPhoneInput.classList.add('input-error');
}

function clearPhoneHint() {
  recipientPhoneHint.textContent = '';
  recipientPhoneHint.hidden = true;
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
  if (!country || !validateRecipientPhone()) {
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

recipientPhoneInput.addEventListener('input', () => {
  applyPhoneMask();

  // Only show errors once the person has typed something worth checking —
  // avoids flashing red on the very first keystroke.
  if (recipientPhoneInput.value.replace(/\D/g, '').length > 0) validateRecipientPhone();

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
  submitBtn.textContent = 'Send payment →';
});

function resetTrace() {
  trace.hidden = false;
  railProgress.setAttribute('x2', STATION_X[0]);
  railProgress.classList.remove('blocked');
  document.querySelectorAll('.rail-station').forEach((s) => s.classList.remove('done', 'blocked'));
  stationCardsEl.innerHTML = '';
  messageBlock.hidden = true;
  messageJsonEl.hidden = true;
  toggleMessageBtn.textContent = 'Show ISO 20022–style message ▾';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lightStation(index, blocked = false) {
  const stationEl = document.querySelector(`.rail-station[data-station="${index}"]`);
  stationEl.classList.add(blocked ? 'blocked' : 'done');
  railProgress.setAttribute('x2', STATION_X[index]);
  if (blocked) railProgress.classList.add('blocked');
}

function addStationCard(title, rows, blocked = false) {
  const card = document.createElement('div');
  card.className = 'station-card' + (blocked ? ' blocked' : '');
  const heading = document.createElement('h3');
  heading.textContent = title;
  card.appendChild(heading);
  rows.forEach(([label, value]) => {
    const p = document.createElement('p');
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = label;
    p.appendChild(labelSpan);
    p.appendChild(document.createTextNode(value));
    card.appendChild(p);
  });
  stationCardsEl.appendChild(card);
}

async function runBlockedTrace(data) {
  await wait(200);
  lightStation(0, true);
  addStationCard(
    STATION_LABELS[0],
    [
      ['Result:', 'Blocked'],
      ['Reason:', data.compliance?.reason || data.reason || 'Sender failed sanctions screening.'],
    ],
    true
  );
  submitHint.textContent = 'Payment blocked at compliance screening.';
  submitHint.classList.add('error');
}

async function runCompletedTrace(data) {
  await wait(200);
  lightStation(0);
  addStationCard(STATION_LABELS[0], [['Result:', 'Passed']]);

  await wait(500);
  lightStation(1);
  addStationCard(STATION_LABELS[1], [
    ['Recipient:', data.recipient.recipientName],
    ['Bank:', data.recipient.bankName],
    ['Account:', data.recipient.accountId],
  ]);

  await wait(500);
  lightStation(2);
  addStationCard(STATION_LABELS[2], [
    ['Rate:', `1 ${data.fx.fromCurrency} = ${data.fx.rate.toFixed(6)} ${data.fx.toCurrency}`],
    ['Converted:', `${data.fx.convertedAmount} ${data.fx.toCurrency}`],
  ]);

  await wait(500);
  lightStation(3);
  addStationCard(STATION_LABELS[3], [['Format:', 'ISO 20022–inspired'], ['Msg ID:', data.message.GrpHdr.MsgId]]);

  await wait(500);
  lightStation(4);
  addStationCard(STATION_LABELS[4], [['Status:', 'Completed']]);

  messageBlock.hidden = false;
  messageJsonEl.textContent = JSON.stringify(data.message, null, 2);
}

toggleMessageBtn.addEventListener('click', () => {
  const isHidden = messageJsonEl.hidden;
  messageJsonEl.hidden = !isHidden;
  toggleMessageBtn.textContent = isHidden ? 'Hide ISO 20022–style message ▴' : 'Show ISO 20022–style message ▾';
});
