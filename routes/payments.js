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
      Number(amount),
      senderCountryObj.currency,
      recipientCountryObj.currency
    );

    // Step 4: ISO 20022-inspired message translation
    const message = buildPaymentMessage({
      senderName,
      senderCountry,
      senderBank,
      senderCurrency: senderCountryObj.currency,
      amount: Number(amount),
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
