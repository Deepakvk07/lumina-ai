import { API_BASE_URL, WS_BASE_URL } from '../config/api';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Sparkles, 
  Copy, 
  Check, 
  EyeOff, 
  Eye,
  MousePointer, 
  Minimize2, 
  Maximize2, 
  Sliders, 
  X,
  History,
  Trash2,
  FileText,
  Award,
  RefreshCw,
  Code,
  Zap,
  RotateCcw,
  Move
} from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import { SnipTool } from './SnipTool';
import { wsClient } from '../services/wsClient';
import { cleanMathAndLatex } from '../utils/mathCleaner';

// Custom Markdown Code Block with Syntax Bar & 1-Click Copy
const CustomCodeBlock = ({ inline, className, children, ...props }) => {
  const match = /language-(\\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\\n$/, '');
  const isBlock = !inline && (match || codeString.includes('\\n'));
  const [codeCopied, setCodeCopied] = useState(false);

  if (isBlock) {
    return (
      <div className="my-2.5 rounded-xl border border-gray-200 overflow-hidden bg-slate-900 text-slate-100 text-xs shadow-md">
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span className="font-bold text-slate-200 uppercase">{language || 'CODE'}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(codeString);
              setCodeCopied(true);
              setTimeout(() => setCodeCopied(false), 1500);
            }}
            className="hover:text-white transition flex items-center gap-1 cursor-pointer"
          >
            {codeCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{codeCopied ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
        <pre className="p-3.5 overflow-x-auto font-mono leading-relaxed text-[12px] selection:bg-indigo-500 selection:text-white">
          <code>{children}</code>
        </pre>
      </div>
    );
  }
  return (
    <code className="bg-indigo-50/80 text-indigo-700 font-mono text-[11.5px] px-1.5 py-0.5 rounded border border-indigo-100" {...props}>
      {children}
    </code>
  );
};

