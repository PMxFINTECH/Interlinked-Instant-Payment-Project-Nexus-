const fs = require('fs');
const path = require('path');

const banks = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/banks.json'), 'utf-8'));

function hashToIndex(str, mod) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000003;
  }
  return hash % mod;
}

function resolveRecipient(merchantName, countryCode) {
  const countryBanks = banks[countryCode];
  if (!countryBanks || countryBanks.length === 0) {
    throw new Error(`No banks configured for country code ${countryCode}`);
  }

  const bankIndex = hashToIndex(merchantName + countryCode, countryBanks.length);
  const accountSuffix = hashToIndex(merchantName, 900000) + 100000;

  return {
    merchantName,
    countryCode,
    bankName: countryBanks[bankIndex],
    accountId: `${countryCode}-${accountSuffix}`,
  };
}

module.exports = { resolveRecipient };
