"""
Configuration Manager
Handles application settings, LLM/STT credentials, interview preferences, and candidate resume store.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv

CONFIG_FILE = Path(__file__).parent / "settings.json"
load_dotenv()

DEFAULT_CONFIG: Dict[str, Any] = {
    "target_position": "Software Engineer",
    "language": "en-US",
    "answer_depth": "short",       # "short", "detailed", "comprehensive"
    "answer_format": "with_details", # "keywords", "with_details", "full_sentences", "code_mode"
    "candidate_resume": "",
    "job_description": "",
    "candidate_skills": "Python, JavaScript, React, Node.js, Distributed Systems, SQL, AWS, Algorithms, System Design",
    "llm_provider": "groq",        # "groq", "gemini", "openai", "claude"
    "llm_model": "openai/gpt-oss-120b",
    "groq_vision_model": "qwen/qwen3.8-27b",  # used when an image is attached and llm_model is text-only
    "stt_provider": "groq",        # "groq", "openai", "browser"
    "stt_model": "whisper-large-v3-turbo",
    "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
    "groq_api_key": os.getenv("GROQ_API_KEY", ""),
    "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
    "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
    "hud_opacity": 0.90,
    "hud_font_size": 15,
    "stealth_enabled": True,
    "eye_contact_mode": False,
    "speculative_enabled": True,
    "live_code_mode": True,
    "click_through": False,
    "vad_silence_threshold_ms": 350,
    "vad_energy_threshold": 0.0035,
    "hotkeys": {
        "panic_hide": "Ctrl+Shift+H",
        "snip_screen": "Ctrl+Shift+S",
        "push_transcribe": "Ctrl+Space",
        "toggle_clickthrough": "Ctrl+Shift+T"
    }
}

class ConfigManager:
    def __init__(self):
        self._config = DEFAULT_CONFIG.copy()
        self.load()

    def load(self) -> Dict[str, Any]:
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    self._config.update(saved)
            except Exception as e:
                print(f"[Config] Error loading settings.json: {e}")
        
        # Override with environment variables if present and not in settings
        for key in ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]:
            env_val = os.getenv(key)
            config_key = key.lower()
            if env_val and not self._config.get(config_key):
                self._config[config_key] = env_val
                
        return self._config

    def save(self, new_config: Dict[str, Any]) -> Dict[str, Any]:
        self._config.update(new_config)
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(self._config, f, indent=2)
        except Exception as e:
            print(f"[Config] Error saving settings.json: {e}")
        return self._config

    def get(self, key: str, default: Any = None) -> Any:
        return self._config.get(key, default)

    def get_all(self) -> Dict[str, Any]:
        return self._config.copy()

config_manager = ConfigManager()
