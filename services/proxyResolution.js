const fs = require('fs');
const path = require('path');
const { Faker, en, base, fakerVI, fakerID_ID } = require('@faker-js/faker');

const banks = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/banks.json'), 'utf-8'));

// A shared, locale-agnostic Faker instance used purely as the random-selection
// engine (helpers.weightedArrayElement / helpers.arrayElement) for the four
// countries where we supply our own curated, Latin-script name data below.
// Indonesia and Vietnam instead use Faker's own built-in locales further down,
// since those already produce authentic, Latin-script, correctly paired names.
const namePicker = new Faker({ locale: [en, base] });

// Each entry is an ethnic/linguistic subgroup with its own first- and last-name
// pool, plus a rough population weight so the generated mix matches each
// country's actual demographic composition. First and last names are always
// drawn from the SAME subgroup, so we never produce an invalid cross-ethnic
// combination (e.g. an Indian first name with a Chinese surname).
const NAME_GROUPS = {
  // Singapore: ~74% Chinese, ~13% Malay, ~9% Indian, ~4% other/Eurasian
  SG: [
    { weight: 74, value: { first: ['Wei Ling', 'Jun Kai', 'Mei Xuan', 'Hui Min', 'Zhi Hao', 'Kai Wen', 'Xin Yi', 'Jia Hui'], last: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Goh', 'Chua', 'Ong'] } },
    { weight: 13, value: { first: ['Farah', 'Azlan', 'Siti', 'Amirul', 'Nur Ain', 'Hafiz'], last: ['Abdullah', 'Rahman', 'Yusof', 'Ismail', 'Hassan'] } },
    { weight: 9, value: { first: ['Arjun', 'Priya', 'Suresh', 'Kavitha', 'Ravi', 'Deepa'], last: ['Kumar', 'Rajan', 'Nair', 'Pillai', 'Krishnan'] } },
    { weight: 4, value: { first: ['Marcus', 'Sophia', 'Daniel', 'Clara'], last: ['Pereira', 'De Souza', 'Rodrigues', 'Oliveiro'] } },
  ],
  // Malaysia: ~55% Malay, ~23% Chinese Malaysian, ~7% Indian Malaysian, ~15% other Bumiputera
  MY: [
    { weight: 55, value: { first: ['Aiman', 'Nurul', 'Hafiz', 'Farah', 'Azlan', 'Siti', 'Amirul', 'Nur Ain'], last: ['Bin Ismail', 'Binti Rahman', 'Ibrahim', 'Hassan', 'Aziz', 'Mokhtar'] } },
    { weight: 23, value: { first: ['Chong Wei', 'Mei Ling', 'Wei Jian', 'Su Ann', 'Kah Meng', 'Yee Ling'], last: ['Tan', 'Lim', 'Wong', 'Chong', 'Ooi', 'Teh'] } },
    { weight: 7, value: { first: ['Suresh', 'Kavitha', 'Ravi', 'Deepa', 'Vijay', 'Priya'], last: ['Kumar', 'Krishnan', 'Raj', 'Pillai', 'Nair'] } },
    { weight: 15, value: { first: ['Jelani', 'Rian', 'Sarawak', 'Mering', 'Dayang', 'Rurun'], last: ['Anak Bujang', 'Bin Untong', 'Lasa', 'Sagan'] } },
  ],
  // Philippines: predominantly Filipino Christian naming convention nationwide,
  // with a smaller Muslim Filipino population concentrated in Mindanao.
  PH: [
    { weight: 90, value: { first: ['Juan', 'Maria', 'Jose', 'Angelica', 'Mark', 'Grace', 'Ramon', 'Liza', 'Paolo', 'Bea'], last: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Torres', 'Ramos', 'Flores', 'Mendoza', 'Del Rosario'] } },
    { weight: 10, value: { first: ['Amina', 'Rasheed', 'Farida', 'Kamal', 'Yasmin', 'Sultan'], last: ['Hassan', 'Mangudadatu', 'Ampatuan', 'Dimaporo'] } },
  ],
  // Thailand: names are romanized to Latin script — Faker's own `th` locale
  // only produces native Thai script, which isn't what we want on-screen.
  TH: [
    { weight: 100, value: { first: ['Somchai', 'Suda', 'Anong', 'Kittipong', 'Malee', 'Chai', 'Ratana', 'Niran', 'Siriporn', 'Thanakorn'], last: ['Srisuk', 'Chaiyaporn', 'Boonmee', 'Sukjai', 'Wattana', 'Rattanakorn', 'Charoen', 'Phromsri'] } },
  ],
};

const fakerByCountry = {
  ID: fakerID_ID,
  VN: fakerVI,
};

function hashToIndex(str, mod) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000003;
  }
  return hash % mod;
}

// Converts a string into a stable positive integer usable as a Faker seed,
// so the same phone number always seeds the same pseudo-random draw.
function numericSeed(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function generateName(countryCode, seed) {
  if (NAME_GROUPS[countryCode]) {
    namePicker.seed(seed);
    const group = namePicker.helpers.weightedArrayElement(NAME_GROUPS[countryCode]);
    const first = namePicker.helpers.arrayElement(group.first);
    const last = namePicker.helpers.arrayElement(group.last);
    return `${first} ${last}`;
  }

  const countryFaker = fakerByCountry[countryCode];
  if (!countryFaker) {
    throw new Error(`No name generator configured for country code ${countryCode}`);
  }
  countryFaker.seed(seed);
  return `${countryFaker.person.firstName()} ${countryFaker.person.lastName()}`;
}

// Resolves a proxy (phone number) + destination country to a recipient,
// mirroring how a real Nexus-style proxy directory resolves a phone number
// to an account holder's name, bank, and account number. The recipient name
// is generated via Faker, seeded deterministically from the phone number so
// a given proxy always resolves to the same person.
function resolveRecipient(phoneNumber, countryCode) {
  const countryBanks = banks[countryCode];
  if (!countryBanks || countryBanks.length === 0) {
    throw new Error(`No banks configured for country code ${countryCode}`);
  }

  const bankIndex = hashToIndex(phoneNumber + countryCode, countryBanks.length);
  const accountSuffix = hashToIndex(phoneNumber, 900000) + 100000;
  const recipientName = generateName(countryCode, numericSeed(phoneNumber + countryCode));

  return {
    phoneNumber,
    countryCode,
    recipientName,
    bankName: countryBanks[bankIndex],
    accountId: `${countryCode}-${accountSuffix}`,
  };
}

module.exports = { resolveRecipient };
