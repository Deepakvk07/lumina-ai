import { API_BASE_URL, WS_BASE_URL } from '../config/api';
import React, { useState, useEffect, useRef } from 'react';
import { X, Key, Sliders, Shield, FileText, Check, Cpu, Mic, EyeOff, MousePointer, ChevronDown, Upload } from 'lucide-react';

const SettingsDropdown = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-gray-800 border-gray-700 rounded-lg px-3 py-2 text-xs font-medium text-gray-200 transition cursor-pointer ${
          isOpen ? 'border-violet-500 ring-1 ring-violet-500 bg-gray-800' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <span className="truncate">{selectedOption.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-150 ${isOpen ? 'rotate-180 text-violet-400' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition cursor-pointer text-left ${
                  isSelected
                    ? 'bg-violet-900/40 text-violet-300 font-semibold'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const SettingsModal = ({ isOpen, onClose, config, onSaveConfig }) => {
  const [formData, setFormData] = useState(config || {});
  const [activeTab, setActiveTab] = useState('llm'); // 'llm', 'candidate', 'appearance', 'hotkeys'
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const resumeFileRef = useRef(null);

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  if (!isOpen) return null;

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'txt' || ext === 'md') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === 'string') {
          handleChange('candidate_resume', text.trim());
        }
      };
      reader.readAsText(file);
      return;
    }

    setIsParsingResume(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE_URL}/api/resume/parse`, {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          handleChange('candidate_resume', data.text);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsParsingResume(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        onSaveConfig?.(formData);
        setSavedSuccess(true);
        setTimeout(() => {
          setSavedSuccess(false);
          onClose();
        }, 800);
      }
    } catch (err) {
      console.error(err);
      alert('Error saving configuration.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 w-full max-w-2xl rounded-2xl border border-gray-800 text-gray-100 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-950 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-bold text-gray-900">Preferences & Setup</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-950 border-b border-gray-800 px-6 gap-6 text-xs font-semibold">
          {[
            { id: 'llm', label: 'AI & Speech APIs', icon: Cpu },
            { id: 'candidate', label: 'Resume & Persona', icon: FileText },
            { id: 'appearance', label: 'Stealth & HUD', icon: Shield },
            { id: 'hotkeys', label: 'Hotkeys', icon: Key },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 flex items-center gap-1.5 border-b-2 transition ${
                  active
                    ? 'border-indigo-600 text-violet-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1 bg-gray-900">
          {activeTab === 'llm' && (
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Default AI Provider</label>
                <SettingsDropdown
                  value={formData.llm_provider || 'gemini'}
                  onChange={(val) => handleChange('llm_provider', val)}
                  options={[
                    { value: 'gemini', label: 'Google Gemini (Gemini 2.0 Flash - Recommended for speed)' },
                    { value: 'groq', label: 'Groq (GPT-OSS 120B - Fast LPUs)' },
                    { value: 'openai', label: 'OpenAI (GPT-4o / GPT-4o-mini)' },
                    { value: 'claude', label: 'Anthropic Claude (Claude 3.5 Sonnet)' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Gemini API Key</label>
                <input
                  type="password"
                  value={formData.gemini_api_key || ''}
                  onChange={(e) => handleChange('gemini_api_key', e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Groq API Key (Fastest STT & LLM)</label>
                <input
                  type="password"
                  value={formData.groq_api_key || ''}
                  onChange={(e) => handleChange('groq_api_key', e.target.value)}
                  placeholder="gsk_..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Anthropic Claude API Key</label>
                <input
                  type="password"
                  value={formData.anthropic_api_key || ''}
                  onChange={(e) => handleChange('anthropic_api_key', e.target.value)}
                  placeholder="sk-ant-api03-... or proxy key"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Claude Proxy / Custom Base URL (Optional)</label>
                <input
                  type="text"
                  value={formData.anthropic_base_url || ''}
                  onChange={(e) => handleChange('anthropic_base_url', e.target.value)}
                  placeholder="https://api.anthropic.com or custom relay"
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg text-sm focus:outline-none"
                />
              </div>
            </div>
          )}

          {activeTab === 'candidate' && (
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Target Position / Job Title</label>
                <input
                  type="text"
                  value={formData.target_position || ''}
                  onChange={(e) => handleChange('target_position', e.target.value)}
                  placeholder="e.g. Senior Full Stack Engineer"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">Key Skills & Tech Stack</label>
                <input
                  type="text"
                  value={formData.candidate_skills || ''}
                  onChange={(e) => handleChange('candidate_skills', e.target.value)}
                  placeholder="Python, React, TypeScript, AWS, Microservices, System Design"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-gray-900 font-medium">
                    Resume / Work History (Injected into STAR responses)
                  </label>
                  <button
                    type="button"
                    disabled={isParsingResume}
                    onClick={() => resumeFileRef.current?.click()}
                    className="text-xs text-violet-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-60 font-medium"
                  >
                    <Upload className={`w-3 h-3 ${isParsingResume ? 'animate-spin' : ''}`} />
                    <span>{isParsingResume ? 'Extracting text...' : 'Upload PDF/Docx'}</span>
                  </button>
                  <input
                    type="file"
                    ref={resumeFileRef}
                    onChange={handleResumeUpload}
                    accept=".pdf,.docx,.doc,.txt,.md"
                    className="hidden"
                  />
                </div>
                <textarea
                  rows={4}
                  value={formData.candidate_resume || ''}
                  onChange={(e) => handleChange('candidate_resume', e.target.value)}
                  placeholder="Paste key achievements, previous company projects, metrics (e.g. Scaled database from 10k to 2M QPS, led migration to Next.js)..."
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2 text-sm focus:outline-none font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">
                  Target Job Description / Key Requirements
                </label>
                <textarea
                  rows={3}
                  value={formData.job_description || ''}
                  onChange={(e) => handleChange('job_description', e.target.value)}
                  placeholder="Paste target job requirements, tech stack keywords, team expectations..."
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2 text-sm focus:outline-none font-mono text-[11px]"
                />
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <EyeOff className="w-4 h-4 text-violet-400" />
                    Screen-Share Invisibility (WDA_EXCLUDEFROMCAPTURE)
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Hides window completely on Zoom, Teams, Meet, Discord & recordings.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.stealth_enabled ?? true}
                  onChange={(e) => handleChange('stealth_enabled', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    Speculative Pre-Answering (&lt;100ms Latency)
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Pre-computes answers in background while interviewer is finishing sentence.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.speculative_enabled ?? true}
                  onChange={(e) => handleChange('speculative_enabled', e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <EyeOff className="w-4 h-4 text-violet-400" />
                    Camera Eye-Contact Teleprompter Mode
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Snaps HUD directly below top webcam bezel so reading answers looks like 100% direct eye contact.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.eye_contact_mode ?? false}
                  onChange={(e) => handleChange('eye_contact_mode', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-400 text-xs font-medium mb-1">
                  <span>HUD Transparency / Opacity</span>
                  <span className="text-violet-400 font-mono">{Math.round((formData.hud_opacity || 0.9) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="1.0"
                  step="0.05"
                  value={formData.hud_opacity || 0.9}
                  onChange={(e) => handleChange('hud_opacity', parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-gray-400 text-xs font-medium mb-1">
                  <span>HUD Font Size</span>
                  <span className="text-violet-400 font-mono">{formData.hud_font_size || 15}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="20"
                  step="1"
                  value={formData.hud_font_size || 15}
                  onChange={(e) => handleChange('hud_font_size', parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'hotkeys' && (
            <div className="space-y-3">
              <p className="text-gray-500 text-xs">
                Global hotkeys active anytime, even while typing inside IDEs or interview tabs:
              </p>
              {[
                { name: 'Panic Hide / Reveal HUD', key: 'Ctrl + Shift + H', desc: 'Instantly toggle window visibility' },
                { name: 'Snip & Solve Screen Problem', key: 'Ctrl + Shift + S', desc: 'Capture LeetCode/HackerRank question' },
                { name: 'Toggle Click-Through Mode', key: 'Ctrl + Shift + T', desc: 'Make HUD transparent to mouse clicks' },
                { name: 'Push to Transcribe / Answer', key: 'Ctrl + Space', desc: 'Force trigger answer generation' },
              ].map((hk, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-3 py-2">
                  <div>
                    <div className="font-semibold text-gray-900">{hk.name}</div>
                    <div className="text-[11px] text-gray-500">{hk.desc}</div>
                  </div>
                  <kbd className="bg-gray-700 border border-gray-600 text-violet-300 font-mono rounded px-1.5 py-0.5 text-xs">
                    {hk.key}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-800 bg-gray-950 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 font-semibold rounded-lg px-4 py-2 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5 transition"
          >
            {savedSuccess ? <Check className="w-4 h-4 text-white" /> : null}
            {savedSuccess ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
