// src/dexMapper.js
const config = require('./config');

/**
 * Given an array like ['Pump.fun', 'Pump.fun Amm'], choose the correct SolanaPortal string.
 * Returns one of: 'pumpfun', 'jupiter', 'meteora', 'raydium', 'auto', or a sanitized fallback.
 * Respects the user's PREFERRED_DEX setting if specified.
 */
function mapDex(dexsArray) {
  if (!Array.isArray(dexsArray) || dexsArray.length === 0) {
    return null;
  }

  // If user has specified a preferred DEX, use it
  if (config.PREFERRED_DEX !== 'none') {
    return config.PREFERRED_DEX;
  }

  const lowered = dexsArray.map(d => d.toLowerCase());

  // Pump.fun => 'pumpfun'
  if (lowered.some(d => d.startsWith('pump.fun'))) {
    return 'pumpfun';
  }
  // Jupiter‐style: Fluxbeam, Orca Whirpool, Raydium Launchpad
  if (lowered.some(d => d.includes('fluxbeam') || d.includes('orca whirlpool') || d.includes('raydium launchpad'))) {
    return 'jupiter';
  }
  // Meteora pools
  if (lowered.some(d => d.includes('meteora'))) {
    return 'meteora';
  }
  // Raydium AMM v4 / CPMM / CLMM
  if (lowered.some(d => d.includes('raydium ammv4') || d.includes('raydium cpmm') || d.includes('raydium clmm'))) {
    return 'raydium';
  }

  // Fallback: take first, strip non-alphanumeric, lowercase
  return dexsArray[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

module.exports = { mapDex };