export const StealthHUD = ({ 
  config, 
  onSwitchToSolver,
  onBackToLauncher, 
  onOpenSettings 
}) => {
  const [currentQuestion, setCurrentQuestion] = useState('Waiting for interviewer question...');
  const [isInterim, setIsInterim] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opacity, setOpacity] = useState(config?.hud_opacity || 0.90);
  const [fontSize, setFontSize] = useState(config?.hud_font_size || 15);
  const [isClickThrough, setIsClickThrough] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isEyeContact, setIsEyeContact] = useState(config?.eye_contact_mode || false);
  const [isSnipOpen, setIsSnipOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [loopbackLevel, setLoopbackLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [isListening, setIsListening] = useState(false); // Controls loopback gate on backend

  // Session History & Debrief Modal state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [debriefMarkdown, setDebriefMarkdown] = useState('');
  const [isDebriefLoading, setIsDebriefLoading] = useState(false);
  const [debriefCopied, setDebriefCopied] = useState(false);

  // Movable / Draggable state
  const [position, setPosition] = useState({ x: null, y: null });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const answerEndRef = useRef(null);
  const isClickThroughRef = useRef(false);
  const isSnipOpenRef = useRef(false);
  const snipSuspendedClickThroughRef = useRef(false);
  const firstChunkRef = useRef(false);

  useEffect(() => {
    isClickThroughRef.current = isClickThrough;
  }, [isClickThrough]);

  // Subscribe to Middle-Layer WebSocket events
  useEffect(() => {
    const unsubLevel = wsClient.on('audio_level', (data) => {
      setLoopbackLevel(data.loopback || 0);
      setMicLevel(data.mic || 0);
    });

    const unsubInterim = wsClient.on('interim_transcription', (data) => {
      if (data.text) {
        setCurrentQuestion(data.text);
        setIsInterim(true);
      }
    });

    const unsubTrans = wsClient.on('transcription', (data) => {
      if (data.source === 'interviewer') {
        setCurrentQuestion(data.text);
        setIsInterim(false);
      }
    });

    const unsubStart = wsClient.on('answer_start', (data) => {
      setIsGenerating(true);
      setIsInterim(false);
      setCurrentQuestion(data.question);
      firstChunkRef.current = true;
    });

    const unsubChunk = wsClient.on('answer_chunk', (data) => {
      if (firstChunkRef.current) {
        firstChunkRef.current = false;
        setStreamingAnswer(data.delta || '');
      } else {
        setStreamingAnswer((prev) => prev + (data.delta || ''));
      }
    });

    const unsubDone = wsClient.on('answer_done', (data) => {
      setIsGenerating(false);
      if (data.history_count !== undefined) {
        setHistoryCount(data.history_count);
      }
    });

    const unsubInit = wsClient.on('init', (data) => {
      if (data.history_count !== undefined) {
        setHistoryCount(data.history_count);
      }
    });

    const unsubListen = wsClient.on('listen_state', (data) => {
      setIsListening(!!data.listening);
    });

    fetch(`${API_BASE_URL}/api/listen/start`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setIsListening(!!d.listening))
      .catch(() => {});

    // Listen to electron global hotkeys
    let cleanupHotkey;
    if (window.electronAPI) {
      cleanupHotkey = window.electronAPI.onHotkeyTriggered((action) => {
        if (action === 'clickthrough_on') {
          snipSuspendedClickThroughRef.current = false;
          setIsClickThrough(true);
        } else if (action === 'clickthrough_off') {
          snipSuspendedClickThroughRef.current = false;
          setIsClickThrough(false);
        } else if (action === 'snip_screen') {
          openSnip();
        } else if (action === 'panic_hide') {
          setIsHidden((prev) => !prev);
        }
      });
    }

    return () => {
      unsubLevel();
      unsubInterim();
      unsubTrans();
      unsubStart();
      unsubChunk();
      unsubDone();
      unsubInit();
      unsubListen();
      if (cleanupHotkey) cleanupHotkey();
    };
  }, []);

  // Global keyboard shortcut (Ctrl+Shift+H) to toggle pane visibility
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        setIsHidden((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mouse Drag Handlers
  const handleDragMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    isDraggingRef.current = true;
    const box = e.currentTarget.closest('.draggable-box');
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 320, e.clientX - dragOffsetRef.current.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragOffsetRef.current.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Sync native Electron window opacity
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.setOpacity(opacity);
    }
  }, [opacity]);

  useEffect(() => {
    if (isGenerating && answerEndRef.current) {
      answerEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingAnswer, isGenerating]);

  const handleCopy = () => {
    if (!streamingAnswer) return;
    navigator.clipboard.writeText(cleanMathAndLatex(streamingAnswer));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSendManual = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    wsClient.send('ask', { question: manualInput.trim() });
    setCurrentQuestion(manualInput.trim());
    setIsGenerating(true);
    firstChunkRef.current = true;
    setManualInput('');
  };

  const applyClickThrough = (nextVal) => {
    setIsClickThrough(nextVal);
    if (window.electronAPI) {
      window.electronAPI.setClickThrough(nextVal);
    } else {
      fetch(`${API_BASE_URL}/api/clickthrough`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: nextVal, window_title: 'AudioSrvHost' })
      });
    }
  };

  const toggleClickThrough = () => {
    snipSuspendedClickThroughRef.current = false;
    applyClickThrough(!isClickThrough);
  };

  const openSnip = () => {
    if (isSnipOpenRef.current) return;
    isSnipOpenRef.current = true;
    snipSuspendedClickThroughRef.current = isClickThroughRef.current;
    if (isClickThroughRef.current) {
      applyClickThrough(false);
    }
    setIsSnipOpen(true);
  };

  const closeSnip = () => {
    if (!isSnipOpenRef.current) return;
    isSnipOpenRef.current = false;
    setIsSnipOpen(false);
    if (snipSuspendedClickThroughRef.current) {
      applyClickThrough(true);
    }
    snipSuspendedClickThroughRef.current = false;
  };

  const toggleListen = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/listen/toggle`, { method: 'POST' });
      const data = await res.json();
      setIsListening(data.listening);
    } catch (err) {
      console.error('Failed to toggle listen:', err);
    }
  };

  // Fetch session history list
  const openHistoryModal = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`);
      const data = await res.json();
      setHistoryList(data.history || []);
      setHistoryCount(data.total || 0);
    } catch (err) {
      console.error(err);
    }
    setIsHistoryOpen(true);
  };

  // Request AI Debrief report
  const generateDebriefReport = async () => {
    setIsDebriefLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/debrief`, { method: 'POST' });
      const data = await res.json();
      setDebriefMarkdown(data.debrief_markdown || '');
    } catch (err) {
      setDebriefMarkdown('Error generating AI debrief report.');
    } finally {
      setIsDebriefLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear session history?')) return;
    try {
      await fetch(`${API_BASE_URL}/api/history/clear`, { method: 'POST' });
      setHistoryList([]);
      setHistoryCount(0);
      setDebriefMarkdown('');
    } catch (err) {
      console.error(err);
    }
  };

  const copyDebrief = () => {
    if (!debriefMarkdown) return;
    navigator.clipboard.writeText(cleanMathAndLatex(debriefMarkdown));
    setDebriefCopied(true);
    setTimeout(() => setDebriefCopied(false), 1500);
  };

  const resetPosition = () => {
    setPosition({ x: null, y: null });
  };

  // Cleaned math answer for rendering
  const formattedAnswer = cleanMathAndLatex(streamingAnswer);

  // When hidden, render 100% NOTHING — completely invisible!
  // Press Ctrl+Shift+H to restore anytime.
  if (isHidden) {
    return null;
  }

  return (
    <>
      <div
          className={`fixed z-40 draggable-box transition-opacity duration-200 select-text ${
            isEyeContact 
              ? 'top-0 inset-x-0 mx-auto max-w-2xl px-4 pt-1' 
              : 'max-w-3xl w-full'
          }`}
          style={{
            left: !isEyeContact && position.x !== null ? `${position.x}px` : '50%',
            top: !isEyeContact && position.y !== null ? `${position.y}px` : (isEyeContact ? '0px' : '12px'),
            transform: (!isEyeContact && position.x !== null) ? 'none' : 'translateX(-50%)',
            opacity: isClickThrough ? Math.min(opacity, 0.75) : opacity
          }}
        >
          {/* Eye-Contact Camera Alignment Notch Dot */}
          {isEyeContact && (
            <div className="w-2.5 h-1 bg-violet-600 rounded-full mx-auto mb-0.5 opacity-80 animate-pulse" title="Direct Camera Eye-Contact Line" />
          )}

          <div className="bg-[#1a1d27] backdrop-blur-md rounded-2xl border border-white/10 text-white shadow-2xl overflow-hidden">
            {/* Top Control Header with Drag support */}
            <div
              onMouseDown={handleDragMouseDown}
              className="flex items-center justify-between px-3 py-1.5 bg-[#13151f] border-b border-white/8 cursor-move select-none"
              title="Click and drag to move HUD box anywhere"
            >
              {/* Left Title & Status Badges */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight">
                  <span className="bg-violet-600 text-white text-[10px] font-bold px-2 py-0.5 rounded mr-1">LUMINA</span>
                  <span className="text-gray-400 text-[11px] font-medium">Live Voice Assistant & Solver</span>
                </div>

                {isEyeContact && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-900/50 text-violet-300 border-violet-700 font-medium flex items-center gap-1">
                    <Eye className="w-2.5 h-2.5" /> Eye-Contact Mode
                  </span>
                )}

                {isClickThrough && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-900/50 text-amber-400 border-amber-700 font-medium">
                    Click-Through Active
                  </span>
                )}

                <Move className="w-3 h-3 text-gray-400 opacity-60 ml-0.5" />
              </div>

              {/* Audio Visualizer */}
              <AudioVisualizer loopbackLevel={loopbackLevel} micLevel={micLevel} />

              {/* Right Controls */}
              <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                {/* ── Auto-Listening Active Badge ── */}
                <div
                  title="Automatic live audio capture is active. Transcribes interviewer voice in real-time."
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-emerald-400 font-bold text-[10.5px] select-none"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  <span>Auto-Listening</span>
                </div>

                {/* ── Switch to Question Solver ── */}
                <button
                  type="button"
                  onClick={onSwitchToSolver}
                  title="Switch to Question Solver (Coding, Aptitude, Reasoning, MCQ)"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-violet-900/30 hover:border-violet-600/50 text-gray-400 hover:text-violet-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-violet-600" />
                  <span>Solver</span>
                </button>

                {/* Reset Position (if dragged) */}
                {position.x !== null && !isEyeContact && (
                  <button
                    type="button"
                    onClick={resetPosition}
                    title="Reset position to top center"
                    className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}

                {/* Eye-Contact Toggle Button */}
                <button
                  type="button"
                  onClick={() => setIsEyeContact(!isEyeContact)}
                  title={isEyeContact ? "Switch to Floating Mode" : "Center Directly Under Webcam (Eye-Contact Mode)"}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isEyeContact 
                      ? 'bg-violet-900/50 border border-violet-600 text-violet-300 transition cursor-pointer' 
                      : 'bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 transition cursor-pointer'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>

                {/* Session History & Debrief Button */}
                <button
                  type="button"
                  onClick={openHistoryModal}
                  title="Session History & AI Debrief"
                  className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition relative cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  {historyCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                      {historyCount}
                    </span>
                  )}
                </button>

                {/* Screen Snip button */}
                <button
                  type="button"
                  onClick={openSnip}
                  title="Snip Screen Coding Problem"
                  className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>

                {/* Click-through toggle */}
                <button
                  type="button"
                  onClick={toggleClickThrough}
                  title="Toggle Mouse Click-Through (Ctrl+Shift+T)"
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isClickThrough 
                      ? 'bg-amber-900/50 border border-amber-600 text-amber-400 transition cursor-pointer' 
                      : 'bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 transition cursor-pointer'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                </button>

                {/* Minimize / Expand */}
                <button
                  type="button"
                  onClick={() => setIsMinimized(!isMinimized)}
                  title={isMinimized ? "Expand HUD" : "Minimize HUD"}
                  className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                </button>

                {/* Hide HUD Pane */}
                <button
                  type="button"
                  onClick={() => setIsHidden(true)}
                  title="Hide HUD (Ctrl+Shift+H)"
                  className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>

                {/* Settings */}
                <button
                  type="button"
                  onClick={onOpenSettings}
                  title="Preferences & Setup"
                  className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>

                {/* Back to Launcher */}
                <button
                  type="button"
                  onClick={onBackToLauncher}
                  title="Return to Mode Selector"
                  className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Main Body */}
            {!isMinimized && (
              <div className="p-3.5 space-y-3">
                {/* Question Banner */}
                <div className={`flex items-start gap-2.5 px-3 py-2 rounded-xl transition-colors ${
                  isInterim 
                    ? 'bg-amber-950/50 border border-amber-800/40' 
                    : 'bg-violet-950/50 border border-violet-800/40'
                }`}>
                  <span className={`text-[11px] font-bold uppercase tracking-wider text-white px-2 py-0.5 rounded whitespace-nowrap mt-0.5 flex items-center gap-1 ${
                    isInterim ? 'bg-amber-600 animate-pulse' : 'bg-violet-600'
                  }`}>
                    {isInterim ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        <span>Listening</span>
                      </>
                    ) : (
                      'Question'
                    )}
                  </span>
                  <p className="text-xs font-semibold text-gray-200 leading-relaxed flex-1">
                    {currentQuestion}
                    {isInterim && <span className="inline-block w-1.5 h-3.5 bg-amber-500 animate-pulse ml-1 align-middle" />}
                  </p>
                  {isGenerating && (
                    <div className="flex items-center gap-1 text-[11px] text-violet-400 font-mono animate-pulse whitespace-nowrap">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Streaming...</span>
                    </div>
                  )}
                </div>

                {/* Answer Content Card */}
                <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
                  {/* Top Toolbar */}
                  <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#13151f] border-b border-gray-800 min-h-[34px]">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                      <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                      <span>AI Response</span>
                      {isGenerating && (
                        <span className="text-[11px] font-normal text-violet-400 font-mono animate-pulse">
                          (streaming...)
                        </span>
                      )}
                    </div>

                    {formattedAnswer && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="px-2.5 py-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-300 hover:text-indigo-600 rounded-md shadow-2xs transition flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>

                  {/* Text Content */}
                  <div 
                    className="max-h-80 overflow-y-auto px-4 py-3.5 text-gray-300 markdown-content leading-relaxed"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {formattedAnswer ? (
                      <>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: CustomCodeBlock
                          }}
                        >
                          {formattedAnswer}
                        </ReactMarkdown>
                        <div ref={answerEndRef} />
                      </>
                    ) : (
                      <div className="py-8 text-center text-gray-500 text-xs">
                        <Sparkles className="w-5 h-5 mx-auto mb-1.5 text-violet-400/30" />
                        <span className="font-semibold text-gray-400">Audio Copilot Ready</span>
                        <p className="text-[11px] text-gray-600 mt-1 max-w-sm mx-auto">
                          Click <b>Listen</b> when interviewer speaks, or type a question below.
                          Answers will be grounded in your resume with STAR structure.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Controls: Input & Opacity */}
                <div className="flex items-center gap-3 pt-0.5">
                  <form onSubmit={handleSendManual} className="flex-1">
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="Type follow-up question manually (Press Enter to ask)..."
                      className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3.5 py-2 text-xs transition"
                    />
                  </form>

                  {/* Opacity slider */}
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 shrink-0">
                    <span>Opacity:</span>
                    <input
                      type="range"
                      min="0.3"
                      max="1.0"
                      step="0.05"
                      value={opacity}
                      onChange={(e) => setOpacity(parseFloat(e.target.value))}
                      className="w-16 accent-violet-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* Session History & AI Debrief Modal */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-gray-900 w-full max-w-2xl rounded-2xl border border-gray-800 text-gray-100 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-gray-950 border-b border-gray-800">
              <div className="flex items-center gap-2 font-bold text-sm text-gray-100">
                <History className="w-4 h-4 text-violet-600" />
                <span>Interview Session History & AI Debrief</span>
                <span className="px-2 py-0.5 rounded-full bg-violet-900/50 text-violet-300 text-xs font-semibold border border-violet-700">
                  {historyList.length} Questions
                </span>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-300 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between px-6 py-2.5 bg-gray-900 border-b border-gray-800/60 text-xs">
              <button
                onClick={generateDebriefReport}
                disabled={isDebriefLoading || historyList.length === 0}
                className="px-3 py-1.5 bg-violet-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Award className="w-3.5 h-3.5" />
                {isDebriefLoading ? 'Generating Debrief...' : 'Generate AI Debrief Report'}
              </button>

              {historyList.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-gray-500 hover:text-red-400 transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {/* Body Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {debriefMarkdown && (
                <div className="p-4 bg-violet-950/40 border border-violet-800/40 rounded-xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-violet-800/40">
                    <span className="font-bold text-violet-300 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-violet-600" />
                      AI Assessment & Feedback Report
                    </span>
                    <button
                      onClick={copyDebrief}
                      className="px-2.5 py-1 bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-300 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    >
                      {debriefCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{debriefCopied ? 'Copied' : 'Copy Report'}</span>
                    </button>
                  </div>
                  <div className="markdown-content text-gray-300 leading-relaxed text-xs">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {cleanMathAndLatex(debriefMarkdown)}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Q&A List */}
              {historyList.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-300 uppercase tracking-wider text-[11px]">Recorded Questions & Answers</h4>
                  {historyList.map((item, idx) => (
                    <div key={item.id || idx} className="p-3.5 bg-gray-800 border border-gray-700 rounded-xl space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 bg-violet-600 text-white rounded text-[10px] font-bold">
                            Q{idx + 1}
                          </span>
                          <span className="font-semibold text-gray-200">{item.question}</span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono shrink-0">{item.time_str}</span>
                      </div>
                      <div className="text-gray-300 bg-white p-2.5 rounded-lg border border-gray-200/70 text-xs markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CustomCodeBlock }}>
                          {cleanMathAndLatex(item.answer)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-gray-400 space-y-1">
                  <History className="w-8 h-8 mx-auto text-gray-700" />
                  <p className="font-medium text-xs text-gray-400">No questions recorded in this session yet.</p>
                  <p className="text-[11px] text-gray-600">Questions asked during your interview will appear here automatically.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screen Snip Tool */}
      <SnipTool
        isOpen={isSnipOpen}
        onClose={closeSnip}
        onSolveStarted={() => {
          setIsGenerating(true);
        }}
      />
    </>
  );
};
