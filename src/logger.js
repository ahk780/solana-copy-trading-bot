// src/logger.js

function timestamp() {
  return new Date().toISOString();
}

function info(...args) {
  console.log(`[${timestamp()}] [INFO]`, ...args);
}

function warn(...args) {
  console.log(`[${timestamp()}] [WARN]`, ...args);
}

function error(...args) {
  console.log(`[${timestamp()}] [ERROR]`, ...args);
}

module.exports = { info, warn, error };
