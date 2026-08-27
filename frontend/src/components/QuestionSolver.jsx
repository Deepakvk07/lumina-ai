import { API_BASE_URL, WS_BASE_URL } from '../config/api';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Zap, 
  Sparkles, 
  Copy, 
  Check, 
  X, 
  Camera, 
  Clipboard, 
  RotateCcw, 
  EyeOff, 
  Sliders, 
  Move, 
  Maximize2, 
  Minimize2,
  Headphones,
  Monitor
} from 'lucide-react';
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

export const QuestionSolver = ({
  config,
  onSwitchToHUD,
  onBackToLauncher,
  onOpenSettings
}) => {
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState(null); // base64 data-url
  const [solverAnswer, setSolverAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opacity, setOpacity] = useState(config?.hud_opacity || 0.92);
  const [fontSize, setFontSize] = useState(config?.hud_font_size || 15);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isScanningScreen, setIsScanningScreen] = useState(false);
  const [isFetchingClipboard, setIsFetchingClipboard] = useState(false);

  // Movable / Draggable state
  const [position, setPosition] = useState({ x: null, y: null });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const answerEndRef = useRef(null);

  // Sync native Electron window opacity
  useEffect(() => {
    if (window.electronAPI?.setOpacity) {
      window.electronAPI.setOpacity(opacity);
    }
  }, [opacity]);

  // Global paste handler — AUTO SOLVES IMMEDIATELY ON SCREENSHOT PASTE!
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target.result;
            setAttachedImage(dataUrl);
            // ⚡ AUTOMATICALLY START SOLVING IMMEDIATELY — NO MANUAL CLICK NEEDED!
            executeSolve('', dataUrl);
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // Keyboard shortcut Ctrl+Shift+H to toggle 100% COMPLETE INVISIBILITY
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        setIsHidden((prev) => {
          const next = !prev;
          if (next && window.electronAPI?.hide) window.electronAPI.hide();
          else if (!next && window.electronAPI?.show) window.electronAPI.show();
          return next;
        });
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

  // Auto-scroll when answer tokens stream
  useEffect(() => {
    if (isGenerating && answerEndRef.current) {
      answerEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [solverAnswer, isGenerating]);

  // Fetch screenshot from clipboard (Win+Shift+S) — AUTO SOLVES IMMEDIATELY!
  const handleFetchClipboard = async () => {
    setIsFetchingClipboard(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/snip-clipboard`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.image_base64) {
        const dataUrl = 'data:image/png;base64,' + data.image_base64;
        setAttachedImage(dataUrl);
        // ⚡ AUTOMATICALLY START SOLVING IMMEDIATELY!
        executeSolve('', dataUrl);
      } else {
        alert(data.detail || 'No screenshot in clipboard. Press Win+Shift+S first, then click here.');
      }
    } catch (err) {
      alert('Middle-layer backend offline.');
    } finally {
      setIsFetchingClipboard(false);
    }
  };

  // 1-Click Scan Full Screen / Entire Website — AUTO SOLVES IMMEDIATELY!
  const handleScanScreen = async () => {
    setIsScanningScreen(true);
    try {
      let fullDataUrl = null;
      if (window.electronAPI?.captureScreen) {
        fullDataUrl = await window.electronAPI.captureScreen();
      }
      if (!fullDataUrl) {
        const res = await fetch(`${API_BASE_URL}/api/scan-screen`, { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.image_base64) {
          fullDataUrl = 'data:image/jpeg;base64,' + data.image_base64;
        }
      }
      if (fullDataUrl) {
        setAttachedImage(fullDataUrl);
        // ⚡ AUTOMATICALLY START SOLVING IMMEDIATELY!
        executeSolve(
          'Scan this entire webpage/screen, detect every question/problem visible, and output ONLY the option numbers and answers for each.',
          fullDataUrl
        );
      } else {
        alert('Failed to capture screen.');
      }
    } catch (err) {
      alert('Could not capture screen. Ensure backend is running.');
    } finally {
      setIsScanningScreen(false);
    }
  };

  // Core solve logic
  const executeSolve = async (overridePrompt, overrideImage) => {
    const textToSend = overridePrompt !== undefined ? overridePrompt : inputText.trim();
    const imageToSend = overrideImage || attachedImage;

    if (!textToSend && !imageToSend) return;

    const finalPrompt = textToSend || 'Solve the question in the screenshot with 100% mathematical precision and output the correct option.';

    setSolverAnswer('');
    setIsGenerating(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: finalPrompt,
          image_base64: imageToSend || null,
          category: 'auto',
          answer_style: 'option_only'
        })
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setSolverAnswer(`Error: ${err.detail || res.statusText}`);
        setIsGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let first = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const token = line.slice(6);
          if (token === '[DONE]') break;
          const restoredToken = token.replaceAll('⏎', '\n');
          if (first) {
            setSolverAnswer(restoredToken);
            first = false;
          } else {
            setSolverAnswer((prev) => prev + restoredToken);
          }
        }
      }
    } catch (err) {
      setSolverAnswer(`Connection error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!solverAnswer) return;
    navigator.clipboard.writeText(cleanMathAndLatex(solverAnswer));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClear = () => {
    setInputText('');
    setAttachedImage(null);
    setSolverAnswer('');
  };

  const resetPosition = () => {
    setPosition({ x: null, y: null });
  };

  const handleCompleteHide = () => {
    setIsHidden(true);
    if (window.electronAPI?.hide) {
      window.electronAPI.hide();
    }
  };

  // Cleaned math answer for rendering
  const formattedAnswer = cleanMathAndLatex(solverAnswer);

  // When hidden, render 100% NOTHING — COMPLETELY INVISIBLE!
  // Press Ctrl+Shift+H to unhide anytime.
  if (isHidden) {
    return null;
  }

  return (
    <div
      className="fixed z-40 draggable-box transition-opacity duration-200 select-text"
      style={{
        left: position.x !== null ? `${position.x}px` : '50%',
        top: position.y !== null ? `${position.y}px` : '12px',
        transform: position.x !== null ? 'none' : 'translateX(-50%)',
        width: '100%',
        maxWidth: '640px',
        opacity: opacity,
      }}
    >
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200 text-gray-900 shadow-2xl overflow-hidden">
        {/* Draggable Top Header */}
        <div
          onMouseDown={handleDragMouseDown}
          className="flex items-center justify-between px-4 py-2 bg-gray-50/95 border-b border-gray-200 cursor-move select-none"
          title="Click and drag to move box anywhere"
        >
          {/* Title & Brand */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-2xs">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-1.5 font-bold text-xs text-gray-900">
              <span>Question Solver</span>
              <span className="text-[10px] font-medium text-emerald-700 px-1.5 py-0.2 bg-emerald-50 rounded border border-emerald-200">
                Option Only
              </span>
            </div>
            <Move className="w-3 h-3 text-gray-400 opacity-60 ml-1" />
          </div>

          {/* Header Right Action Buttons */}
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            {/* 1-Click Scan Full Screen / Website Button */}
            <button
              type="button"
              onClick={handleScanScreen}
              disabled={isScanningScreen || isGenerating}
              title="Capture whole screen / website & solve questions automatically"
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer disabled:opacity-60 shadow-xs"
            >
              <Monitor className={`w-3 h-3 ${isScanningScreen ? 'animate-spin' : ''}`} />
              <span>{isScanningScreen ? 'Scanning...' : 'Scan Website'}</span>
            </button>

            {/* Switch to Voice Copilot */}
            <button
              type="button"
              onClick={onSwitchToHUD}
              title="Switch to Live Audio Interview Copilot"
              className="px-2 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <Headphones className="w-3 h-3" />
              <span>Voice HUD</span>
            </button>

            {/* Reset Position (if moved) */}
            {position.x !== null && (
              <button
                type="button"
                onClick={resetPosition}
                title="Reset position to top center"
                className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-500 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}

            {/* Minimize / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsMinimized(!isMinimized)}
              title={isMinimized ? "Expand Solver" : "Minimize Solver"}
              className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 transition cursor-pointer"
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Complete Hide (100% Invisible — Ctrl+Shift+H to restore) */}
            <button
              type="button"
              onClick={handleCompleteHide}
              title="100% Complete Hide (Press Ctrl+Shift+H to unhide)"
              className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-indigo-600 transition cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>

            {/* Settings */}
            <button
              type="button"
              onClick={onOpenSettings}
              title="Settings & API Keys"
              className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 transition cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            {/* Back to Launcher */}
            <button
              type="button"
              onClick={onBackToLauncher}
              title="Return to Mode Selector"
              className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-rose-600 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        {!isMinimized && (
          <div className="p-3.5 space-y-3">
            {/* ── ONE UNIFIED PASTE & CAPTURE SECTION ── */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600">
                <span className="flex items-center gap-1">
                  <Clipboard className="w-3 h-3 text-indigo-600" />
                  <span>Paste Screenshot (<kbd className="px-1 py-0.2 bg-white border border-gray-300 rounded text-[10px] font-mono">Ctrl+V</kbd> auto-solves)</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchClipboard}
                    disabled={isFetchingClipboard || isGenerating}
                    className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer font-bold"
                    title="Grab snip from clipboard (Win+Shift+S)"
                  >
                    <Camera className="w-3 h-3" />
                    <span>{isFetchingClipboard ? 'Fetching...' : 'Grab Snip (Win+Shift+S)'}</span>
                  </button>
                  {(inputText || attachedImage) && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="text-gray-400 hover:text-rose-600 transition flex items-center gap-0.5 cursor-pointer"
                      title="Clear input"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Text Input Area */}
              <textarea
                rows={attachedImage ? 2 : 2.5}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    executeSolve();
                  }
                }}
                placeholder="Paste screenshot (Ctrl+V) for instant auto-solve, or type text (Ctrl+Enter)..."
                className="w-full text-xs p-2.5 bg-white border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition"
              />

              {/* Attached Image Preview */}
              {attachedImage && (
                <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-white p-1.5 flex items-center justify-between gap-2 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <img
                      src={attachedImage}
                      alt="Pasted screenshot"
                      className="h-12 w-24 object-cover rounded border border-gray-200 shrink-0"
                    />
                    <div className="text-[11px] text-gray-600 truncate">
                      <span className="font-semibold text-emerald-700 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Screenshot Attached
                      </span>
                      <p className="text-[10px] text-gray-400">Processing automatically...</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                    title="Remove attached screenshot"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Action Button (also triggers on manual click if needed) */}
              <button
                type="button"
                onClick={() => executeSolve()}
                disabled={isGenerating || (!inputText.trim() && !attachedImage)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Finding Option Number...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Get Option Number (Ctrl+Enter)</span>
                  </>
                )}
              </button>
            </div>

            {/* ── ANSWER OUTPUT SECTION ── */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Output Header Toolbar */}
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-gray-100/80 border-b border-gray-200 min-h-[32px]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Correct Option / Answer</span>
                  {isGenerating && (
                    <span className="text-[11px] font-normal text-indigo-600 font-mono animate-pulse">
                      (computing...)
                    </span>
                  )}
                </div>

                {formattedAnswer && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 py-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 hover:text-indigo-600 rounded-md shadow-2xs transition flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>

              {/* Output Markdown Text */}
              <div
                className="max-h-64 overflow-y-auto px-4 py-3 text-gray-900 markdown-content text-sm font-semibold leading-relaxed"
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
                ) : isGenerating ? (
                  <div className="py-6 text-center text-indigo-600 animate-pulse space-y-2">
                    <Sparkles className="w-5 h-5 mx-auto animate-spin text-indigo-600" />
                    <p className="font-bold text-xs text-indigo-700">Solving question with 100% precision...</p>
                    <p className="text-[10.5px] text-gray-400">Verifying mathematical formulas & options...</p>
                  </div>
                ) : (
                  <div className="py-5 text-center text-gray-400 text-xs font-normal">
                    <Zap className="w-5 h-5 mx-auto mb-1 text-indigo-400/40" />
                    <span>Paste screenshot (Ctrl+V) or click <b>Scan Website</b> to see option numbers.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Opacity & Font Slider */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-0.5 px-1">
              <div className="flex items-center gap-2">
                <span>Font:</span>
                <button
                  type="button"
                  onClick={() => setFontSize(Math.max(12, fontSize - 1))}
                  className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200 font-bold"
                >
                  -
                </button>
                <span className="font-mono text-gray-700">{fontSize}px</span>
                <button
                  type="button"
                  onClick={() => setFontSize(Math.min(22, fontSize + 1))}
                  className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200 font-bold"
                >
                  +
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span>Opacity:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-20 accent-indigo-600 cursor-pointer"
                  title="Adjust transparency (down to 10% ghost mode)"
                />
                <span className="font-mono text-gray-600 w-7 text-right">{Math.round(opacity * 100)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
