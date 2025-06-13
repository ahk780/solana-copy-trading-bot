// src/index.js
const config = require('./config');
const { info, warn, error } = require('./logger');
const CopyEmitter = require('./websocket');
const storage = require('./storage');
const { mapDex } = require('./dexMapper');
const { getPriceOnChain, sleep } = require('./priceChecker');
const { buyToken, sellToken } = require('./tradeExecutor');
const { Connection, PublicKey } = require('@solana/web3.js');

/**
 * Convert a raw BigInt token amount and its decimals into a precise decimal string.
 * E.g. raw = 10757565596n, decimals = 9 → "10.757565596"
 */
function rawToDecimalString(rawBigInt, decimals) {
  const s = rawBigInt.toString();
  if (decimals === 0) return s;
  if (s.length <= decimals) {
    return '0.' + '0'.repeat(decimals - s.length) + s;
  } else {
    const intPart = s.slice(0, s.length - decimals);
    const fracPart = s.slice(s.length - decimals);
    return intPart + '.' + fracPart;
  }
}

(async () => {
  try {
    info('=== Starting Copy-Trading Bot ===');
    storage.initStorage(); // ensure data/positions.json exists

    // In-memory map: only positions with status === 'active'
    const activeMap = new Map();
    // In-memory set: IDs of positions currently being sold (to prevent duplicates)
    const inSellingSet = new Set();

    // Load any existing "active" positions from storage
    for (const pos of storage.getActivePositions()) {
      activeMap.set(pos.id, { ...pos });
    }

    // Create a Solana connection for confirmations & balance checks
    const connection = new Connection(config.SOLANA_RPC, 'confirmed');

    /**
     * Poll the cluster for a transaction signature until confirmed or timeout.
     * Returns true if confirmed, false otherwise.
     */
    async function waitForConfirmation(signature, timeoutSec = 15) {
      const start = Date.now();
      while ((Date.now() - start) / 1000 < timeoutSec) {
        try {
          const resp = await connection.getSignatureStatuses([signature]);
          const statusInfo = resp && resp.value && resp.value[0];
          if (statusInfo && statusInfo.confirmationStatus === 'confirmed') {
            return true;
          }
        } catch {
          // ignore and retry
        }
        await sleep(1000);
      }
      warn(`[Confirm] Timed out waiting for confirmation of ${signature}`);
      return false;
    }

    /**
     * Safely attempt to sell position `pos`.
     * On "Insufficient SPL token balance", re-fetch on-chain raw balance,
     * retry that exact amount, or if zero, mark closed and remove from activeMap.
     */
    async function safeSell(pos) {
      const { mint, token_amount: tokenAmountStored, id, dex } = pos;

      try {
        await sellToken({
          mint,
          amountTokens: tokenAmountStored,
          slippage: config.SLIPPAGE,
          tip: config.JITO_TIP,
          dex
        });
        return true;
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('Insufficient SPL token balance')) {
          warn(
            `[Main] Insufficient SPL balance for position ${id}. Error: ${msg}. Re-checking on-chain...`
          );

          // Re-fetch SPL token balance
          const ownerPubkey = new PublicKey(config.PUBLIC_KEY);
          const accounts = await connection.getParsedTokenAccountsByOwner(ownerPubkey, {
            mint: new PublicKey(mint)
          });

          let totalRaw = BigInt(0);
          let decimals = null;
          for (const acct of accounts.value) {
            const infoParsed = acct.account.data.parsed.info.tokenAmount;
            totalRaw += BigInt(infoParsed.amount);
            decimals = infoParsed.decimals;
          }

          const actualBalanceString =
            decimals !== null ? rawToDecimalString(totalRaw, decimals) : '0';
          const actualBalanceNum = parseFloat(actualBalanceString);

          if (actualBalanceNum > 0) {
            info(`[Main] Retrying sell of ${actualBalanceString} tokens for ${id}...`);
            try {
              await sellToken({
                mint,
                amountTokens: actualBalanceString,
                slippage: config.SLIPPAGE,
                tip: config.JITO_TIP,
                dex
              });
              return true;
            } catch (err2) {
              error(`[Main] Retry sell for ${id} failed:`, err2.message);
              return false;
            }
          } else {
            info(`[Main] Position ${id} has zero on-chain balance. Marking closed.`);
            storage.updatePosition(id, { status: 'closed' });
            activeMap.delete(id);
            inSellingSet.delete(id);
            return false;
          }
        } else {
          throw err;
        }
      }
    }

    // === BOT_MODE = SELLING ===
    if (config.BOT_MODE === 'SELLING') {
      info('[Main] BOT_MODE=SELLING → liquidating all active positions...');
      for (const pos of activeMap.values()) {
        const { id } = pos;
        inSellingSet.add(id);
        const sold = await safeSell(pos);
        if (sold) {
          storage.updatePosition(id, { status: 'closed', current_price: 0 });
          activeMap.delete(id);
          inSellingSet.delete(id);
          info(`[Main] Position ${id} sold and closed.`);
        }
      }
      info('[Main] All positions processed. Exiting.');
      process.exit(0);
    }

    // === BOT_MODE = COPY ===
    info('[Main] BOT_MODE=COPY → starting normal copy flow.');

    // --- 1) Price-polling loop for TP/SL on SAFE positions ---
    async function pricePollingLoop() {
      for (const pos of Array.from(activeMap.values())) {
        const {
          id,
          status,
          trade_mode,
          mint,
          entry_price,
          stop_loss_pct,
          take_profit_pct,
          dex
        } = pos;

        // Skip if not "active" or already in the middle of selling
        if (status !== 'active' || inSellingSet.has(id)) {
          continue;
        }

        try {
          // Parse entry_price as a number
          const entryPriceNum = parseFloat(entry_price);

          // Fetch latest USD price
          const priceData = await getPriceOnChain(mint);
          if (!priceData) continue; // skip if API error
          const currentPriceUsd = parseFloat(priceData.priceInUsd);

          // Update current_price in-memory and in storage
          pos.current_price = currentPriceUsd;
          storage.updatePosition(id, { current_price: currentPriceUsd });

          if (trade_mode === 'SAFE') {
            const changePct = ((currentPriceUsd - entryPriceNum) / entryPriceNum) * 100.0;

            // TAKE_PROFIT
            if (changePct >= take_profit_pct) {
              info(
                `[Main][TP] Position ${id} (${mint}) hit TAKE_PROFIT +${changePct.toFixed(2)}%.`
              );
              // Immediately mark "selling" and remove from activeMap
              inSellingSet.add(id);
              storage.updatePosition(id, { status: 'closed' });
              activeMap.delete(id);

              const sold = await safeSell(pos);
              if (sold) {
                info(`[Main][TP] Position ${id} closed at $${currentPriceUsd.toFixed(9)}.`);
              }
              inSellingSet.delete(id);
              continue;
            }

            // STOP_LOSS
            if (changePct <= -stop_loss_pct) {
              info(
                `[Main][SL] Position ${id} (${mint}) triggered STOP_LOSS -${(-changePct).toFixed(2)}%.`
              );
              inSellingSet.add(id);
              storage.updatePosition(id, { status: 'closed' });
              activeMap.delete(id);

              const sold = await safeSell(pos);
              if (sold) {
                info(`[Main][SL] Position ${id} closed at $${currentPriceUsd.toFixed(9)}.`);
              }
              inSellingSet.delete(id);
              continue;
            }

            // Still open
            info(
              `[Main] Position ${id} (${mint}) still open. Entry $${entryPriceNum.toFixed(9)}, ` +
                `Current $${currentPriceUsd.toFixed(9)}, Δ ${changePct.toFixed(2)}%.`
            );
          }
          // EXACT mode does not auto-close here
        } catch (err) {
          error('[Main] Error in pricePollingLoop for', id, err.message);
        }
      }
    }

    // Poll as frequently as configured (e.g., 5000ms)
    setInterval(pricePollingLoop, config.PRICE_CHECK_DELAY);
    info(`[Main] Launched price polling every ${config.PRICE_CHECK_DELAY}ms.`);

    // --- 2) WebSocket listener for copyWallet trades ---
    const emitter = new CopyEmitter();
    emitter.connect();

    emitter.on('copyTrade', async (msg) => {
      try {
        console.log('[Main] Received copyTrade:', JSON.stringify(msg));

        const {
          signature,
          dexs,
          ca: mint,
          trade,
          solAmount,
          tokenAmount
        } = msg;

        let dex = mapDex(dexs);
        if (!dex) {
          warn(`[Main] Unrecognized dexs ${JSON.stringify(dexs)}, defaulting to "jupiter".`);
          dex = 'jupiter';
        }

        // --- COPY-WALLET BUY event ---
        if (trade === 'buy' && solAmount < 0) {
          const existingPos = Array.from(activeMap.values()).find(
            (p) => p.mint === mint && p.status === 'active'
          );

          if (!config.ENABLE_MULTI_BUY && existingPos) {
            info(`[Main] MULTI_BUY disabled & position exists for ${mint}, skipping buy.`);
            return;
          }

          const buyAmountSol =
            config.TRADE_TYPE === 'EXACT' ? Math.abs(solAmount) : config.BUY_AMOUNT;

          info(
            `[Main] Copy buy detected: mint=${mint}, SOL=${Math.abs(solAmount)}. ` +
              `Placing our BUY of ${buyAmountSol} SOL on ${dex}...`
          );

          // 1) Send buy request → returns a Solana signature
          const buySig = await buyToken({
            mint,
            amountSol: buyAmountSol,
            slippage: config.SLIPPAGE,
            tip: config.JITO_TIP,
            dex
          });

          info(`[Main] Waiting for confirmation of ${buySig}...`);
          const confirmed = await waitForConfirmation(buySig, 15);
          if (!confirmed) {
            warn(`[Main] Buy ${buySig} never confirmed; skipping position creation.`);
            return;
          }
          info(`[Main] Buy ${buySig} confirmed on-chain.`);

          // 2) Fetch on-chain SPL token balance **and** USD entry price **without delay**
          const ownerPubkey = new PublicKey(config.PUBLIC_KEY);
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPubkey, {
            mint: new PublicKey(mint)
          });

          let totalRaw = BigInt(0);
          let decimals = null;
          for (const acct of tokenAccounts.value) {
            const infoParsed = acct.account.data.parsed.info.tokenAmount;
            totalRaw += BigInt(infoParsed.amount);
            decimals = infoParsed.decimals;
          }

          const tokenAmountStr =
            decimals !== null ? rawToDecimalString(totalRaw, decimals) : '0';

          const priceData = await getPriceOnChain(mint);
          const entryPriceUsd = priceData ? parseFloat(priceData.priceInUsd) : 0;

          // 3) Now that we have real data, create a fully "active" position
          const newPos = storage.addPosition({
            mint,
            buy_amount: buyAmountSol,
            token_amount: tokenAmountStr,
            entry_price: entryPriceUsd,
            current_price: entryPriceUsd,
            status: 'active', // immediately active
            trade_mode: config.TRADE_TYPE,
            parent_signature: signature,
            stop_loss_pct: config.TRADE_TYPE === 'SAFE' ? config.STOP_LOSS : null,
            take_profit_pct: config.TRADE_TYPE === 'SAFE' ? config.TAKE_PROFIT : null,
            dex
          });

          activeMap.set(newPos.id, { ...newPos });

          info(
            `[Main] New position ID=${newPos.id}, mint=${mint}, ` +
            `tokens=${tokenAmountStr}, entry=$${entryPriceUsd.toFixed(9)}, dex=${dex}.`
          );
        }

        // --- COPY-WALLET SELL event (EXACT mode) ---
        else if (trade === 'sell' && tokenAmount < 0) {
          if (config.TRADE_TYPE === 'EXACT') {
            const existingExact = Array.from(activeMap.values()).find(
              (p) => p.mint === mint && p.trade_mode === 'EXACT' && p.status === 'active'
            );
            if (!existingExact) {
              info(`[Main] Copy sell ${mint} but no EXACT active position, ignoring.`);
              return;
            }
            const { id } = existingExact;
            info(`[Main] Copy sell detected for ${mint}. Closing EXACT position ${id}...`);

            inSellingSet.add(id);
            activeMap.delete(id);
            storage.updatePosition(id, { status: 'closed' });

            const sold = await safeSell(existingExact);
            if (sold) {
              info(`[Main] EXACT position ${id} closed.`);
            }
            inSellingSet.delete(id);
          }
        }
      } catch (err) {
        error('[Main] Error handling copyTrade:', err.message);
      }
    });

    info(`[Main] Bot is now listening to ${config.COPY_WALLET} trades...`);
  } catch (err) {
    error('[Main] Fatal error:', err.message);
    process.exit(1);
  }
})();
