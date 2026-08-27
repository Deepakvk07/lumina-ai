"""
Speech-to-Text (STT) Engine
Transcribes audio wav bytes into text with ultra-low latency using:
- Groq Whisper (whisper-large-v3-turbo - ~200ms latency)
- Google Gemini 2.0 Flash (Multimodal Audio STT)
- OpenAI Whisper (whisper-1)
- Fallback mock transcribe for offline demo/testing
"""

import io
import os
import logging
from typing import Optional
from backend.config import config_manager

logger = logging.getLogger(__name__)

class STTEngine:
    def __init__(self):
        pass

    def transcribe(self, wav_bytes: bytes, language: str = "en") -> str:
        """
        Transcribes a WAV byte buffer into text using the configured provider.
        """
        if not wav_bytes or len(wav_bytes) < 1000:
            return ""

        cfg = config_manager.get_all()
        provider = cfg.get("stt_provider", "groq").lower()
        groq_key = cfg.get("groq_api_key") or os.getenv("GROQ_API_KEY", "")
        openai_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY", "")
        gemini_key = cfg.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")

        # 1. Try Groq Whisper (Fastest ~200ms)
        if groq_key and (provider == "groq" or not openai_key):
            try:
                from groq import Groq
                client = Groq(api_key=groq_key)
                audio_file = io.BytesIO(wav_bytes)
                audio_file.name = "audio.wav"
                transcription = client.audio.transcriptions.create(
                    file=("audio.wav", audio_file.read()),
                    model="whisper-large-v3-turbo",
                    language=language[:2] if language else "en",
                    response_format="text",
                    temperature=0.0
                )
                if hasattr(transcription, "text"):
                    text = str(transcription.text).strip()
                else:
                    text = str(transcription).strip()
                if text:
                    logger.info(f"[STT Groq] Transcribed: {text}")
                    return text
            except Exception as e:
                logger.error(f"[STT Groq] Error: {e}")

        # 2. Try Gemini 2.0 Flash (Native Multimodal Audio Transcription)
        if gemini_key:
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=gemini_key)
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=[
                        types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
                        "Transcribe the spoken words in this audio exactly. Output ONLY the verbatim transcript, no formatting, no extra commentary."
                    ]
                )
                text = (response.text or "").strip()
                if text:
                    logger.info(f"[STT Gemini] Transcribed: {text}")
                    return text
            except Exception as e:
                logger.error(f"[STT Gemini] Error: {e}")

        # 3. Try OpenAI Whisper
        if openai_key:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=openai_key)
                audio_file = io.BytesIO(wav_bytes)
                audio_file.name = "audio.wav"
                transcription = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-1",
                    language=language[:2] if language else "en",
                    temperature=0.0
                )
                text = transcription.text.strip()
                if text:
                    logger.info(f"[STT OpenAI] Transcribed: {text}")
                    return text
            except Exception as e:
                logger.error(f"[STT OpenAI] Error: {e}")

        logger.warning("[STT] No active API key found for Groq, Gemini, or OpenAI.")
        return ""

stt_engine = STTEngine()
