# Solana Copy Trading Bot

A fast Solana copy-trading bot leveraging Jito to mirror any transaction from a designated "copy" wallet. Supports all major DEXs (Pump.fun, Pump.fun AMM, Raydium, Meteora, Moonshot, Orca, Jupiter) and includes essential features for automated trading.

🔗 **Repository:** https://github.com/ahk780/solana-copy-trading-bot  
⭐ Give this repo a star if you find it helpful!  

---

## Table of Contents

1. [Overview](#overview)  
2. [Features](#features)  
3. [Prerequisites](#prerequisites)  
4. [Installation](#installation)  
5. [Configuration](#configuration)  
6. [Project Structure](#project-structure)  
7. [Usage](#usage)  
8. [Environment Variables Reference](#environment-variables-reference)  
9. [Links & Resources](#links--resources)  
10. [Community & Support](#community--support)  
11. [Contributing](#contributing)  
12. [License](#license)  

---

## Overview

This bot connects to CoinVera’s WebSocket API to subscribe to trades of a specified wallet. It mirrors each buy/sell by submitting transactions via Jito. It tracks open positions in a local JSON database and can operate in either “COPY” or “SELLING” mode.

---

## Features

- **DEX Coverage:** Pump.fun, Pump.fun AMM, Raydium, Meteora, Moonshot, Orca, Jupiter, and more.  
- **Jito Execution:** Fast, low-latency transaction submission.  
- **Trade Modes:**  
  - **EXACT:** Mirror exact SOL spent.  
  - **SAFE:** Use fixed BUY_AMOUNT with Stop-Loss/Take-Profit.  
- **Multi-Buy Toggle:** Enable/disable multiple buys per mint.  
- **Position Tracking:** Persistent JSON storage for open/closed positions.  
- **Price Monitoring:** Polls CoinVera HTTP API for TP/SL checks.  
- **Emergency SELL:** Liquidate all positions on startup if desired.  
- **Accurate Balances:** Raw BigInt + decimals to avoid rounding errors.  
- **User-Friendly Logs:** Clear, timestamped console output.  

---

## Prerequisites

- **Node.js** (v16+), **npm**  
- Solana wallet private key (Base58) with sufficient SOL  
- CoinVera API key for price data and WebSocket subscription  
- Copy wallet public address whose trades will be mirrored  

---

## Installation

```bash
git clone https://github.com/ahk780/solana-copy-trading-bot.git
cd solana-copy-trading-bot
npm install
mkdir data
echo '{ "positions": [] }' > data/positions.json
mv .env.example .env
npm start
```

---

## Configuration

Rename `.env.example` to `.env` and configure variables:

- **SOLANA_RPC**: Solana RPC URL (e.g. Jito RPC or mainnet-beta).  
- **PRIVATE_KEY**: Base58 private key for signing.  
- **PUBLIC_KEY**: Corresponding public key for balance checks.  
- **BOT_MODE**: `COPY` or `SELLING`.  
- **COPY_WALLET**: Wallet address to mirror.  
- **TRADE_TYPE**: `EXACT` or `SAFE`.  
- **BUY_AMOUNT**, **TAKE_PROFIT**, **STOP_LOSS**: Only for `SAFE`.  
- **ENABLE_MULTI_BUY**: `true` or `false`.  
- **SLIPPAGE**, **JITO_TIP**, **JITO_ENGINE**: Execution parameters.  
- **COINVERA_API**, **PRICE_CHECK_DELAY**: Price monitoring settings.  

Refer to the `.env.example` for details and examples.  

---

## Project Structure

```
.
├── .env.example          # Copy to .env and configure
├── data/
│   └── positions.json    # Persisted position records
├── utils/
│   └── getTimestamp.js   # ISO timestamp helper
└── src/
    ├── config.js         # Loads and validates environment variables
    ├── logger.js         # Timestamped console logger
    ├── storage.js        # Reads/writes data/positions.json
    ├── dexMapper.js      # Maps CoinVera DEX names to SolanaPortal codes
    ├── priceChecker.js   # Fetches prices from CoinVera HTTP API
    ├── websocket.js      # Subscribes to CoinVera WS, emits copyTrade events
    ├── tradeExecutor.js  # Builds & submits SolanaPortal/Jito transactions
    └── index.js          # Main application logic and event loop
```

---

## Usage

1. Clone & install (see [Installation](#installation)).  
2. Rename `.env.example` to `.env` and fill in values.  
3. Run:  
   ```bash
   npm start
   ```  
   - `BOT_MODE=SELLING`: Liquidate all open positions and exit.  
   - `BOT_MODE=COPY`: Listen for copy-wallet trades and mirror them.  

---

## Environment Variables Reference

| Variable            | Description                                                                                   |
|---------------------|-----------------------------------------------------------------------------------------------|
| `SOLANA_RPC`        | RPC endpoint (mainnet-beta)                                                      |
| `PRIVATE_KEY`       | Base58 private key for signing transactions                                                   |
| `PUBLIC_KEY`        | Wallet public key for balance queries                                                          |
| `BOT_MODE`          | `COPY` (normal) or `SELLING` (liquidate & exit)                                                |
| `COPY_WALLET`       | Wallet address to mirror                                                                      |
| `TRADE_TYPE`        | `EXACT` or `SAFE`                                                                            |
| `BUY_AMOUNT`        | (If `TRADE_TYPE=SAFE`) SOL to spend per buy                                                     |
| `TAKE_PROFIT`       | (If `TRADE_TYPE=SAFE`) TP percentage                                                          |
| `STOP_LOSS`         | (If `TRADE_TYPE=SAFE`) SL percentage                                                          |
| `ENABLE_MULTI_BUY`  | `true` or `false`                                                                               |
| `SLIPPAGE`          | Slippage tolerance (%)                                                                         |
| `JITO_TIP`          | SOL tip per transaction to prioritize on Jito                                                   |
| `JITO_ENGINE`       | Jito RPC endpoint (e.g. `https://tokyo.mainnet.block-engine.jito.wtf/api/v1/transactions`) |
| `COINVERA_API`      | CoinVera HTTP API key (for price lookups & WS)                                                 |
| `PRICE_CHECK_DELAY` | Polling interval in ms for open-position price checks                                          |

---

## Links & Resources

- **SolanaPortal Docs:** https://docs.solanaportal.io  
- **CoinVera:** https://www.coinvera.io  
- **Telegram Community:** https://telegram.com/ahk780  

---

## Community & Support

- ⭐ Star the repo: https://github.com/ahk780/solana-copy-trading-bot  
- 💬 Join our Telegram to request features or get help:  
  https://telegram.com/ahk780  

---

## Contributing

1. Fork the repository.  
2. Create a branch: `git checkout -b feature/new-feature`.  
3. Make changes & commit: `git commit -m "Add new feature"`.  
4. Push & open a Pull Request.  

---

## License

Licensed under the MIT License.  