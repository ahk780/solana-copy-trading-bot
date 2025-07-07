# Solana Copy Trading Bot

A fast Solana copy-trading bot leveraging Jito to mirror any transaction from a designated "copy" wallet. Supports all major DEXs (Pump.fun, Pump.fun AMM, Raydium, Meteora, Moonshot, Orca, Jupiter) and includes essential features for automated trading.

🔗 **Repository:** https://github.com/ahk780/solana-copy-trading-bot  
⭐ Give this repo a star if you find it helpful!  

## Video Guide
- **Watch this video to see the bot in action**

[<img src="https://i.ibb.co/1GpdMzDy/Solana-Copy-Trading-Bot.jpg" width="50%">](https://www.youtube.com/watch?v=Gbw7UfrGSLU "Solana Copy Trading Bot")

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

This bot connects to CoinVera's WebSocket API to subscribe to trades of a specified wallet. It mirrors each buy/sell by submitting transactions via Jito. It tracks open positions in a local JSON database and can operate in either "COPY" or "SELLING" mode.

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
- **Trailing Stop Loss:** Dynamic stop loss that follows price movements upward, locking in profits while allowing for maximum upside.  
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
- **ENABLE_TRAILING_STOP**, **TRAILING_STOP_DISTANCE**, **TRAILING_STOP_ACTIVATION**: Trailing stop loss configuration.  

### Trailing Stop Loss

The trailing stop loss feature is an advanced risk management tool that automatically adjusts your stop loss upward as the price increases, helping lock in profits while allowing for continued upside potential. This dynamic approach maximizes your profit potential while protecting against significant reversals.

#### 📚 **How Trailing Stop Loss Works**

**Phase 1: Monitoring (Before Activation)**
- Bot tracks the highest price reached since entry
- Trailing stop remains inactive until activation threshold is met
- Regular stop loss provides downside protection

**Phase 2: Activation**
- When profit reaches `TRAILING_STOP_ACTIVATION` threshold, trailing stop activates
- Initial trailing stop price is set at `TRAILING_STOP_DISTANCE` below current peak
- Bot continues to track peak price movements

**Phase 3: Dynamic Adjustment**
- As price rises to new peaks, trailing stop moves up proportionally
- Trailing stop price = Peak Price × (1 - `TRAILING_STOP_DISTANCE` / 100)
- **Important**: Trailing stop never moves down, only up

**Phase 4: Execution**
- When price drops to or below the trailing stop price, position is sold immediately
- Profit is locked in at the trailing stop level

#### 🔄 **Integration with Existing Features**

The bot checks exit conditions in this **priority order**:
1. **🎯 Trailing Stop Loss** (highest priority - if active)
2. **📈 Take Profit** (fixed percentage)
3. **📉 Stop Loss** (fixed percentage)

**Interaction Examples:**

| Scenario | Entry | Peak | Current | Action | Result |
|----------|-------|------|---------|--------|--------|
| Trailing Stop Wins | $1.00 | $2.00 | $1.79 | Trailing Stop | Sell at $1.79 (+79%) |
| Take Profit Wins | $1.00 | $1.45 | $1.50 | Take Profit | Sell at $1.50 (+50%) |
| Stop Loss Protects | $1.00 | $1.15 | $0.80 | Stop Loss | Sell at $0.80 (-20%) |

#### ⚙️ **Configuration Options**

```env
# Enable/disable trailing stop loss
ENABLE_TRAILING_STOP=true

# Distance below peak price to maintain stop loss (percentage)
TRAILING_STOP_DISTANCE=10.0

# Minimum profit before trailing stop activates (percentage)
TRAILING_STOP_ACTIVATION=20.0
```

#### 🎯 **Configuration Strategies**

**Conservative Strategy (Risk-Averse)**
```env
ENABLE_TRAILING_STOP=true
TRAILING_STOP_DISTANCE=15.0      # Wider distance - less sensitive
TRAILING_STOP_ACTIVATION=30.0    # Higher activation - more selective
TAKE_PROFIT=40.0                 # Lower take profit - secure gains
STOP_LOSS=15.0                   # Tighter stop loss - limit losses
```

**Aggressive Strategy (Maximum Profit)**
```env
ENABLE_TRAILING_STOP=true
TRAILING_STOP_DISTANCE=8.0       # Closer distance - more sensitive
TRAILING_STOP_ACTIVATION=15.0    # Lower activation - starts sooner
TAKE_PROFIT=100.0                # Higher take profit - let winners run
STOP_LOSS=25.0                   # Wider stop loss - ride volatility
```

**Balanced Strategy (Recommended)**
```env
ENABLE_TRAILING_STOP=true
TRAILING_STOP_DISTANCE=12.0      # Moderate distance
TRAILING_STOP_ACTIVATION=25.0    # Reasonable activation threshold
TAKE_PROFIT=60.0                 # Balanced take profit
STOP_LOSS=20.0                   # Standard stop loss
```

#### 📊 **Detailed Examples**

**Example 1: Successful Trailing Stop**
```
Entry Price: $1.00
Config: TSL Distance=10%, TSL Activation=20%

Price Movement:
$1.00 → $1.10 (+10%) → Tracking peak, TSL not active
$1.10 → $1.25 (+25%) → TSL ACTIVATES, stop at $1.125
$1.25 → $1.60 (+60%) → TSL updates to $1.44
$1.60 → $1.80 (+80%) → TSL updates to $1.62
$1.80 → $1.61 (+61%) → TSL TRIGGERS, sells at $1.61

Result: +61% profit (vs +80% peak, -10.6% from peak)
```

**Example 2: Take Profit Override**
```
Entry Price: $1.00
Config: TSL Distance=10%, TSL Activation=20%, Take Profit=50%

Price Movement:
$1.00 → $1.25 (+25%) → TSL activates, stop at $1.125
$1.25 → $1.50 (+50%) → TAKE PROFIT triggers immediately

Result: +50% profit (take profit overrides trailing stop)
```

**Example 3: Stop Loss Protection**
```
Entry Price: $1.00
Config: TSL Distance=10%, TSL Activation=20%, Stop Loss=15%

Price Movement:
$1.00 → $1.15 (+15%) → TSL not active yet (below 20%)
$1.15 → $0.85 (-15%) → STOP LOSS triggers

Result: -15% loss (regular stop loss protects before TSL activates)
```

#### 🚨 **Important Considerations**

**Market Volatility:**
- High volatility may trigger trailing stops prematurely
- Consider wider `TRAILING_STOP_DISTANCE` for volatile tokens
- Monitor and adjust based on market conditions

**Activation Timing:**
- Too low activation threshold: May activate on small pumps
- Too high activation threshold: May miss profit protection opportunities
- Recommended range: 15-30% depending on strategy

**Distance Setting:**
- Too tight distance: Frequent false triggers on normal volatility
- Too wide distance: May give back too much profit
- Recommended range: 8-15% depending on token behavior

#### 🧪 **Testing Your Configuration**

Before going live, it's recommended to:

1. **Start with Conservative Settings**: Use wider distances and higher activation thresholds
2. **Monitor Initial Trades**: Watch how the trailing stop behaves with your token selections
3. **Adjust Based on Results**: Fine-tune parameters based on actual performance
4. **Use Small Amounts**: Test with smaller `BUY_AMOUNT` initially

#### 📈 **Performance Benefits**

- **Profit Maximization**: Captures more upside than fixed take profit
- **Risk Management**: Protects against significant reversals
- **Automated Execution**: No manual intervention required
- **Adaptive Strategy**: Adjusts to market movements in real-time

#### 🔧 **Technical Implementation**

- **Storage**: All trailing stop data persisted in `positions.json`
- **Logging**: Comprehensive logging with `[TSL]` prefix for easy monitoring
- **Mode Support**: Only available in `SAFE` mode (not `EXACT` mode)
- **Performance**: Minimal overhead, checked during regular price polling

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
| `PREFERRED_DEX`     | Preferred DEX for trading. Options: "none" (system decides) or specific DEX: "auto", "pumpfun", "meteora", "raydium", "moonshot", "jupiter" |
| `ENABLE_TRAILING_STOP` | Enable trailing stop loss feature (`true` or `false`)                                       |
| `TRAILING_STOP_DISTANCE` | Distance below peak price to trail (%)                                                   |
| `TRAILING_STOP_ACTIVATION` | Minimum profit percentage before trailing starts (%)                                   |

---

## Links & Resources

- **SolanaPortal Docs:** https://docs.solanaportal.io  
- **CoinVera:** [https://www.coinvera.io](https://www.coinvera.io/auth/signup?ref=680482c95d22a2a1ece8d092)  
- **Telegram Community:** https://t.me/ahk782  

---

## Community & Support

- ⭐ Star the repo: https://github.com/ahk780/solana-copy-trading-bot  
- 💬 Join our Telegram to request features or get help:  
  https://t.me/ahk782  

---

## Contributing

1. Fork the repository.  
2. Create a branch: `git checkout -b feature/new-feature`.  
3. Make changes & commit: `git commit -m "Add new feature"`.  
4. Push & open a Pull Request.  

---

## License

Licensed under the MIT License.  
