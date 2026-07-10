const state = {
  countries: [],
};

const senderCountrySelect = document.getElementById('senderCountry');
const senderBankSelect = document.getElementById('senderBank');
const senderCurrencyLabel = document.getElementById('senderCurrencyLabel');
const recipientCountrySelect = document.getElementById('recipientCountry');
const merchantSelect = document.getElementById('merchantName');
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

recipientCountrySelect.addEventListener('change', async () => {
  const code = recipientCountrySelect.value;

  merchantSelect.disabled = true;
  merchantSelect.innerHTML = '<option value="" disabled selected>Loading merchants…</option>';

  try {
    const res = await fetch(`/api/merchants/${code}`);
    const { local, sportsAndApparel, luxury } = await res.json();
    merchantSelect.innerHTML = '<option value="" disabled selected>Select merchant</option>';
    appendOptgroup(merchantSelect, 'Local merchants', local);
    appendOptgroup(merchantSelect, 'Sports & apparel', sportsAndApparel);
    if (luxury.length) appendOptgroup(merchantSelect, 'Luxury', luxury);
    merchantSelect.disabled = false;
  } catch (err) {
    merchantSelect.innerHTML = '<option value="" disabled selected>Could not load merchants</option>';
  }
});

function appendOptgroup(select, label, items) {
  if (!items || !items.length) return;
  const group = document.createElement('optgroup');
  group.label = label;
  items.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    group.appendChild(opt);
  });
  select.appendChild(group);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitHint.textContent = '';
  submitHint.classList.remove('error');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  resetTrace();

  const payload = {
    senderName: document.getElementById('senderName').value,
    senderCountry: senderCountrySelect.value,
    senderBank: senderBankSelect.value,
    amount: document.getElementById('amount').value,
    recipientCountry: recipientCountrySelect.value,
    merchantName: merchantSelect.value,
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
