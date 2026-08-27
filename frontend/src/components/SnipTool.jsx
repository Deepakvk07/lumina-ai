import { API_BASE_URL, WS_BASE_URL } from '../config/api';
import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, Clipboard, Sparkles, Check } from 'lucide-react';
import { wsClient } from '../services/wsClient';

export const SnipTool = ({ isOpen, onClose, onSolveStarted }) => {
  const [isSnipping, setIsSnipping] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [previewImg, setPreviewImg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          setPreviewImg(event.target.result);
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  // Kept in a ref so the listener effect below can depend only on isOpen. onClose is a new
  // closure every parent render, and depending on it would tear down and re-add the window
  // listeners on each one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Paste has to be caught on window: a paste with no focused input targets <body>,
  // which is not a descendant of this dialog, so an onPaste prop here never fires.
  // Escape is handled here too — it is the only mouse-free way out, which matters because
  // this dialog can be opened by a global hotkey while the mouse is doing something else.
  useEffect(() => {
    if (!isOpen) return;
    const onWindowPaste = (e) => handlePaste(e);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
      }
    };
    window.addEventListener('paste', onWindowPaste);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('paste', onWindowPaste);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const handleFetchClipboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/snip-clipboard`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        onSolveStarted?.();
        onClose?.();
      } else {
        alert(data.detail || 'No screenshot in clipboard. Press Win+Shift+S first.');
      }
    } catch (err) {
      console.error(err);
      alert('Error contacting middle layer backend.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSolvePreview = () => {
    if (!previewImg) return;
    wsClient.send('ask', {
      question: 'Solve this live coding / system design interview problem. Provide optimal code, Big-O complexity, and verbal explanation.',
      image_base64: previewImg
    });
    onSolveStarted?.();
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-xl p-6 bg-white border border-gray-200 text-gray-900 shadow-xl rounded-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Solve Screen Coding Problem</h2>
            <p className="text-xs text-gray-500">LeetCode, HackerRank, CodeSignal & System Design</p>
          </div>
        </div>

        {!previewImg ? (
          <div className="space-y-4">
            <div 
              onClick={handleFetchClipboard}
              className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer bg-indigo-50/50 hover:bg-indigo-50 transition group"
            >
              <Clipboard className="w-10 h-10 mx-auto text-indigo-500 group-hover:scale-110 transition mb-3" />
              <p className="text-sm font-semibold text-gray-900">
                1. Press <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs text-indigo-600 font-mono">Win + Shift + S</kbd> to Snip
              </p>
              <p className="text-xs text-gray-500 mt-1">
                2. Click here or press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs text-indigo-600 font-mono">Ctrl + V</kbd> to analyze & solve
              </p>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-500 px-1">
              <span>Supports code snippets, test cases & diagrams</span>
              <button
                disabled={isLoading}
                onClick={handleFetchClipboard}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isLoading ? 'Analyzing...' : 'Fetch from Clipboard'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-64 overflow-hidden rounded-xl border border-gray-200 relative bg-gray-50 flex items-center justify-center">
              <img src={previewImg} alt="Captured Snippet" className="w-full h-full object-contain" />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewImg(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition"
              >
                Clear
              </button>
              <button
                onClick={handleSolvePreview}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                Generate Solution & Talking Points
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
