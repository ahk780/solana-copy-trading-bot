// src/storage.js
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const getTimestamp = require('../utils/getTimestamp');

const filePath = path.join(__dirname, '../data/positions.json');

/**
 * Read the entire JSON from disk (synchronously).
 * If the file is missing or corrupted, return { positions: [] }.
 */
function readData() {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object' || !Array.isArray(json.positions)) {
      return { positions: [] };
    }
    return json;
  } catch (err) {
    // If file does not exist or is invalid JSON, start fresh
    return { positions: [] };
  }
}

/**
 * Write the entire data object back to disk (synchronously).
 * @param {object} data - should be of shape { positions: [ ... ] }
 */
function writeData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Initialize storage: if the file does not exist, create it with { positions: [] }.
 * If it exists but is invalid, overwrite with a valid structure.
 */
function initStorage() {
  if (!fs.existsSync(filePath)) {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    writeData({ positions: [] });
  } else {
    // If it exists, ensure it has valid structure
    const data = readData();
    if (!data || typeof data !== 'object' || !Array.isArray(data.positions)) {
      writeData({ positions: [] });
    }
  }
}

/**
 * Add a new open position.
 * positionData must include:
 *   mint, buy_amount, token_amount, entry_price,
 *   trade_mode, dex, parent_signature?, stop_loss_pct?, take_profit_pct?
 */
function addPosition(positionData) {
  const data = readData();

  const newPosition = {
    id: uuidv4(),
    time: getTimestamp(),
    mint: positionData.mint,
    buy_amount: positionData.buy_amount,
    token_amount: positionData.token_amount,
    entry_price: positionData.entry_price,
    current_price: positionData.entry_price,
    status: 'active',
    trade_mode: positionData.trade_mode,            // "EXACT" or "SAFE"
    parent_signature: positionData.parent_signature || null,
    stop_loss_pct: positionData.stop_loss_pct || null,
    take_profit_pct: positionData.take_profit_pct || null,
    dex: positionData.dex,                           // store the DEX string
    
    // Trailing Stop Loss fields
    highest_price: positionData.entry_price,         // track highest price reached
    trailing_stop_price: null,                       // current trailing stop loss price
    trailing_stop_activated: false,                  // whether trailing stop is active
    trailing_stop_distance: positionData.trailing_stop_distance || null,
    trailing_stop_activation: positionData.trailing_stop_activation || null
  };

  data.positions.push(newPosition);
  writeData(data);
  return newPosition;
}

/** Return all positions (active + closed). */
function getAllPositions() {
  const data = readData();
  return data.positions;
}

/** Return only active positions (status === 'active'). */
function getActivePositions() {
  const data = readData();
  return data.positions.filter((p) => p.status === 'active');
}

/**
 * Update a position by ID (e.g. { current_price: 0.0000025 } or { status: 'closed' }).
 * Throws an error if the ID is not found.
 */
function updatePosition(id, updates) {
  const data = readData();
  const idx = data.positions.findIndex((p) => p.id === id);
  if (idx === -1) {
    throw new Error(`Position with id ${id} not found`);
  }
  // Merge updates
  data.positions[idx] = { ...data.positions[idx], ...updates };
  writeData(data);
  return data.positions[idx];
}

/**
 * Find a single EXACT-mode active position by mint.
 * Returns the position object or undefined if not found.
 */
function findExactActiveByMint(mint) {
  const data = readData();
  return data.positions.find(
    (p) => p.mint === mint && p.status === 'active' && p.trade_mode === 'EXACT'
  );
}

module.exports = {
  initStorage,
  addPosition,
  getAllPositions,
  getActivePositions,
  updatePosition,
  findExactActiveByMint,
};
