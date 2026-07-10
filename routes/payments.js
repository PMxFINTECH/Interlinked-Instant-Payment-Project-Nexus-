const express = require('express');
const fs = require('fs');
const path = require('path');

const { resolveRecipient } = require('../services/proxyResolution');
const { convertAmount } = require('../services/fxConversion');
const { screenSender } = require('../services/complianceCheck');
const { buildPaymentMessage } = require('../services/messageTranslation');

const router = express.Router();

const countries = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/countries.json'), 'utf-8'));
const merchants = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/merchants.json'), 'utf-8'));
const banks = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/banks.json'), 'utf-8'));

function getCountry(code) {
  return countries.find((c) => c.code === code);
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

// GET /api/merchants/:countryCode — local + sports/apparel + luxury filtered by that country's luxuryOrigins
router.get('/merchants/:countryCode', (req, res) => {
  const country = getCountry(req.params.countryCode);
  if (!country) {
    return res.status(404).json({ error: `Unknown country code ${req.params.countryCode}` });
  }

  const local = merchants.local[req.params.countryCode] || [];
  const sportsAndApparel = merchants.international.sports_and_apparel;
  const luxury = merchants.international.luxury
    .filter((item) => country.luxuryOrigins.includes(item.origin))
    .map((item) => item.name);

  res.json({
    local,
    sportsAndApparel,
    luxury,
  });
});

// POST /api/payment — the main orchestration flow
router.post('/payment', async (req, res) => {
  try {
    const { senderName, senderCountry, senderBank, amount, recipientCountry, merchantName } = req.body;

    if (!senderName || !senderCountry || !senderBank || !amount || !recipientCountry || !merchantName) {
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

    // Step 2: Proxy resolution — merchant + destination country -> recipient bank account
    const recipient = resolveRecipient(merchantName, recipientCountry);

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
