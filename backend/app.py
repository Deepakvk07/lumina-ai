"""
FastAPI & WebSocket Server
Middle-Layer Core orchestrating Audio Capture, STT, LLM streaming, Vision problem solving,
Speculative Answering, Session History & AI Debriefing, and Stealth Controls.
"""

import os
import json
import time
import asyncio
import logging
from typing import Set, Dict, Any, Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.config import config_manager
from backend.audio_capture import AudioCaptureEngine
from backend.stt_engine import stt_engine
from backend.llm_engine import llm_engine
from backend.vision_ocr import vision_engine
from backend.stealth_win32 import set_window_stealth, set_window_clickthrough, find_window_by_title_substring

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("MiddleLayer")

# Connected WebSocket clients
active_connections: Set[WebSocket] = set()
loop: Optional[asyncio.AbstractEventLoop] = None
audio_engine: Optional[AudioCaptureEngine] = None

# Strong references to fire-and-forget tasks so they aren't garbage-collected mid-execution
background_tasks: Set[asyncio.Task] = set()

# Session history store
session_history: List[Dict[str, Any]] = []

# Speculative answering state
speculative_state = {
    "question": "",
    "tokens": [],
    "is_streaming": False,
    "task": None
}

QUESTION_STARTERS = ("what", "how", "why", "can", "could", "explain", "describe", "is", "are", "write", "implement", "design", "tell", "difference", "compare")

# Automatic loopback listening — enabled only when in Voice HUD
loopback_listening: bool = False

def safe_create_task(coro):
    """Creates an asyncio task and keeps a strong reference to prevent GC."""
    task = asyncio.create_task(coro)
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    return task

async def broadcast_ws(message: Dict[str, Any]):
    """Broadcasts a JSON message to all connected frontend clients."""
    if not active_connections:
        return
    dead = set()
    for ws in list(active_connections):
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.add(ws)
    for ws in dead:
        active_connections.discard(ws)

def handle_audio_level(loopback_rms: float, mic_rms: float):
    """Callback from audio capture thread for volume metering."""
    if loop and active_connections:
        asyncio.run_coroutine_threadsafe(
            broadcast_ws({
                "type": "audio_level",
                "loopback": round(loopback_rms, 3),
                "mic": round(mic_rms, 3)
            }),
            loop
        )

def handle_interim_segment(wav_bytes: bytes, source: str):
    """Callback for real-time partial speech while the speaker is talking."""
    if loop and active_connections:
        asyncio.run_coroutine_threadsafe(process_interim_segment_async(wav_bytes, source), loop)

async def run_speculative_stream(partial_q: str):
    """Pre-generates answer tokens in background before sentence completion."""
    speculative_state["question"] = partial_q
    speculative_state["tokens"] = []
    speculative_state["is_streaming"] = True
    try:
        async for chunk in llm_engine.stream_answer(partial_q):
            if not speculative_state["is_streaming"]:
                break
            speculative_state["tokens"].append(chunk)
    except Exception as e:
        logger.debug(f"Speculative stream ended: {e}")
    finally:
        speculative_state["is_streaming"] = False

async def process_interim_segment_async(wav_bytes: bytes, source: str):
    if not loopback_listening:
        return
    text = await asyncio.to_thread(stt_engine.transcribe, wav_bytes)
    if not text or len(text.strip()) < 2:
        return

    await broadcast_ws({
        "type": "transcription_interim",
        "source": source,
        "text": text
    })

def handle_speech_segment(wav_bytes: bytes, source: str):
    """Callback when speech is finished and ready for transcription."""
    if not loopback_listening:
        return
    logger.info(f"[Audio] Speech segment captured from {source} ({len(wav_bytes)} bytes)")
    if loop:
        asyncio.run_coroutine_threadsafe(process_speech_segment_async(wav_bytes, source), loop)

