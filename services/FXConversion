const FALLBACK_RATES_TO_USD = {
  SGD: 0.74, MYR: 0.21, THB: 0.027,
  IDR: 0.000061, PHP: 0.017, VND: 0.000039,
};

async function getExchangeRate(fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return 1;

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`);
    if (!response.ok) throw new Error(`FX API responded with status ${response.status}`);
    const data = await response.json();
    const rate = data.rates?.[toCurrency];
    if (!rate) throw new Error(`No rate found for ${toCurrency}`);
    return rate;
  } catch (err) {
    console.warn(`Live FX lookup failed (${err.message}), using fallback rate.`);
    const fromUsd = FALLBACK_RATES_TO_USD[fromCurrency];
    const toUsd = FALLBACK_RATES_TO_USD[toCurrency];
    if (!fromUsd || !toUsd) throw new Error(`No fallback rate for ${fromCurrency} -> ${toCurrency}`);
    return fromUsd / toUsd;
  }
}

async function convertAmount(amount, fromCurrency, toCurrency) {
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  const convertedAmount = Math.round(amount * rate * 100) / 100;
  return { rate, convertedAmount, fromCurrency, toCurrency };
}

module.exports = { getExchangeRate, convertAmount };
