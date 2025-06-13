// src/tradeExecutor.js
const fetch = require('node-fetch').default;

// Import bs58 in a way that works with both CommonJS and ES exports
let bs58;
try {
  // If bs58 has a `.default`, use it; otherwise fall back
  const imported = require('bs58');
  bs58 = imported.default ? imported.default : imported;
} catch (err) {
  // Fallback if require('bs58') fails somehow
  bs58 = require('bs58');
}

const { Keypair, VersionedTransaction } = require('@solana/web3.js');
const config = require('./config');
const { info, error } = require('./logger');

/**
 * Sign & send a VersionedTransaction via Jito.
 * @param base64Txn  - base64‐encoded VersionedTransaction from SolanaPortal
 * @returns          - signature string
 */
async function signAndSendViaJito(base64Txn) {
  // Use bs58.decode and bs58.encode, regardless of how bs58 was imported
  const secretKey = bs58.decode(config.PRIVATE_KEY);
  const walletKeypair = Keypair.fromSecretKey(secretKey);

  const txBuffer = Buffer.from(base64Txn, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([walletKeypair]);
  const signedTxBuffer = tx.serialize();
  const signedTx = bs58.encode(signedTxBuffer);

  const jitoPayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [signedTx]
  };

  const res = await fetch(config.JITO_ENGINE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jitoPayload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jito sendTransaction failed: ${res.status} ${res.statusText} | ${text}`);
  }
  const jitoData = await res.json();
  if (!jitoData.result) {
    throw new Error(`Jito did not return a result: ${JSON.stringify(jitoData)}`);
  }
  return jitoData.result;
}

/**
 * Call SolanaPortal trading endpoint to get a VersionedTransaction (base64).
 * @param params  - { wallet_address, action, dex, mint, amount, slippage, tip, type }
 * @returns       - base64‐encoded VersionedTransaction
 */
async function getPortalTxn(params) {
  const url = 'https://api.solanaportal.io/api/trading';
  //const url = 'http://localhost:3002/api/trading';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SolanaPortal responded ${res.status} ${res.statusText}: ${txt}`);
  }
  const data = await res.json();
  return data; // base64 VersionedTransaction
}

/**
 * Buy a token. Returns the signature string.
 * @param mint        - token mint address
 * @param amountSol   - SOL amount to spend
 * @param slippage    - percent
 * @param tip         - SOL tip for Jito
 * @param dex         - 'pumpfun', 'jupiter', etc.
 */
async function buyToken({ mint, amountSol, slippage, tip, dex }) {
  info(
    `[tradeExecutor] Placing BUY order: mint=${mint}, amountSol=${amountSol}, ` +
      `dex=${dex}, slippage=${slippage}%, tip=${tip} SOL`
  );
  const params = {
    wallet_address: config.PUBLIC_KEY,
    action: 'buy',
    dex,
    mint,
    amount: amountSol,
    slippage,
    tip,
    type: 'jito'
  };
  const portalBase64 = await getPortalTxn(params);
  const signature = await signAndSendViaJito(portalBase64);
  info(`[tradeExecutor] BUY txn sent: https://solscan.io/tx/${signature}`);
  return signature;
}

/**
 * Sell a token. Returns the signature string.
 * @param mint          - token mint address
 * @param amountTokens  - number of tokens to sell
 * @param slippage      - percent
 * @param tip           - SOL tip for Jito
 * @param dex           - 'pumpfun', 'jupiter', etc.
 */
async function sellToken({ mint, amountTokens, slippage, tip, dex }) {
  info(
    `[tradeExecutor] Placing SELL order: mint=${mint}, tokenAmount=${amountTokens}, ` +
      `dex=${dex}, slippage=${slippage}%, tip=${tip} SOL`
  );
  const params = {
    wallet_address: config.PUBLIC_KEY,
    action: 'sell',
    dex,
    mint,
    amount: amountTokens,
    slippage,
    tip,
    type: 'jito'
  };
  const portalBase64 = await getPortalTxn(params);
  const signature = await signAndSendViaJito(portalBase64);
  info(`[tradeExecutor] SELL txn sent: https://solscan.io/tx/${signature}`);
  return signature;
}

module.exports = { buyToken, sellToken };
