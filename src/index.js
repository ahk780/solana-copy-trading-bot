// src/index.js
const config = require('./config');
const { info, warn, error } = require('./logger');
const CopyEmitter = require('./websocket');
const storage = require('./storage');
const { mapDex } = require('./dexMapper');
const { getPriceOnChain, sleep } = require('./priceChecker');
const { buyToken, sellToken } = require('./tradeExecutor');
const { Connection, PublicKey } = require('@solana/web3.js');

(async () => {
  try {
    info('=== Starting Copy-Trading Bot ===');
    storage.initStorage(); // initialize JSON storage

    // Create a Solana connection to reuse when checking balances
    const connection = new Connection(config.SOLANA_RPC, 'confirmed');

    /** Attempt to sell `amountTokens` of `mint` on `dex`. 
     *  If an "Insufficient SPL token balance" error arises, re-fetch the actual token balance 
     *  and retry selling whatever remains. If zero, log and close the position. 
     */
    async function safeSell(pos) {
      const { mint, token_amount, id, dex } = pos;
      const desiredAmount = token_amount;

      try {
        await sellToken({
          mint,
          amountTokens: desiredAmount,
          slippage: config.SLIPPAGE,
          tip: config.JITO_TIP,
          dex
        });
        return true; // sold successfully
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('Insufficient SPL token balance')) {
          warn(
            `[Main] Insufficient SPL token balance for position ${id} (mint ${mint}). ` +
            `Error: ${msg}. Re-checking on-chain balance...`
          );

          // Re-fetch token balance
          const ownerPubkey = new PublicKey(config.PUBLIC_KEY);
          const accounts = await connection.getParsedTokenAccountsByOwner(ownerPubkey, {
            mint: new PublicKey(mint)
          });
          let actualBalance = 0;
          if (accounts.value.length > 0) {
            actualBalance = accounts.value.reduce((sum, acct) => {
              return sum + parseFloat(acct.account.data.parsed.info.tokenAmount.uiAmountString);
            }, 0);
          }

          if (actualBalance > 0) {
            info(
              `[Main] Position ${id} has ${actualBalance} tokens on-chain (vs requested ${desiredAmount}). ` +
              `Retrying sell of ${actualBalance}...`
            );
            try {
              await sellToken({
                mint,
                amountTokens: actualBalance,
                slippage: config.SLIPPAGE,
                tip: config.JITO_TIP,
                dex
              });
              return true;
            } catch (err2) {
              error(
                `[Main] Retry sell for position ${id} still failed:`,
                err2.message
              );
              return false;
            }
          } else {
            info(
              `[Main] Position ${id} has zero token balance on-chain. ` +
              `Marking position as closed.`
            );
            storage.updatePosition(id, { status: 'closed' });
            return false;
          }
        } else {
          // Other errors bubble up
          throw err;
        }
      }
    }

    // === BOT_MODE = SELLING: Liquidate all active positions, then exit ===
    if (config.BOT_MODE === 'SELLING') {
      info('[Main] BOT_MODE=SELLING → liquidating all active positions...');
      const active = storage.getActivePositions();
      for (const pos of active) {
        try {
          const sold = await safeSell(pos);
          if (sold) {
            storage.updatePosition(pos.id, { status: 'closed', current_price: 0 });
            info(`[Main] Position ${pos.id} (mint ${pos.mint}) sold and closed.`);
          }
        } catch (err) {
          error(`[Main] Failed to liquidate position ${pos.id}:`, err.message);
        }
      }
      info('[Main] All positions processed. Exiting.');
      process.exit(0);
    }

    // === BOT_MODE = COPY: Normal copy-trading flow ===
    info('[Main] BOT_MODE=COPY → initializing normal copy flow.');

    // --- 1) Start price-polling loop (for TP/SL on SAFE positions) ---
    async function pricePollingLoop() {
      const activePositions = storage.getActivePositions();
      for (const pos of activePositions) {
        try {
          const { mint, entry_price, stop_loss_pct, take_profit_pct, trade_mode, id, dex } = pos;
          const priceData = await getPriceOnChain(mint);
          if (!priceData) continue;
          const currentPrice = priceData.priceInSol;

          storage.updatePosition(id, { current_price: currentPrice });

          if (trade_mode === 'SAFE') {
            const changePct = ((currentPrice - entry_price) / entry_price) * 100.0;
            if (changePct >= take_profit_pct) {
              info(
                `[Main][TP] Position ${id} (${mint}) reached TAKE_PROFIT: +${changePct.toFixed(2)}%. Selling...`
              );
              const sold = await safeSell(pos);
              if (sold) {
                storage.updatePosition(id, { status: 'closed' });
                info(`[Main][TP] Position ${id} closed at price ${currentPrice}.`);
              }
            } else if (changePct <= -stop_loss_pct) {
              info(
                `[Main][SL] Position ${id} (${mint}) triggered STOP_LOSS: ${changePct.toFixed(2)}%. Selling...`
              );
              const sold = await safeSell(pos);
              if (sold) {
                storage.updatePosition(id, { status: 'closed' });
                info(`[Main][SL] Position ${id} closed at price ${currentPrice}.`);
              }
            } else {
              info(
                `[Main] Position ${id} (${mint}) still open. ` +
                  `Entry ${entry_price.toFixed(8)}, current ${currentPrice.toFixed(8)}, Δ ${changePct.toFixed(2)}%.`
              );
            }
          }
          // EXACT-mode positions are closed only when copy-wallet sells; no TP/SL here.
        } catch (err) {
          error('[Main] Error in pricePollingLoop for position', pos.id, err.message);
        }
      }
    }

    setInterval(pricePollingLoop, config.PRICE_CHECK_DELAY);
    info(`[Main] Launched price polling every ${config.PRICE_CHECK_DELAY}ms.`);

    // --- 2) Initialize WebSocket to listen to copy-wallet trades ---
    const emitter = new CopyEmitter();
    emitter.connect();

    emitter.on('copyTrade', async msg => {
      try {
        // DEBUG: Log exactly what arrived
        console.log('[Main] Received copyTrade event:', JSON.stringify(msg));

        const {
          signature,
          dexs,
          ca: mint,
          trade,
          priceInSol,
          solAmount,
          tokenAmount
        } = msg;

        // Attempt to map dex; if no match, default to "jupiter"
        let dex = mapDex(dexs);
        if (!dex) {
          warn(
            `[Main] Could not map dex for incoming trade ${signature}, defaulting to "jupiter".`
          );
          dex = 'jupiter';
        }

        // --- 2a) COPY-WALLET BUY event ---
        if (trade === 'buy' && solAmount < 0) {
          // Look for any active position with this mint
          const existingPos = storage.getActivePositions().find(p => p.mint === mint);

          // If MULTI_BUY is disabled and an active position exists, skip entirely
          if (!config.ENABLE_MULTI_BUY && existingPos) {
            info(
              `[Main] MULTI_BUY disabled and already have position for ${mint}, skipping buy.`
            );
            return;
          }

          // Determine how much SOL to spend
          let buyAmountSol;
          if (config.TRADE_TYPE === 'EXACT') {
            buyAmountSol = Math.abs(solAmount);
          } else {
            buyAmountSol = config.BUY_AMOUNT;
          }

          info(
            `[Main] Copy-wallet BUY detected: mint=${mint}, copy spent=${Math.abs(solAmount)} SOL. ` +
              `Placing our BUY of ${buyAmountSol} SOL on ${dex}...`
          );

          // Execute buy
          const buySig = await buyToken({
            mint,
            amountSol: buyAmountSol,
            slippage: config.SLIPPAGE,
            tip: config.JITO_TIP,
            dex
          });

          info(`[Main] Waiting 10 seconds for buy transaction ${buySig} to confirm...`);
          await sleep(10000);

          // Fetch on-chain token balance
          const ownerPubkey = new PublicKey(config.PUBLIC_KEY);
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPubkey, {
            mint: new PublicKey(mint)
          });
          let ourTokenAmount = 0;
          if (tokenAccounts.value.length > 0) {
            ourTokenAmount = tokenAccounts.value.reduce((sum, acct) => {
              return sum + parseFloat(acct.account.data.parsed.info.tokenAmount.uiAmountString);
            }, 0);
          }

          // Fetch current price to compute entry_price
          const priceData = await getPriceOnChain(mint);
          const currentPriceSol = priceData ? priceData.priceInSol : null;
          let entryPrice;
          if (currentPriceSol && ourTokenAmount > 0) {
            entryPrice = buyAmountSol / ourTokenAmount;
          } else {
            entryPrice = priceInSol || 0;
          }

          if (existingPos && config.ENABLE_MULTI_BUY) {
            // Update the existing position's token_amount
            storage.updatePosition(existingPos.id, { token_amount: ourTokenAmount });
            info(
              `[Main] MULTI_BUY enabled: updated existing position ${existingPos.id} ` +
                `for mint=${mint} to token_amount=${ourTokenAmount}.`
            );
          } else {
            // No existing position (or MULTI_BUY disabled with no existingPos), so create a new one
            const newPos = storage.addPosition({
              mint,
              buy_amount: buyAmountSol,
              token_amount: ourTokenAmount,
              entry_price: entryPrice,
              trade_mode: config.TRADE_TYPE,
              parent_signature: signature,
              stop_loss_pct: config.TRADE_TYPE === 'SAFE' ? config.STOP_LOSS : null,
              take_profit_pct: config.TRADE_TYPE === 'SAFE' ? config.TAKE_PROFIT : null,
              dex
            });

            info(
              `[Main] New position stored. ID=${newPos.id}, mint=${mint}, tokens=${ourTokenAmount}, ` +
                `entry_price=${entryPrice.toFixed(8)} SOL, dex=${dex}.`
            );
          }
        }

        // --- 2b) COPY-WALLET SELL event ---
        else if (trade === 'sell' && tokenAmount < 0) {
          // Only close EXACT-mode positions on copy-sell
          if (config.TRADE_TYPE === 'EXACT') {
            const existingExact = storage.findExactActiveByMint(mint);
            if (!existingExact) {
              info(
                `[Main] Copy-wallet SOLD ${mint} but we have no EXACT position open, ignoring.`
              );
              return;
            }
            info(
              `[Main] Copy-wallet SELL detected for mint=${mint}. ` +
                `Selling our EXACT position ID=${existingExact.id} on ${existingExact.dex}...`
            );
            const sold = await safeSell(existingExact);
            if (sold) {
              storage.updatePosition(existingExact.id, { status: 'closed' });
              info(
                `[Main] EXACT position ${existingExact.id} for ${mint} closed (copy-wallet sell).`
              );
            }
          }
        }
      } catch (err) {
        error('[Main] Error handling copyTrade event:', err.message);
      }
    });

    info('[Main] Bot is now listening to COPY_WALLET trades...');
  } catch (err) {
    error('[Main] Fatal error:', err.message);
    process.exit(1);
  }
})();
