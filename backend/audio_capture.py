"""
Audio Capture Engine
Dual-channel real-time audio capture:
1. WASAPI Loopback Capture: Captures speaker output (Interviewer's voice in Zoom/Teams/Meet/Browser)
2. Microphone Capture: Captures candidate's microphone
Features real-time interim speech dispatch for simultaneous listen-and-write and ultra-fast sentence cutoff (<350ms).
"""

import io
import wave
import time
import math
import struct
import threading
import logging
from typing import Optional, Callable, Dict, Any, List
import numpy as np

try:
    import pyaudiowpatch as pyaudio
    HAS_PYAUDIO_WPATCH = True
except Exception:
    try:
        import pyaudio
        HAS_PYAUDIO_WPATCH = False
    except Exception:
        pyaudio = None
        HAS_PYAUDIO_WPATCH = False

logger = logging.getLogger(__name__)

TARGET_SAMPLE_RATE = 16000
TARGET_CHANNELS = 1
BYTES_PER_SAMPLE = 2  # 16-bit PCM
LEVEL_IDLE_FLOOR = 0.002  # RMS floor for HUD meters

class AudioCaptureEngine:
    def __init__(self, on_speech_segment: Optional[Callable[[bytes, str], None]] = None,
                 on_audio_level: Optional[Callable[[float, float], None]] = None,
                 on_interim_segment: Optional[Callable[[bytes, str], None]] = None):
        self.on_speech_segment = on_speech_segment
        self.on_audio_level = on_audio_level
        self.on_interim_segment = on_interim_segment
        self.is_running = False
        
        self._master_thread: Optional[threading.Thread] = None

        # Real-time RMS levels
        self._loop_rms = 0.0
        self._mic_rms = 0.0
        
        # Fast VAD Settings (Instant speech-to-text response)
        # WASAPI loopback noise floor ~0.0001 (with 10x gain). Threshold at 3.5x floor = 0.00035
        # Real speech/audio from speakers shows 10-100x higher RMS than background noise
        self.energy_threshold = 0.00035  # Calibrated for WASAPI loopback (3.5x above noise floor)
        self.silence_threshold_sec = 0.35  # Ultra-fast 350ms silence triggers sentence completion
        self.min_speech_duration_sec = 0.25
        self.interim_interval_sec = 0.45  # Dispatches partial audio every 450ms while speaking
        self.capture_mic = False  # Disabled: only capture interviewer (loopback), ignore candidate mic

    @staticmethod
    def get_audio_devices() -> Dict[str, Any]:
        devices = {"speakers": [], "microphones": [], "loopback": []}
        if not pyaudio:
            return devices
        try:
            p = pyaudio.PyAudio()
            for i in range(p.get_device_count()):
                info = p.get_device_info_by_index(i)
                name = info.get("name", "")
                is_loopback = info.get("isLoopbackDevice", False)
                max_in = info.get("maxInputChannels", 0)
                max_out = info.get("maxOutputChannels", 0)
                
                dev_item = {
                    "index": i, 
                    "name": name, 
                    "channels": max(max_in, max_out),
                    "sample_rate": int(info.get("defaultSampleRate", 48000))
                }
                if is_loopback or "[Loopback]" in name:
                    devices["loopback"].append(dev_item)
                elif max_in > 0:
                    devices["microphones"].append(dev_item)
                elif max_out > 0:
                    devices["speakers"].append(dev_item)
            p.terminate()
        except Exception as e:
            logger.error(f"Error enumerating audio devices: {e}")
        return devices

    def start(self):
        if self.is_running or not pyaudio:
            return
        self.is_running = True
        self._master_thread = threading.Thread(target=self._run, daemon=True, name="AudioCaptureMaster")
        self._master_thread.start()
        logger.info("[AudioCaptureEngine] Audio capture master started with real-time interim streaming.")

    def stop(self):
        self.is_running = False
        if self._master_thread:
            self._master_thread.join(timeout=1.5)
        logger.info("[AudioCaptureEngine] Audio capture master stopped.")

    def _calc_rms(self, audio_data: bytes) -> float:
        if not audio_data:
            return 0.0
        try:
            count = len(audio_data) // 2
            if count == 0:
                return 0.0
            format_str = f"<{count}h"
            shorts = struct.unpack(format_str, audio_data)
            sum_squares = sum(s * s for s in shorts)
            rms = math.sqrt(sum_squares / count) / 32768.0
            return min(1.0, rms)
        except Exception:
            return 0.0

    def _pcm_to_wav(self, pcm_frames: List[bytes], sample_rate: int = TARGET_SAMPLE_RATE) -> bytes:
        wav_buf = io.BytesIO()
        with wave.open(wav_buf, "wb") as wf:
            wf.setnchannels(TARGET_CHANNELS)
            wf.setsampwidth(BYTES_PER_SAMPLE)
            wf.setframerate(sample_rate)
            wf.writeframes(b"".join(pcm_frames))
        return wav_buf.getvalue()

    def _downmix_and_resample(self, raw_bytes: bytes, src_rate: int, channels: int, target_rate: int = 16000) -> bytes:
        try:
            audio_array = np.frombuffer(raw_bytes, dtype=np.int16).copy()
            if channels > 1:
                audio_array = audio_array.reshape(-1, channels).mean(axis=1).astype(np.int16)

            if src_rate != target_rate and len(audio_array) > 0:
                target_length = int(len(audio_array) * target_rate / src_rate)
                indices = np.linspace(0, len(audio_array) - 1, target_length)
                audio_array = np.interp(indices, np.arange(len(audio_array)), audio_array).astype(np.int16)

            return audio_array.tobytes()
        except Exception:
            return raw_bytes

    def _run(self):
        """Initializes PyAudio and coordinates independent concurrent capture threads."""
        try:
            pa = pyaudio.PyAudio()
        except Exception as e:
            logger.error(f"[AudioCaptureEngine] PyAudio init failed: {e}")
            return

        stream_loop = None
        stream_mic = None

        try:
            # 1. Discover Loopback Device
            loop_dev = None
            if HAS_PYAUDIO_WPATCH:
                try:
                    loop_dev = pa.get_default_wasapi_loopback()
                except Exception:
                    pass

                if not loop_dev:
                    try:
                        wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
                        spk = pa.get_device_info_by_index(wasapi_info["defaultOutputDevice"])
                        for dev in pa.get_loopback_device_info_generator():
                            if spk["name"] in dev["name"]:
                                loop_dev = dev
                                break
                    except Exception:
                        pass

                if not loop_dev:
                    try:
                        loop_dev = next(pa.get_loopback_device_info_generator(), None)
                    except Exception:
                        pass

            if loop_dev:
                try:
                    loop_rate = int(loop_dev.get("defaultSampleRate", 48000))
                    loop_ch = max(1, loop_dev.get("maxInputChannels", 2))
                    loop_chunk = int(loop_rate * 0.04)  # 40ms buffer
                    stream_loop = pa.open(
                        format=pyaudio.paInt16,
                        channels=loop_ch,
                        rate=loop_rate,
                        input=True,
                        input_device_index=loop_dev["index"],
                        frames_per_buffer=loop_chunk
                    )
                    logger.info(f"[AudioCaptureEngine] Loopback capturing on '{loop_dev['name']}' @ {loop_rate}Hz ({loop_ch}ch)")
                except Exception as e:
                    logger.warning(f"[AudioCaptureEngine] Failed to open loopback stream: {e}")

            # 2. Discover Microphone Device (only when capture_mic is enabled)
            mic_dev = None
            if self.capture_mic:
                if HAS_PYAUDIO_WPATCH:
                    try:
                        wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
                        mic_idx = wasapi_info.get("defaultInputDevice")
                        if mic_idx is not None and mic_idx >= 0:
                            mic_dev = pa.get_device_info_by_index(mic_idx)
                    except Exception:
                        pass

                if not mic_dev:
                    try:
                        mic_dev = pa.get_default_input_device_info()
                    except Exception:
                        pass

            if mic_dev:
                try:
                    mic_rate = int(mic_dev.get("defaultSampleRate", 48000))
                    mic_ch = max(1, mic_dev.get("maxInputChannels", 1))
                    mic_chunk = int(mic_rate * 0.04)  # 40ms buffer
                    stream_mic = pa.open(
                        format=pyaudio.paInt16,
                        channels=mic_ch,
                        rate=mic_rate,
                        input=True,
                        input_device_index=mic_dev["index"],
                        frames_per_buffer=mic_chunk
                    )
                    logger.info(f"[AudioCaptureEngine] Mic capturing on '{mic_dev['name']}' @ {mic_rate}Hz ({mic_ch}ch)")
                except Exception as e:
                    logger.warning(f"[AudioCaptureEngine] Failed to open mic stream: {e}")

            # Define workers
            def loopback_worker():
                if not stream_loop:
                    return
                speaking = False
                speech_start = 0.0
                last_speech = 0.0
                last_interim_emit = 0.0
                buf: List[bytes] = []
                while self.is_running:
                    try:
                        data = stream_loop.read(loop_chunk, exception_on_overflow=False)
                        if not data:
                            time.sleep(0.01)
                            continue
                        mono = self._downmix_and_resample(data, loop_rate, loop_ch, target_rate=TARGET_SAMPLE_RATE)
                        # WASAPI loopback audio is very low amplitude — amplify before VAD
                        mono_arr = np.frombuffer(mono, dtype=np.int16).astype(np.float32)
                        mono_arr = np.clip(mono_arr * 10.0, -32768, 32767).astype(np.int16)
                        mono = mono_arr.tobytes()
                        rms = self._calc_rms(mono)
                        self._loop_rms = rms
                        now = time.time()

                        if rms > self.energy_threshold:
                            if not speaking:
                                speaking = True
                                speech_start = now
                                last_interim_emit = now
                                buf = []
                            last_speech = now
                            buf.append(mono)

                            # Emit live interim transcription every 450ms while speaking
                            if self.on_interim_segment and (now - last_interim_emit) >= self.interim_interval_sec and len(buf) >= 4:
                                last_interim_emit = now
                                interim_wav = self._pcm_to_wav(buf, TARGET_SAMPLE_RATE)
                                self.on_interim_segment(interim_wav, "interviewer")

                        elif speaking:
                            buf.append(mono)
                            if (now - last_speech) > self.silence_threshold_sec:
                                duration = now - speech_start
                                if duration >= self.min_speech_duration_sec and len(buf) > 0:
                                    wav = self._pcm_to_wav(buf, TARGET_SAMPLE_RATE)
                                    if self.on_speech_segment:
                                        self.on_speech_segment(wav, "interviewer")
                                speaking = False
                                buf = []
                    except Exception:
                        time.sleep(0.01)

            def mic_worker():
                if not stream_mic:
                    return
                speaking = False
                speech_start = 0.0
                last_speech = 0.0
                last_interim_emit = 0.0
                buf: List[bytes] = []
                while self.is_running:
                    try:
                        data = stream_mic.read(mic_chunk, exception_on_overflow=False)
                        if not data:
                            time.sleep(0.01)
                            continue
                        mono = self._downmix_and_resample(data, mic_rate, mic_ch, target_rate=TARGET_SAMPLE_RATE)
                        rms = self._calc_rms(mono)
                        self._mic_rms = rms
                        now = time.time()

                        if rms > (self.energy_threshold * 1.2):
                            if not speaking:
                                speaking = True
                                speech_start = now
                                last_interim_emit = now
                                buf = []
                            last_speech = now
                            buf.append(mono)

                            # Emit live interim candidate speech
                            if self.on_interim_segment and (now - last_interim_emit) >= self.interim_interval_sec and len(buf) >= 4:
                                last_interim_emit = now
                                interim_wav = self._pcm_to_wav(buf, TARGET_SAMPLE_RATE)
                                self.on_interim_segment(interim_wav, "candidate")

                        elif speaking:
                            buf.append(mono)
                            if (now - last_speech) > self.silence_threshold_sec:
                                duration = now - speech_start
                                if duration >= self.min_speech_duration_sec and len(buf) > 0:
                                    wav = self._pcm_to_wav(buf, TARGET_SAMPLE_RATE)
                                    if self.on_speech_segment:
                                        self.on_speech_segment(wav, "candidate")
                                speaking = False
                                buf = []
                    except Exception:
                        time.sleep(0.01)

            def meter_worker():
                last_idle = False
                while self.is_running:
                    time.sleep(0.05)
                    l_rms = self._loop_rms
                    m_rms = self._mic_rms
                    is_idle = (l_rms <= LEVEL_IDLE_FLOOR and m_rms <= LEVEL_IDLE_FLOOR)
                    if not is_idle or not last_idle:
                        last_idle = is_idle
                        if self.on_audio_level:
                            self.on_audio_level(l_rms, m_rms)

            t_loop = threading.Thread(target=loopback_worker, daemon=True, name="LoopWorker")
            t_mic = threading.Thread(target=mic_worker, daemon=True, name="MicWorker")
            t_meter = threading.Thread(target=meter_worker, daemon=True, name="MeterWorker")

            t_loop.start()
            t_mic.start()
            t_meter.start()

            # Keep master thread alive until stop()
            while self.is_running:
                time.sleep(0.1)

            t_loop.join(timeout=0.5)
            t_mic.join(timeout=0.5)
            t_meter.join(timeout=0.5)

        except Exception as ex:
            logger.error(f"[AudioCaptureEngine] Master capture error: {ex}")
        finally:
            if stream_loop:
                try:
                    stream_loop.stop_stream()
                    stream_loop.close()
                except Exception:
                    pass
            if stream_mic:
                try:
                    stream_mic.stop_stream()
                    stream_mic.close()
                except Exception:
                    pass
            try:
                pa.terminate()
            except Exception:
                pass
            logger.info("[AudioCaptureEngine] Audio devices terminated.")
