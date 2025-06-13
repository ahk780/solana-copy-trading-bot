// src/websocket.js
const WebSocket = require('ws');
const EventEmitter = require('events');
const config = require('./config');
const { info, error, warn } = require('./logger');

class CopyEmitter extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.pingInterval = null;
  }

  connect() {
    const WS_URL = 'wss://api.coinvera.io';
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      info(`[WebSocket] Connection opened. Subscribing to trades for ${config.COPY_WALLET}...`);
      const payload = {
        apiKey: config.COINVERA_API,
        method: 'subscribeTrade',
        tokens: [config.COPY_WALLET]
      };
      this.ws.send(JSON.stringify(payload));
      info('[WebSocket] Subscribe request sent');

      // Keep‐alive PING every 10 seconds
      this.pingInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 10000);
    });

    this.ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());

        // Only log subscription success
        if (msg.type === 'subscribeTrade' && msg.status === 'success') {
          info('[WebSocket] Successfully subscribed to WebSocket');
        }

        // Only emit if signer matches COPY_WALLET
        if (msg.signer && msg.signer === config.COPY_WALLET) {
          this.emit('copyTrade', msg);
        }
      } catch (err) {
        error('[WebSocket] Error parsing message:', err.message);
      }
    });

    this.ws.on('error', err => {
      error('[WebSocket] Error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      warn(`[WebSocket] Closed: ${code} - ${reason}. Reconnecting in 5s...`);
      if (this.pingInterval) clearInterval(this.pingInterval);
      setTimeout(() => this.connect(), 5000);
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      if (this.pingInterval) clearInterval(this.pingInterval);
    }
  }
}

module.exports = CopyEmitter;
