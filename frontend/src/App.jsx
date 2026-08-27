import { API_BASE_URL, WS_BASE_URL } from './config/api';
import React, { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { StealthHUD } from './components/StealthHUD';
import { QuestionSolver } from './components/QuestionSolver';
import { SettingsModal } from './components/SettingsModal';
import { wsClient } from './services/wsClient';

export default function App() {
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('lumina_view_mode') || 'hud';
    } catch {
      return 'hud';
    }
  });
  const [config, setConfig] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const switchMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('lumina_view_mode', mode);
    } catch {}
  };

  useEffect(() => {
    // Fetch initial config from backend
    fetch(`${API_BASE_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
      })
      .catch((err) => {
        console.warn('Backend offline, using defaults:', err);
      });

    // Initialize WS connection
    wsClient.connect();

    const unsubInit = wsClient.on('init', (data) => {
      if (data.config) {
        setConfig(data.config);
      }
    });

    return () => {
      unsubInit();
    };
  }, []);

  const saveParams = async (params) => {
    try {
      const updated = { ...config, ...params };
      setConfig(updated);
      await fetch(`${API_BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartHUD = async (params) => {
    if (params) await saveParams(params);
    switchMode('hud');
  };

  const handleStartSolver = async (params) => {
    if (params) await saveParams(params);
    switchMode('solver');
  };

  return (
    <div className="w-full h-full bg-transparent text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-visible">
      {viewMode === 'onboarding' && (
        <Onboarding
          config={config}
          onStartHUD={handleStartHUD}
          onStartSolver={handleStartSolver}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {viewMode === 'hud' && (
        <StealthHUD
          config={config}
          onSwitchToSolver={() => switchMode('solver')}
          onBackToLauncher={() => switchMode('onboarding')}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {viewMode === 'solver' && (
        <QuestionSolver
          config={config}
          onSwitchToHUD={() => switchMode('hud')}
          onBackToLauncher={() => switchMode('onboarding')}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => setConfig(newConfig)}
      />
    </div>
  );
}

