// Centralized API & WebSocket URL configuration
// Auto-detects local host, LAN IP (e.g. mobile access), and Vercel environment variables

const isBrowser = typeof window !== 'undefined';

function resolveHost() {
  if (!isBrowser) return '127.0.0.1';

  try {
    const saved = localStorage.getItem('lumina_backend_host');
    if (saved) return saved;
  } catch (e) {}

  const proto = window.location.protocol;
  const host = window.location.hostname;

  // Inside Chrome Extension, hostname is the 32-character extension ID
  // e.g. "chrome-extension://npgkjdfoejfoiejfoj..." -> MUST use 127.0.0.1
  if (proto === 'chrome-extension:' || !host || host.includes('vercel.app') || host.length > 25) {
    return '127.0.0.1';
  }

  // If local IPv4 LAN address or localhost, use current host
  if (host === 'localhost' || host === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return host;
  }

  return '127.0.0.1';
}

const defaultHost = resolveHost();

export const API_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL || `http://${defaultHost}:8765`;

export const WS_BASE_URL = 
  import.meta.env.VITE_WS_BASE_URL || `ws://${defaultHost}:8765/ws`;
