const fs = require('fs');
const path = require('path');

const { blockedNames } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/sanctionsList.json'), 'utf-8')
);

function normalize(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const normalizedBlockedNames = blockedNames.map(normalize);

function screenSender(senderName) {
  const isBlocked = normalizedBlockedNames.includes(normalize(senderName));

  return {
    passed: !isBlocked,
    reason: isBlocked ? 'Sender name matches an entry on the fictional sanctions list' : null,
  };
}

module.exports = { screenSender };
