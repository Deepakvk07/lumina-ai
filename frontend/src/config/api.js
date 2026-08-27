// Centralized API & WebSocket URL configuration
// Auto-detects local host, LAN IP (e.g. mobile access), and Vercel environment variables

const isBrowser = typeof window !== 'undefined';
const defaultHost = isBrowser && window.location.hostname ? window.location.hostname : '127.0.0.1';

export const API_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL || `http://${defaultHost}:8765`;

export const WS_BASE_URL = 
  import.meta.env.VITE_WS_BASE_URL || `ws://${defaultHost}:8765/ws`;
