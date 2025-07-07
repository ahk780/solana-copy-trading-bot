// src/config.js
require('dotenv').config();
const { exit } = require('process');

function requiredEnv(key) {
  const val = process.env[key];
  if (!val) {
    console.error(`[config] ERROR: Missing environment variable ${key}`);
    exit(1);
  }
  return val;
}

const config = {
  SOLANA_RPC:         requiredEnv('SOLANA_RPC'),
  PRIVATE_KEY:        requiredEnv('PRIVATE_KEY'),
  PUBLIC_KEY:         requiredEnv('PUBLIC_KEY'),
  BOT_MODE:           requiredEnv('BOT_MODE').toUpperCase(),       // "COPY" or "SELLING"
  COPY_WALLET:        requiredEnv('COPY_WALLET'),
  TRADE_TYPE:         requiredEnv('TRADE_TYPE').toUpperCase(),     // "EXACT" or "SAFE"
  BUY_AMOUNT:         parseFloat(requiredEnv('BUY_AMOUNT')),       // only if SAFE
  TAKE_PROFIT:        parseFloat(requiredEnv('TAKE_PROFIT')),      // percent
  STOP_LOSS:          parseFloat(requiredEnv('STOP_LOSS')),        // percent
  SLIPPAGE:           parseFloat(requiredEnv('SLIPPAGE')),         // percent
  JITO_TIP:           parseFloat(requiredEnv('JITO_TIP')),         // in SOL
  JITO_ENGINE:        requiredEnv('JITO_ENGINE'),
  COINVERA_API:       requiredEnv('COINVERA_API'),
  PRICE_CHECK_DELAY:  parseInt(requiredEnv('PRICE_CHECK_DELAY'), 10), // ms
  PREFERRED_DEX:      (process.env.PREFERRED_DEX || 'none').toLowerCase(), // "none" (system decides) or specific DEX: "auto", "pumpfun", "meteora", "raydium", "moonshot", "jupiter"

  // New: allow or prevent multiple buys for same mint
  ENABLE_MULTI_BUY:   (process.env.ENABLE_MULTI_BUY === 'true'),
  
  // Trailing Stop Loss Configuration
  ENABLE_TRAILING_STOP: (process.env.ENABLE_TRAILING_STOP === 'true'),
  TRAILING_STOP_DISTANCE: parseFloat(process.env.TRAILING_STOP_DISTANCE || '0'), // percent distance from peak
  TRAILING_STOP_ACTIVATION: parseFloat(process.env.TRAILING_STOP_ACTIVATION || '0'), // minimum profit % before trailing starts
};

const validBotModes   = ['COPY', 'SELLING'];
const validTradeTypes = ['EXACT', 'SAFE'];
const validDexOptions = ['none', 'auto', 'pumpfun', 'meteora', 'raydium', 'moonshot', 'jupiter'];

if (!validBotModes.includes(config.BOT_MODE)) {
  console.error(`[config] ERROR: BOT_MODE must be one of: ${validBotModes.join(', ')}`);
  exit(1);
}
if (!validTradeTypes.includes(config.TRADE_TYPE)) {
  console.error(`[config] ERROR: TRADE_TYPE must be one of: ${validTradeTypes.join(', ')}`);
  exit(1);
}
if (!validDexOptions.includes(config.PREFERRED_DEX)) {
  console.error(`[config] ERROR: PREFERRED_DEX must be one of: ${validDexOptions.join(', ')}`);
  exit(1);
}

module.exports = config;