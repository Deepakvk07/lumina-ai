import { API_BASE_URL, WS_BASE_URL } from '../config/api';
class WSClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.isConnected = false;
    this.reconnectInterval = 2000;
  }

  connect(url = WS_BASE_URL) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connection', { status: 'connected' });
        console.log('[WS] Connected to middle-layer backend');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type, data);
          this.emit('all', data);
        } catch (err) {
          console.error('[WS] Error parsing message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('connection', { status: 'disconnected' });
        console.log('[WS] Connection closed. Reconnecting in 2s...');
        setTimeout(() => this.connect(url), this.reconnectInterval);
      };

      this.ws.onerror = (err) => {
        console.error('[WS] WebSocket error:', err);
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      setTimeout(() => this.connect(url), this.reconnectInterval);
    }
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    } else {
      console.warn('[WS] Cannot send message, socket not connected');
    }
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.off(type, callback);
  }

  off(type, callback) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).delete(callback);
    }
  }

  emit(type, data) {
    if (this.listeners.has(type)) {
      this.listeners.get(type).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WS] Error in listener for ${type}:`, e);
        }
      });
    }
  }
}

export const wsClient = new WSClient();
