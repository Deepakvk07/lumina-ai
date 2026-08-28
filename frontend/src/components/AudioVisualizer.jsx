import React from 'react';
import { Volume2, Mic } from 'lucide-react';

export const AudioVisualizer = ({ loopbackLevel = 0, micLevel = 0, isAudioActive = true }) => {
  // Wave shape multipliers for 8-bar audio frequency equalizer
  const waveMultipliers = [0.35, 0.7, 1.25, 1.6, 1.45, 1.0, 0.65, 0.4];

  // Convert raw RMS audio energy (0.001 - 0.080) into dynamic, animated 0-100% bar heights
  const generateBars = (level, count = 8, isMic = false) => {
    // Highly sensitive noise floor: levels above 0.002 trigger active equalizer movement
    const isSpeaking = level > 0.002;
    
    // Dynamic non-linear power curve for realistic volume responsiveness
    const sensitivity = 35;
    const power = isSpeaking
      ? Math.min(1.0, Math.pow(Math.max(0, level - 0.0008) * sensitivity, 0.6))
      : 0;

    return Array.from({ length: count }).map((_, i) => {
      const multiplier = waveMultipliers[i % waveMultipliers.length];
      
      const targetHeight = isSpeaking
        ? Math.max(18, Math.min(100, Math.round(power * multiplier * 88 + 12)))
        : 14;

      const opacity = isSpeaking
        ? Math.min(1.0, Math.max(0.55, 0.45 + power * 0.55))
        : 0.22;

      return {
        height: `${targetHeight}%`,
        opacity: opacity
      };
    });
  };

  const interviewerBars = generateBars(loopbackLevel, 8, false);
  const micBars = generateBars(micLevel, 8, true);

  const isInterviewerSpeaking = loopbackLevel > 0.003;
  const isMicSpeaking = micLevel > 0.003;

  return (
    <div className="flex items-center gap-3.5 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700/80 text-xs">
      {/* Interviewer Audio Meter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Volume2 className={`w-3.5 h-3.5 transition-colors ${isInterviewerSpeaking ? 'text-violet-400' : 'text-gray-500'}`} />
          <span className={`text-[11px] font-medium transition-colors ${isInterviewerSpeaking ? 'text-violet-300 font-semibold' : 'text-gray-500'}`}>
            Interviewer
          </span>
        </div>
        <div className="flex items-end gap-[2px] h-4 w-16 px-1 py-[2px] bg-gray-900 rounded overflow-hidden">
          {interviewerBars.map((bar, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-violet-600 to-violet-400 rounded-t-xs transition-all duration-75 ease-out"
              style={{ height: bar.height, opacity: bar.opacity }}
            />
          ))}
        </div>
        {isInterviewerSpeaking && (
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-ping" />
        )}
      </div>

      <div className="w-[1px] h-4 bg-gray-700" />

      {/* Candidate Mic Meter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Mic className={`w-3.5 h-3.5 transition-colors ${isMicSpeaking ? 'text-emerald-400' : 'text-gray-500'}`} />
          <span className={`text-[11px] font-medium transition-colors ${isMicSpeaking ? 'text-emerald-300 font-semibold' : 'text-gray-500'}`}>
            You (Mic)
          </span>
        </div>
        <div className="flex items-end gap-[2px] h-4 w-16 px-1 py-[2px] bg-gray-900 rounded overflow-hidden">
          {micBars.map((bar, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t-xs transition-all duration-75 ease-out"
              style={{ height: bar.height, opacity: bar.opacity }}
            />
          ))}
        </div>
        {isMicSpeaking && (
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        )}
      </div>
    </div>
  );
};
