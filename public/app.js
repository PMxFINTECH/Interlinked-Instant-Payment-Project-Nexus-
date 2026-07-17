const state = {
  countries: [],
};

const senderCountrySelect = document.getElementById('senderCountry');
const senderBankSelect = document.getElementById('senderBank');
const senderCurrencyLabel = document.getElementById('senderCurrencyLabel');
const recipientCountrySelect = document.getElementById('recipientCountry');
const recipientPhoneInput = document.getElementById('recipientPhone');
const recipientPhoneHint = document.getElementById('recipientPhoneHint');
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

senderCountrySelect.addEventListener('change', async () => {
  const code = senderCountrySelect.value;
  const country = state.countries.find((c) => c.code === code);
  senderCurrencyLabel.textContent = country ? `(${country.currency})` : '';

  senderBankSelect.disabled = true;
  senderBankSelect.innerHTML = '<option value="" disabled selected>Loading banks…</option>';

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
    senderBankSelect.disabled = false;
  } catch (err) {
    senderBankSelect.innerHTML = '<option value="" disabled selected>Could not load banks</option>';
  }
});

recipientCountrySelect.addEventListener('change', () => {
  const code = recipientCountrySelect.value;
  const country = state.countries.find((c) => c.code === code);

  recipientPhoneInput.value = '';
  clearPhoneHint();

  if (!country) {
    recipientPhoneInput.disabled = true;
    recipientPhoneInput.placeholder = 'Select country first';
    return;
  }

  recipientPhoneInput.disabled = false;
  recipientPhoneInput.placeholder = country.phoneExample;
});

// Validates the recipient phone number against the selected recipient
// country's dial code + expected digit length. Mirrors the same check the
// server re-runs in routes/payments.js, so the person gets instant feedback
// here but the server never trusts this alone.
function validateRecipientPhone() {
  const code = recipientCountrySelect.value;
  const country = state.countries.find((c) => c.code === code);
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

recipientPhoneInput.addEventListener('input', () => {
  // Only show errors once the person has typed something worth checking —
  // avoids flashing red on the very first keystroke.
  if (recipientPhoneInput.value.trim().length > 0) validateRecipientPhone();
});

recipientPhoneInput.addEventListener('blur', validateRecipientPhone);

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

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  resetTrace();

  const payload = {
    senderName: document.getElementById('senderName').value,
    senderCountry: senderCountrySelect.value,
    senderBank: senderBankSelect.value,
    amount: document.getElementById('amount').value,
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
