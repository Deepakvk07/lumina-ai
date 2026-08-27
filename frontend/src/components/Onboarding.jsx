import { API_BASE_URL, WS_BASE_URL } from '../config/api';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Settings, 
  ChevronDown, 
  ChevronUp,
  ArrowRight,
  Check,
  FileText,
  Briefcase,
  Upload,
  Headphones,
  Zap,
  Code,
  Target,
  Brain,
  Cpu
} from 'lucide-react';

const CustomDropdown = ({ label, value, onChange, options }) => {
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
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">
        {label}
      </label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-white border rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-800 transition cursor-pointer shadow-2xs ${
          isOpen ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {selectedOption.icon && <span className="text-xs">{selectedOption.icon}</span>}
          <span>{selectedOption.label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 max-h-56 overflow-y-auto">
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
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {opt.icon && <span className="text-xs">{opt.icon}</span>}
                  <span>{opt.label}</span>
                </span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const Onboarding = ({ 
  config, 
  onStartHUD, 
  onStartSolver, 
  onOpenSettings 
}) => {
  const [targetPosition, setTargetPosition] = useState(config?.target_position || 'Software Engineer');
  const [language, setLanguage] = useState(config?.language || 'us English (US)');
  const [answerDepth, setAnswerDepth] = useState(config?.answer_depth || 'short');
  const [answerFormat, setAnswerFormat] = useState(config?.answer_format || 'with_details');
  const [candidateResume, setCandidateResume] = useState(config?.candidate_resume || '');
  const [jobDescription, setJobDescription] = useState(config?.job_description || '');
  const [showGrounding, setShowGrounding] = useState(false);
  const [isParsingResume, setIsParsingResume] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (config) {
      if (config.target_position) setTargetPosition(config.target_position);
      if (config.language) setLanguage(config.language);
      if (config.answer_depth) setAnswerDepth(config.answer_depth);
      if (config.answer_format) setAnswerFormat(config.answer_format);
      if (config.candidate_resume !== undefined) setCandidateResume(config.candidate_resume);
      if (config.job_description !== undefined) setJobDescription(config.job_description);
    }
  }, [config]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingResume(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE_URL}/api/resume/parse`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.text) {
        setCandidateResume(data.text);
        setShowGrounding(true);
      } else {
        alert(data.detail || 'Failed to parse file. Please copy and paste your resume text manually.');
      }
    } catch (err) {
      console.error(err);
      alert('Error communicating with backend resume parser.');
    } finally {
      setIsParsingResume(false);
    }
  };

  const getParams = () => ({
    target_position: targetPosition,
    language,
    answer_depth: answerDepth,
    answer_format: answerFormat,
    candidate_resume: candidateResume,
    job_description: jobDescription
  });

  const handleLaunchHUD = () => {
    onStartHUD?.(getParams());
  };

  const handleLaunchSolver = () => {
    onStartSolver?.(getParams());
  };

  const positions = [
    { value: 'Software Engineer', label: 'Software Engineer', icon: '💻' },
    { value: 'Data Scientist / ML Engineer', label: 'Data Scientist / ML Engineer', icon: '📊' },
    { value: 'Frontend Developer (React)', label: 'Frontend Developer (React)', icon: '⚛️' },
    { value: 'Backend Developer (Python/Node)', label: 'Backend Developer (Python/Node)', icon: '⚙️' },
    { value: 'Full Stack Engineer', label: 'Full Stack Engineer', icon: '🚀' },
    { value: 'System Design Architect', label: 'System Design Architect', icon: '🏛️' },
    { value: 'Quantitative & Aptitude Specialist', label: 'Aptitude / Problem Solver', icon: '🎯' },
  ];

  const languages = [
    { value: 'us English (US)', label: 'English (US)', icon: '🇺🇸' },
    { value: 'uk English (UK)', label: 'English (UK)', icon: '🇬🇧' },
    { value: 'in English (India)', label: 'English (India)', icon: '🇮🇳' },
  ];

  const depths = [
    { value: 'concise', label: 'Ultra Concise (10-20s)', icon: '⚡' },
    { value: 'short', label: 'Short & Punchy (STAR)', icon: '🎯' },
    { value: 'detailed', label: 'Detailed & Exhaustive', icon: '📖' },
  ];

  const formats = [
    { value: 'with_details', label: 'Core Concept -> Architecture', icon: '🧱' },
    { value: 'keywords', label: 'Keywords & Talking Points', icon: '🔑' },
    { value: 'full_sentences', label: 'Natural Spoken Sentences', icon: '💬' },
    { value: 'code_mode', label: 'Live Code + Big-O Complexity', icon: '💻' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between p-4 sm:p-6 select-none font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            L
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900 tracking-tight">Lumina AI</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Live Interview Assistant & Multi-Discipline Problem Solver</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-600 bg-white border border-gray-200 hover:border-indigo-200 px-3 py-1.5 rounded-xl shadow-2xs transition cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="font-medium">Settings & API Keys</span>
        </button>
      </header>

      {/* Main Mode Selection Screen */}
      <main className="max-w-4xl mx-auto w-full my-auto py-6 space-y-6">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            What do you need right now?
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
            Choose your dedicated workspace. Only the selected tool will open on your screen.
          </p>
        </div>

        {/* ── TWO DEDICATED MODE CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          {/* Option 1: Lumina HUD */}
          <div className="bg-white border-2 border-indigo-200 hover:border-indigo-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 group-hover:scale-105 transition-transform">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>Lumina HUD</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                    Voice Copilot
                  </span>
                </h2>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Real-time interview audio copilot. Listens to interviewer questions and generates instant spoken answers grounded in your resume.
                </p>
              </div>

              <ul className="text-xs text-gray-600 space-y-1.5 pt-1">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Manual <b>Listen Toggle</b> (no video feedback)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Personalized <b>STAR-format answers</b></span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Draggable floating box + Panic Hide</span>
                </li>
              </ul>
            </div>

            <div className="pt-5">
              <button
                type="button"
                onClick={handleLaunchHUD}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                <span>Launch Lumina HUD</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Option 2: Question Solver */}
          <div className="bg-white border-2 border-violet-200 hover:border-violet-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 group-hover:scale-105 transition-transform">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>Question Solver</span>
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">
                    Problem Solver
                  </span>
                </h2>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Solve coding challenges, aptitude formulas, logical reasoning, MCQs, and screenshot problems instantly with high precision.
                </p>
              </div>

              <ul className="text-xs text-gray-600 space-y-1.5 pt-1">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span><b>1 Unified Paste Area</b> (Text or Screenshot Ctrl+V)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span><b>Clean Math</b> (Zero raw dollar signs / LaTeX)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Coding, Aptitude, Reasoning, MCQ modes</span>
                </li>
              </ul>
            </div>

            <div className="pt-5">
              <button
                type="button"
                onClick={handleLaunchSolver}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs cursor-pointer"
              >
                <span>Launch Question Solver</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Quick Configuration Accordion ── */}
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomDropdown
                label="Target Role / Domain"
                value={targetPosition}
                onChange={setTargetPosition}
                options={positions}
              />
              <CustomDropdown
                label="Language"
                value={language}
                onChange={setLanguage}
                options={languages}
              />
            </div>

            {/* Resume & Job Grounding Accordion */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
              <button
                type="button"
                onClick={() => setShowGrounding(!showGrounding)}
                className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold text-gray-700 hover:bg-gray-100/60 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Resume & Experience Grounding</span>
                  {(candidateResume || jobDescription) && (
                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold">
                      Active ({candidateResume.length} chars)
                    </span>
                  )}
                </div>
                {showGrounding ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </button>

              {showGrounding && (
                <div className="p-3.5 border-t border-gray-200 bg-white space-y-3 animate-in fade-in duration-100">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-gray-600">Your Resume / Background</label>
                      <button
                        type="button"
                        disabled={isParsingResume}
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <Upload className={`w-3 h-3 ${isParsingResume ? 'animate-spin' : ''}`} />
                        <span>{isParsingResume ? 'Extracting text from PDF...' : 'Upload PDF / Docx / TXT'}</span>
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.doc,.txt,.md"
                        className="hidden"
                      />
                    </div>
                    <textarea
                      rows={3}
                      value={candidateResume}
                      onChange={(e) => setCandidateResume(e.target.value)}
                      placeholder="Paste your past roles, achievements, projects (used to personalize STAR answers)..."
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">Target Job Description (Optional)</label>
                    <textarea
                      rows={2}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste job requirements or required tech stack..."
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="text-center py-2 text-[11px] text-gray-400">
        <span>Lumina AI • Real-Time Voice Assistant & Problem Solver</span>
      </footer>
    </div>
  );
};