async def process_speech_segment_async(wav_bytes: bytes, source: str):
    """Transcribes speech and automatically streams an answer if from interviewer."""
    text = await asyncio.to_thread(stt_engine.transcribe, wav_bytes)
    if not text or len(text.strip()) < 2:
        return

    logger.info(f"[STT Result] ({source}): {text}")
    await broadcast_ws({
        "type": "transcription",
        "source": source,
        "text": text
    })

    # If interviewer asked something, automatically trigger answer generation!
    if source == "interviewer" and len(text.split()) >= 2:
        safe_create_task(generate_and_stream_answer(text))

async def generate_and_stream_answer(question: str, image_bytes: Optional[bytes] = None):
    """Generates an answer using the configured LLM and streams token chunks to the HUD."""
    await broadcast_ws({
        "type": "answer_start",
        "question": question
    })

    full_answer = []

    # Reset any leftover speculative state
    speculative_state["is_streaming"] = False
    speculative_state["tokens"] = []

    try:
        async for chunk in llm_engine.stream_answer(question, image_bytes=image_bytes):
            full_answer.append(chunk)
            await broadcast_ws({
                "type": "answer_chunk",
                "delta": chunk
            })
    except Exception as e:
        logger.error(f"Error streaming answer: {e}")
        await broadcast_ws({
            "type": "answer_chunk",
            "delta": f"\n\n[Error: {str(e)}]"
        })

    completed_text = "".join(full_answer)
    
    # Save to session history
    session_history.append({
        "id": len(session_history) + 1,
        "timestamp": time.time(),
        "time_str": time.strftime("%H:%M:%S"),
        "question": question,
        "answer": completed_text
    })

    await broadcast_ws({
        "type": "answer_done",
        "question": question,
        "full_text": completed_text,
        "history_count": len(session_history)
    })

@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop, audio_engine
    loop = asyncio.get_running_loop()
    
    # Process cloaking in Windows
    try:
        import ctypes
        ctypes.windll.kernel32.SetConsoleTitleW("AudioSrvHost.exe")
    except Exception:
        pass

    audio_engine = AudioCaptureEngine(
        on_speech_segment=handle_speech_segment,
        on_audio_level=handle_audio_level,
        on_interim_segment=handle_interim_segment
    )
    audio_engine.start()
    logger.info("[Server] Audio capture engine started with speculative answering & debriefing.")
    yield
    if audio_engine:
        audio_engine.stop()
    logger.info("[Server] Shutdown completed.")

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

class ChromePrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            response = Response(status_code=200)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Private-Network"] = "true"
            response.headers["Access-Control-Max-Age"] = "86400"
            return response

        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error(f"[Middleware Error] {exc}")
            response = JSONResponse(status_code=500, content={"error": str(exc)})
        
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

app = FastAPI(title="Windows Audio Core Service", lifespan=lifespan)

