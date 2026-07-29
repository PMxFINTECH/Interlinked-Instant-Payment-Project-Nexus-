const express = require('express');
const fs = require('fs');
const path = require('path');

const { resolveRecipient } = require('../services/proxyResolution');
const { convertAmount } = require('../services/fxConversion');
const { screenSender } = require('../services/complianceCheck');
const { buildPaymentMessage } = require('../services/messageTranslation');

const router = express.Router();

const countries = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/countries.json'), 'utf-8'));
const banks = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/banks.json'), 'utf-8'));

function getCountry(code) {
  return countries.find((c) => c.code === code);
}

// Parses an amount that may arrive formatted for display, e.g. "SGD 1,234.56"
// or "$1,234.56". Strips currency symbols/letters and thousands separators,
// then validates the result is a finite, positive number.
// Feature: Amount — supports the sender-facing "$" + "," formatted input.
function parseAmount(rawAmount) {
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
    return { valid: false, value: null, message: 'Amount is required.' };
  }

  const cleaned = String(rawAmount)
    .replace(/[^0-9.\-]/g, ''); // strip currency symbols, currency codes, commas, spaces

  const value = Number(cleaned);

  if (!Number.isFinite(value) || value <= 0) {
    return { valid: false, value: null, message: 'Amount must be a positive number.' };
  }

  return { valid: true, value, message: null };
}

// Validates that a recipient phone number matches the destination country's
// dial code and expected digit length. Mirrors the client-side check, but is
// re-run server-side since client validation can always be bypassed.
function validatePhoneNumber(phoneNumber, country) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return { valid: false, message: `Phone number is required, e.g. ${country.phoneExample}` };
  }

  const compact = phoneNumber.replace(/[\s-]/g, '');

  if (!compact.startsWith(country.dialCode)) {
    return {
      valid: false,
      message: `Phone number must start with ${country.dialCode} for ${country.name}, e.g. ${country.phoneExample}`,
    };
  }

  const nationalNumber = compact.slice(country.dialCode.length);

  if (!/^\d+$/.test(nationalNumber) || nationalNumber.length !== country.phoneDigits) {
    return {
      valid: false,
      message: `${country.name} numbers need ${country.phoneDigits} digits after ${country.dialCode}, e.g. ${country.phoneExample}`,
    };
  }

  return { valid: true, message: null };
}

// GET /api/countries — used to populate sender/recipient country selects
router.get('/countries', (req, res) => {
  res.json(countries);
});

// GET /api/banks/:countryCode — used to populate the sender's bank select
router.get('/banks/:countryCode', (req, res) => {
  const countryBanks = banks[req.params.countryCode];
  if (!countryBanks) {
    return res.status(404).json({ error: `No banks found for country code ${req.params.countryCode}` });
  }
  res.json(countryBanks);
});

// GET /api/fx-quote/:fromCurrency/:toCurrency?amount=1000
// Feature: FX Rate + Currency Conversion — lets the frontend fetch a live
// rate as soon as both currencies are selected (call with no amount, or
// amount=1), and a live converted amount as the sender types (call with the
// actual amount). Does not touch compliance, proxy resolution, or messaging —
// this is a read-only quote, not a payment.
router.get('/fx-quote/:fromCurrency/:toCurrency', async (req, res) => {
  try {
    const { fromCurrency, toCurrency } = req.params;
    const rawAmount = req.query.amount;

    // Default to 1 so the endpoint doubles as a pure "what's the rate?" call
    // when the sender hasn't entered an amount yet.
    const amountCheck = rawAmount === undefined
      ? { valid: true, value: 1 }
      : parseAmount(rawAmount);

    if (!amountCheck.valid) {
      return res.status(400).json({ error: amountCheck.message });
    }

    const { rate, convertedAmount } = await convertAmount(amountCheck.value, fromCurrency, toCurrency);

    res.json({
      fromCurrency,
      toCurrency,
      rate,
      amount: amountCheck.value,
      convertedAmount,
    });
  } catch (err) {
    console.error('FX quote error:', err);
    res.status(500).json({ error: 'Could not fetch FX quote.', details: err.message });
  }
});

// GET /api/recipient/:recipientCountry/:phone
// Feature: Recipient + Recipient Phone Number — resolves and returns the
// fictional recipient's name/bank as soon as a valid phone number is
// entered, so the frontend can display it in the recipient column instead
// of a generic "proxy resolved" message. Lightweight preview only — no
// compliance screening, FX conversion, or message building happens here.
router.get('/recipient/:recipientCountry/:phone', (req, res) => {
  const { recipientCountry, phone } = req.params;

  const recipientCountryObj = getCountry(recipientCountry);
  if (!recipientCountryObj) {
    return res.status(400).json({ error: 'Invalid recipient country code.' });
  }

  const phoneCheck = validatePhoneNumber(phone, recipientCountryObj);
  if (!phoneCheck.valid) {
    return res.status(400).json({ valid: false, error: phoneCheck.message });
  }

  const recipient = resolveRecipient(phone, recipientCountry);

  res.json({ valid: true, recipient });
});

// POST /api/payment — the main orchestration flow
router.post('/payment', async (req, res) => {
  try {
    const { senderName, senderCountry, senderBank, amount, recipientCountry, recipientPhone } = req.body;

    if (!senderName || !senderCountry || !senderBank || !amount || !recipientCountry || !recipientPhone) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const senderCountryObj = getCountry(senderCountry);
    const recipientCountryObj = getCountry(recipientCountry);

    if (!senderCountryObj || !recipientCountryObj) {
      return res.status(400).json({ error: 'Invalid sender or recipient country code.' });
    }

    // Feature: Amount — defensively parse in case the frontend passes a
    // display-formatted string (e.g. "SGD 1,234.56") instead of a raw number.
    const amountCheck = parseAmount(amount);
    if (!amountCheck.valid) {
      return res.status(400).json({ error: amountCheck.message });
    }

    // Step 1: Compliance screening — mirrors how a real hub would block before doing any other work
    const screening = screenSender(senderName);
    if (!screening.passed) {
      return res.status(403).json({
        status: 'BLOCKED',
        stage: 'compliance',
        reason: screening.reason,
      });
    }

    // Step 1b: Recipient phone format check — re-validated server-side even
    // though the frontend already checks this, since a client check alone
    // can always be bypassed by anyone calling the API directly.
    const phoneCheck = validatePhoneNumber(recipientPhone, recipientCountryObj);
    if (!phoneCheck.valid) {
      return res.status(400).json({ error: phoneCheck.message });
    }

    // Step 2: Proxy resolution — recipient phone (proxy ID) + destination country -> recipient bank account
    const recipient = resolveRecipient(recipientPhone, recipientCountry);

    // Step 3: FX conversion
    const { rate, convertedAmount } = await convertAmount(
      amountCheck.value,
      senderCountryObj.currency,
      recipientCountryObj.currency
    );

    // Step 4: ISO 20022-inspired message translation
    const message = buildPaymentMessage({
      senderName,
      senderCountry,
      senderBank,
      senderCurrency: senderCountryObj.currency,
      amount: amountCheck.value,
      recipient,
      targetCurrency: recipientCountryObj.currency,
      convertedAmount,
      exchangeRate: rate,
    });

    res.json({
      status: 'COMPLETED',
      compliance: screening,
      recipient,
      fx: { rate, convertedAmount, fromCurrency: senderCountryObj.currency, toCurrency: recipientCountryObj.currency },
      message,
    });
  } catch (err) {
    console.error('Payment processing error:', err);
    res.status(500).json({ error: 'Payment processing failed.', details: err.message });
  }
});

module.exports = router;
