// src/priceChecker.js
const fetch = require('node-fetch').default; // ← note the ".default"
const config = require('./config');
const { info, error } = require('./logger');

/**
 * Fetch price data for a given mint address via Coinvera HTTP API.
 * Returns: { priceInSol: Number, priceInUsd: Number } or null on failure.
 */
async function getPriceOnChain(mint) {
  const url = `https://api.coinvera.io/api/v1/price?ca=${mint}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.COINVERA_API
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return {
      priceInSol: data.priceInSol,
      priceInUsd: data.priceInUsd
    };
  } catch (err) {
    error(`[priceChecker] Failed to fetch price for ${mint}: ${err.message}`);
    return null;
  }
}

/** Sleep for ms milliseconds. */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { getPriceOnChain, sleep };