app.add_middleware(ChromePrivateNetworkMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConfigUpdateRequest(BaseModel):
    target_position: Optional[str] = None
    language: Optional[str] = None
    answer_depth: Optional[str] = None
    answer_format: Optional[str] = None
    candidate_resume: Optional[str] = None
    job_description: Optional[str] = None
    candidate_skills: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    stt_provider: Optional[str] = None
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    hud_opacity: Optional[float] = None
    hud_font_size: Optional[int] = None
    eye_contact_mode: Optional[bool] = None
    speculative_enabled: Optional[bool] = None
    live_code_mode: Optional[bool] = None

@app.get("/api/config")
async def get_config():
    return config_manager.get_all()

@app.post("/api/config")
async def update_config(req: ConfigUpdateRequest):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    saved = config_manager.save(updates)
    await broadcast_ws({"type": "config_updated", "config": saved})
    return saved

@app.post("/api/resume/parse")
async def parse_resume_upload(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or "resume.txt"
    ext = os.path.splitext(filename)[1].lower()

    extracted_text = ""
    try:
        if ext == ".pdf":
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            extracted_text = "\n".join([p.extract_text() or "" for p in reader.pages if p.extract_text()])
        elif ext in [".docx", ".doc"]:
            import docx
            import io
            doc = docx.Document(io.BytesIO(content))
            extracted_text = "\n".join([p.text for p in doc.paragraphs if p.text])
        else:
            extracted_text = content.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.error(f"Error parsing resume {filename}: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse resume: {str(e)}")

    extracted_text = extracted_text.strip()
    return {"text": extracted_text, "filename": filename, "length": len(extracted_text)}

@app.get("/api/devices")
async def get_devices():
    return AudioCaptureEngine.get_audio_devices()

@app.get("/api/listen/state")
async def get_listen_state():
    return {"listening": loopback_listening}

@app.post("/api/listen/start")
async def start_listen():
    global loopback_listening
    loopback_listening = True
    logger.info("[Listen] Audio listening STARTED")
    await broadcast_ws({"type": "listen_state", "listening": True})
    return {"listening": True}

@app.post("/api/listen/stop")
async def stop_listen():
    global loopback_listening
    loopback_listening = False
    logger.info("[Listen] Audio listening STOPPED")
    await broadcast_ws({"type": "listen_state", "listening": False})
    return {"listening": False}

@app.post("/api/listen/toggle")
async def toggle_listen():
    global loopback_listening
    loopback_listening = not loopback_listening
    logger.info(f"[Listen] Loopback listening {'ENABLED' if loopback_listening else 'DISABLED'}")
    await broadcast_ws({"type": "listen_state", "listening": loopback_listening})
    return {"listening": loopback_listening}

@app.get("/api/history")
async def get_history():
    return {"history": session_history, "total": len(session_history)}

@app.post("/api/history/clear")
async def clear_history():
    global session_history
    session_history = []
    await broadcast_ws({"type": "history_cleared"})
    return {"status": "cleared", "total": 0}

@app.post("/api/history/debrief")
async def get_debrief():
    if not session_history:
        return {"debrief_markdown": "### No interview questions recorded yet.\nStart asking questions or speak to generate a post-interview assessment report."}
    report = await llm_engine.generate_debrief(session_history)
    return {"debrief_markdown": report, "question_count": len(session_history)}

@app.post("/api/snip-clipboard")
async def get_clipboard_snip():
    """Grabs the image currently in the Windows clipboard and returns base64."""
    img_bytes = vision_engine.grab_clipboard_image()
    if not img_bytes:
        raise HTTPException(status_code=400, detail="No screenshot found in clipboard. Press Win+Shift+S first.")
    import base64 as _b64
    b64_str = _b64.b64encode(img_bytes).decode("utf-8")
    return {"image_base64": b64_str, "status": "ok"}

@app.post("/api/scan-screen")
async def scan_full_screen():
    """Natively captures the full desktop / browser screen in high resolution."""
    img_bytes = vision_engine.capture_full_screen_native()
    if not img_bytes:
        raise HTTPException(status_code=500, detail="Failed to capture screen.")
    import base64 as _b64
    b64_str = _b64.b64encode(img_bytes).decode("utf-8")
    return {"image_base64": b64_str, "status": "ok"}

class ScreenSolveRequest(BaseModel):
    image_base64: Optional[str] = None
    prompt: Optional[str] = "Analyze this screen snip, solve the coding problem/diagram, and provide the optimal implementation."

@app.post("/api/screen/solve")
async def solve_screen_snip(req: ScreenSolveRequest):
    img_bytes = None
    if req.image_base64:
        img_bytes = vision_engine.base64_to_bytes(req.image_base64)
    else:
        img_bytes = vision_engine.capture_full_screen_native()

    if not img_bytes:
        raise HTTPException(status_code=400, detail="No screen image captured or provided.")

    safe_create_task(generate_and_stream_answer(req.prompt, image_bytes=img_bytes))
    return {"status": "processing", "message": "Vision solver streaming answer to HUD."}

class SolveRequest(BaseModel):
    question: str
    image_base64: Optional[str] = None
    category: Optional[str] = "auto"
    answer_style: Optional[str] = "option_only"

@app.post("/api/solve")
async def solve_question(req: SolveRequest):
    """
    Dedicated high-accuracy solver endpoint for Question Solver.
    Streams tokens as SSE (data: <token>\\n\\n) with zero dollar signs and direct option answers.
    Supports text questions and optional base64 image (for screenshot mode).
    """
    from fastapi.responses import StreamingResponse

    img_bytes = None
    if req.image_base64:
        # Strip data-URL prefix if present (data:image/png;base64,...)
        b64_data = req.image_base64
        if "," in b64_data:
            b64_data = b64_data.split(",", 1)[1]
        import base64 as _b64
        try:
            img_bytes = _b64.b64decode(b64_data)
        except Exception:
            img_bytes = None

    async def stream_tokens():
        try:
            async for chunk in llm_engine.stream_solver(
                req.question, 
                image_bytes=img_bytes, 
                category=req.category or "auto",
                answer_style=req.answer_style or "option_only"
            ):
                # Escape newlines so each SSE event is on one line
                safe = chunk.replace("\n", "⏎")
                yield f"data: {safe}\n\n"
        except Exception as e:
            yield f"data: [Error: {str(e)}]\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_tokens(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )

class StealthRequest(BaseModel):
    hwnd: Optional[int] = None
    title: Optional[str] = "AudioSrvHost"
    enable: bool = True

@app.post("/api/stealth")
async def api_apply_stealth(req: StealthRequest):
    hwnd = req.hwnd
    if not hwnd:
        hwnd = find_window_by_title_substring(req.title or "AudioSrvHost")
    if hwnd:
        success = set_window_stealth(hwnd, req.enable)
        return {"status": "ok", "stealth": req.enable, "hwnd": hwnd, "success": success}
    return {"status": "error", "message": "Window HWND not found"}

@app.post("/api/clickthrough")
async def api_apply_clickthrough(req: StealthRequest):
    hwnd = req.hwnd
    if not hwnd:
        hwnd = find_window_by_title_substring(req.title or "AudioSrvHost")
    if hwnd:
        success = set_window_clickthrough(hwnd, req.enable)
        return {"status": "ok", "clickthrough": req.enable, "hwnd": hwnd, "success": success}
    return {"status": "error", "message": "Window HWND not found"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"[WS] Client connected. Total active: {len(active_connections)}")

    # Send initial state
    await websocket.send_text(json.dumps({
        "type": "init",
        "config": config_manager.get_all(),
        "audio_running": audio_engine.is_running if audio_engine else False,
        "history_count": len(session_history)
    }))

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
                msg_type = msg.get("type")

                if msg_type == "ask":
                    q = msg.get("question", "")
                    img_b64 = msg.get("image_base64")
                    img_bytes = vision_engine.base64_to_bytes(img_b64) if img_b64 else None
                    if q or img_bytes:
                        safe_create_task(generate_and_stream_answer(q or "Solve this coding problem", img_bytes))

                elif msg_type == "capture_full_screen":
                    raw = vision_engine.capture_full_screen_native()
                    if raw:
                        data_url = vision_engine.bytes_to_data_url(raw)
                        await websocket.send_text(json.dumps({
                            "type": "screen_captured",
                            "image_url": data_url
                        }))

                elif msg_type == "toggle_audio":
                    if audio_engine:
                        if audio_engine.is_running:
                            audio_engine.stop()
                        else:
                            audio_engine.start()
                        await broadcast_ws({"type": "audio_state", "running": audio_engine.is_running})

                elif msg_type == "apply_stealth":
                    hwnd = msg.get("hwnd")
                    title = msg.get("title", "AudioSrvHost")
                    if not hwnd:
                        hwnd = find_window_by_title_substring(title)
                    if hwnd:
                        set_window_stealth(hwnd, msg.get("enable", True))

                elif msg_type == "apply_clickthrough":
                    hwnd = msg.get("hwnd")
                    title = msg.get("title", "AudioSrvHost")
                    if not hwnd:
                        hwnd = find_window_by_title_substring(title)
                    if hwnd:
                        set_window_clickthrough(hwnd, msg.get("enable", True))

            except Exception as e:
                logger.error(f"[WS Message Error] {e}")

    except WebSocketDisconnect:
        active_connections.discard(websocket)
        logger.info(f"[WS] Client disconnected. Remaining: {len(active_connections)}")

def run_server():
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")

if __name__ == "__main__":
    run_server()
