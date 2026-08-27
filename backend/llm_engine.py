"""
LLM Answer Generation Engine
Supports Groq, Anthropic Claude, AgentRouter, Google Gemini, and OpenAI with real-time token streaming.
Tailored for ultra-low latency (<1s response) during live interviews.
"""

import os
import time
import json
import base64
import asyncio
import logging
from typing import AsyncGenerator, Dict, Any, Optional
import httpx
from backend.config import config_manager
import re

logger = logging.getLogger(__name__)

def clean_math_delimiters(text: str) -> str:
    """Strips LaTeX formatting and raw dollar signs so math renders cleanly in plain text."""
    if not text:
        return ""
    # Replace \text{...} with inner content
    cleaned = re.sub(r'\\text\{([^}]+)\}', r'\1', text)
    # Replace \frac{a}{b} with (a / b)
    cleaned = re.sub(r'\\frac\{([^}]+)\}\{([^}]+)\}', r'(\1 / \2)', cleaned)
    # Replace common LaTeX operators
    reps = {
        r'\\times': '×',
        r'\\div': '÷',
        r'\\cdot': '·',
        r'\\pm': '±',
        r'\\le': '≤',
        r'\\ge': '≥',
        r'\\neq': '≠',
        r'\\approx': '≈',
        r'\\infty': '∞',
        r'\\sqrt\{([^}]+)\}': r'√(\1)',
        r'\\rightarrow': '→',
        r'\\leftarrow': '←',
        r'\\Rightarrow': '⇒',
    }
    for pat, rep in reps.items():
        cleaned = re.sub(pat, rep, cleaned)
    # Remove $$ ... $$ display math markers
    cleaned = re.sub(r'\$\$(.+?)\$\$', r'\1', cleaned, flags=re.DOTALL)
    # Remove $ ... $ inline math markers (e.g. $15 - 3 = 12$ -> 15 - 3 = 12)
    cleaned = re.sub(r'\$([^$\n]+?)\$', r'\1', cleaned)
    # Clean lonely dollars attached to numbers or words like $15 -> 15 or $x -> x
    cleaned = re.sub(r'\$(?=[a-zA-Z0-9?])', '', cleaned)
    cleaned = re.sub(r'(?<=[a-zA-Z0-9?])\$', '', cleaned)
    return cleaned

def build_system_prompt(cfg: Dict[str, Any]) -> str:
    role = cfg.get("target_position", "Software Engineer")
    depth = cfg.get("answer_depth", "short")
    fmt = cfg.get("answer_format", "with_details")
    resume = cfg.get("candidate_resume", "").strip()[:4000]
    job_desc = cfg.get("job_description", "").strip()[:2000]
    skills = cfg.get("candidate_skills", "").strip()[:1000]
    language = cfg.get("language", "en-US")

    resume_section = f"- Experience & Work History:\n{resume}" if resume else "- Experienced software practitioner"
    skills_section = f"- Core Skills: {skills}" if skills else ""
    job_section = f"- Target Job Description:\n{job_desc}" if job_desc else ""

    prompt = f"""You are a live interview co-pilot assisting a candidate interviewing for **{role}**.
Provide immediate, direct, technically impressive answers.

### CANDIDATE BACKGROUND & RESUME:
{resume_section}
{skills_section}
{job_section}

### PERSONALIZATION RULES:
- Ground your answers in the candidate's real experience and tech stack whenever possible.
- For behavioral questions (e.g. 'Tell me about a time...', 'How did you handle...'): Answer using the STAR format (Situation, Task, Action, Result) drawing directly from the candidate's background above.

### FORMAT ({depth.upper()} / {fmt.upper()}):
Target Language: {language}
"""

    if fmt == "keywords":
        prompt += """- Output 3 to 5 concise bullet points with crucial technical terms, algorithms, and metrics for unscripted speaking."""
    elif fmt == "with_details":
        prompt += """- Output structured bullet points. For technical: Core Concept -> Architecture & Trade-offs -> Best Practice. For coding: Algorithm -> Complexity -> Code Snippet."""
    elif fmt == "full_sentences":
        prompt += """- Output a natural, confident spoken response ready to verbalize smoothly."""
    elif fmt == "code_mode":
        prompt += """- For coding questions: Output clean optimal code block + Complexity header (`⏱️ Time: O(...) | 💾 Space: O(...)`) + 2-3 key verbal talking points."""

    prompt += """
### STRICT FORMATTING & RULES:
1. Start directly with the answer. Zero conversational filler or pleasantries.
2. Keep answers concise, high-impact, and instantly readable.
3. Answer IMMEDIATELY. NEVER output <think> tags, internal thoughts, or meta-analysis.
4. DO NOT use LaTeX syntax or math delimiters (NO $, $$, \\text{}). Write equations in clean plain text.
5. When writing code, always specify the language (e.g. ```python) and include Time & Space complexity.
"""
    return prompt

def build_solver_system_prompt(category: str = "auto", answer_style: str = "option_only") -> str:
    return """You are an elite, competition-grade mathematical, quantitative aptitude, logical reasoning, and DSA problem-solving engine.
YOUR PRIME DIRECTIVE IS 100% MATHEMATICAL & LOGICAL ACCURACY (99%+ precision).

### MANDATORY REASONING PROTOCOL:
1. **INTERNAL REASONING SCRATCHPAD**:
   You MUST perform your complete calculations and logical deduction inside <thought>...</thought> tags:
   - If an image/screenshot is provided: carefully transcribe every single number, symbol, digit, variable, and option choice (A, B, C, D) exactly.
   - Identify the exact mathematical category, governing formula, and underlying rules (e.g. Number Series, Time & Work, Speed-Distance, Profit & Loss, Percentages, Permutations, Probability, Syllogisms).
   - Perform all arithmetic step-by-step and double-check your calculations.
   - Match your final calculated number to the exact option letter (A, B, C, or D).
   - Verify why all distractor options are incorrect.

2. **FINAL USER OUTPUT (AFTER </thought>)**:
   After the </thought> tag, output ONLY the verified final answer in clean plain text:
   - **For Single Question / MCQ**:
     **🎯 Option [A/B/C/D] — [Value/Text]**
   - **For Multiple Questions on Screen / Webpage**:
     - **Q1: Option [A/B/C/D] — [Value]**
     - **Q2: Option [A/B/C/D] — [Value]**
     - **Q3: Option [A/B/C/D] — [Value]**
   - **For Coding / DSA**:
     `⏱️ Time: O(...) | 💾 Space: O(...)`
     ```[language]
     // Complete optimal code
     ```

3. **STRICT RULES**:
   - NEVER use LaTeX syntax or math delimiters (NO $, $$, \\text{}, \\frac{}).
   - ZERO conversational filler outside </thought>.
   - Start immediately with **🎯 Option...** on line 1 after </thought>.
"""


# Groq models that accept image input. Both are preview-tier — Groq documents that
# preview models may be discontinued with little notice, so keep them overridable.
GROQ_VISION_MODELS = {"qwen/qwen3.8-27b", "qwen/qwen3.6-27b"}
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
GROQ_DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b"

# Model-id prefixes each provider actually serves. Used to detect a stale id left in
# `llm_model` after the user switches providers, which would otherwise 404 at the API.
_PROVIDER_MODEL_PREFIXES = {
    "groq": ("llama", "meta-llama/", "qwen", "openai/gpt-oss", "groq/", "moonshotai/",
             "deepseek", "minimaxai/", "mistral", "gemma", "whisper"),
    "openai": ("gpt-", "o1", "o3", "o4", "chatgpt"),
}


def _resolve_model(cfg_model: Optional[str], provider: str, default: str) -> str:
    """
    Returns the configured model when its id plausibly belongs to `provider`, else `default`.
    Prevents e.g. a leftover 'claude-3-5-sonnet' from being sent to Groq.
    """
    name = (cfg_model or "").strip()
    if not name:
        return default
    prefixes = _PROVIDER_MODEL_PREFIXES.get(provider, ())
    return name if name.lower().startswith(prefixes) else default


def sniff_image_mime(image_bytes: bytes) -> str:
    """
    Detects image mime type from magic bytes. Capture sources differ (the Win32 grab
    produces JPEG, a clipboard snip is usually PNG) and providers reject a declared
    type that doesn't match the payload.
    """
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    if image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def optimize_image_bytes(image_bytes: Optional[bytes], max_dim: int = 960) -> Optional[bytes]:
    if not image_bytes:
        return None
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_dim:
            scale = max_dim / max(w, h)
            new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()
    except Exception:
        return image_bytes

def build_multimodal_content(question: str, image_bytes: Optional[bytes]):
    """
    Builds an OpenAI-compatible user `content` value: a plain string when there is no
    image, or a content-part list carrying a base64 data URL when there is. Groq and
    OpenAI share this wire format.
    """
    if not image_bytes:
        return question
    opt_bytes = optimize_image_bytes(image_bytes, max_dim=960) or image_bytes
    b64 = base64.b64encode(opt_bytes).decode("utf-8")
    return [
        {"type": "text", "text": question},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
    ]

class LLMEngine:
    def __init__(self):
        pass

    async def stream_answer(self, question: str, image_bytes: Optional[bytes] = None) -> AsyncGenerator[str, None]:
        """
        Streams answer tokens in real-time from the active LLM provider.
        """
        cfg = config_manager.get_all()
        provider = cfg.get("llm_provider", "groq").lower()
        system_prompt = build_system_prompt(cfg)
        depth = cfg.get("answer_depth", "short")

        # Set max tokens — 250 was cutting answers mid-sentence; 600/1200 gives complete answers
        max_tokens = 600 if depth == "short" else 1200

        groq_key = cfg.get("groq_api_key") or os.getenv("GROQ_API_KEY", "")
        gemini_key = cfg.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
        anthropic_key = cfg.get("anthropic_api_key") or os.getenv("ANTHROPIC_API_KEY", "")
        anthropic_base_url = cfg.get("anthropic_base_url") or os.getenv("ANTHROPIC_BASE_URL", "")
        openai_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY", "")

        # 1. GROQ (Priority 1: Ultra-fast LPUs, ~0.8s total completion)
        if provider == "groq" or (groq_key and provider not in ["claude", "gemini", "openai"]):
            if groq_key:
                try:
                    from groq import AsyncGroq
                    client = AsyncGroq(api_key=groq_key)
                    model_name = _resolve_model(cfg.get("llm_model"), "groq", GROQ_DEFAULT_MODEL)

                    # Images need a vision-capable model; a text-only model 400s on an
                    # image_url part, which previously showed up as a silent bad answer.
                    if image_bytes and model_name not in GROQ_VISION_MODELS:
                        model_name = cfg.get("groq_vision_model") or GROQ_DEFAULT_VISION_MODEL
                        logger.info(f"[LLM Groq] Image attached, routing to vision model '{model_name}'")

                    stream = await client.chat.completions.create(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": build_multimodal_content(question, image_bytes)}
                        ],
                        stream=True,
                        max_tokens=max_tokens,
                        temperature=0.2
                    )
                    in_thinking = False
                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content or ""
                        if "<think>" in delta:
                            in_thinking = True
                            continue
                        if "</think>" in delta:
                            in_thinking = False
                            delta = delta.split("</think>")[-1]
                        if in_thinking:
                            continue
                        if delta:
                            yield delta
                    return
                except Exception as e:
                    logger.error(f"[LLM Groq] Error: {e}")
                    yield f"*(Groq Error: {e})*\n\n"
                    return

        # 2. GOOGLE GEMINI (Priority 2: Fastest multimodal & text)
        if provider == "gemini" and gemini_key:
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=gemini_key)
                model_name = cfg.get("llm_model") or "gemini-2.0-flash"

                contents = []
                if image_bytes:
                    contents.append(types.Part.from_bytes(data=image_bytes, mime_type=sniff_image_mime(image_bytes)))
                contents.append(f"{system_prompt}\n\nQUESTION:\n{question}")

                response = await client.aio.models.generate_content_stream(
                    model=model_name,
                    contents=contents,
                )
                async for chunk in response:
                    if chunk.text:
                        yield chunk.text
                return
            except Exception as e:
                logger.error(f"[LLM Gemini] Error: {e}")
                yield f"*(Gemini Error: {e})*\n\n"
                return

        # 3. ANTHROPIC CLAUDE / AGENTROUTER (Priority 3: Only when user explicitly selects claude)
        if provider == "claude" and anthropic_key:
            is_agent_router = "agentrouter" in anthropic_base_url.lower() or not anthropic_key.startswith("sk-ant-")
            
            if is_agent_router:
                url = "https://agentrouter.org/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {anthropic_key}",
                    "User-Agent": "claude-cli/1.0.108 (external, cli)",
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
                    "x-app": "cli",
                    "Content-Type": "application/json"
                }

                model_name = "deepseek-v4-flash"

                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": build_multimodal_content(question, image_bytes)}
                ]

                payload = {
                    "model": model_name,
                    "max_tokens": max_tokens,
                    "stream": True,
                    "messages": messages,
                    "temperature": 0.2
                }

                try:
                    async with httpx.AsyncClient(timeout=20.0) as client:
                        async with client.stream("POST", url, headers=headers, json=payload) as resp:
                            if resp.status_code == 200:
                                buffer = ""
                                async for chunk in resp.aiter_text():
                                    buffer += chunk
                                    while "\n" in buffer:
                                        line, buffer = buffer.split("\n", 1)
                                        line = line.strip()
                                        if line.startswith("data: "):
                                            data_part = line[6:].strip()
                                            if data_part == "[DONE]":
                                                break
                                            try:
                                                d = json.loads(data_part)
                                                delta = d["choices"][0]["delta"]
                                                content = delta.get("content") or delta.get("reasoning_content")
                                                if content:
                                                    yield content
                                            except Exception:
                                                pass
                                return
                            else:
                                err = await resp.aread()
                                logger.error(f"[AgentRouter] HTTP {resp.status_code}: {err.decode('utf-8', errors='ignore')}")
                                yield f"*(AgentRouter Error {resp.status_code})*\n\n"
                                return
                except Exception as e:
                    logger.error(f"[AgentRouter Exception] {e}")
                    yield f"*(Connection Error: {e})*\n\n"
                    return
            else:
                try:
                    import anthropic
                    client = anthropic.AsyncAnthropic(api_key=anthropic_key)
                    model_name = cfg.get("llm_model") or "claude-3-5-sonnet-20241022"

                    # Build multimodal content for Claude's native API format
                    if image_bytes:
                        user_content = [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": sniff_image_mime(image_bytes),
                                    "data": base64.b64encode(image_bytes).decode("utf-8"),
                                },
                            },
                            {"type": "text", "text": question},
                        ]
                    else:
                        user_content = question

                    messages = [{"role": "user", "content": user_content}]
                    async with client.messages.stream(
                        max_tokens=max_tokens,
                        system=system_prompt,
                        messages=messages,
                        model=model_name,
                    ) as stream:
                        async for text in stream.text_stream:
                            yield text
                    return
                except Exception as e:
                    logger.error(f"[LLM Claude] Error: {e}")
                    yield f"*(Claude Error: {e})*\n\n"
                    return

        # 4. OPENAI (Priority 4)
        if provider == "openai" and openai_key:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=openai_key)
                model_name = _resolve_model(cfg.get("llm_model"), "openai", "gpt-4o-mini")

                stream = await client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": build_multimodal_content(question, image_bytes)}
                    ],
                    stream=True,
                    max_tokens=max_tokens,
                    temperature=0.2
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        yield delta
                return
            except Exception as e:
                logger.error(f"[LLM OpenAI] Error: {e}")
                yield f"*(OpenAI Error: {e})*\n\n"
                return

        # Demo Fallback
        demo_resp = f"""### Quick Talking Points:
- **Core Concept**: Address '{question[:50]}...' directly with standard best practices.
- **Key Trade-off**: Explain scalability vs complexity.
- **STAR Action**: *"In my previous project, we optimized this and reduced latency by 40%."*"""
        for word in demo_resp.split(" "):
            yield word + " "
            await asyncio.sleep(0.02)

    async def stream_solver(self, question: str, image_bytes: Optional[bytes] = None, category: str = "auto", answer_style: str = "option_only") -> AsyncGenerator[str, None]:
        """
        Specialized high-accuracy solver stream for technical challenges, aptitude, reasoning, MCQs and screenshots.
        Uses deterministic temperature (0.1) and enforces clean plain-text math with zero dollar signs.
        """
        cfg = config_manager.get_all()
        provider = cfg.get("llm_provider", "groq").lower()
        system_prompt = build_solver_system_prompt(category, answer_style)
        max_tokens = 1500

        groq_key = cfg.get("groq_api_key") or os.getenv("GROQ_API_KEY", "")
        gemini_key = cfg.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
        openai_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY", "")

        # 1. GROQ
        if provider == "groq" or (groq_key and provider not in ["claude", "gemini", "openai"]):
            if groq_key:
                try:
                    from groq import AsyncGroq, RateLimitError
                    client = AsyncGroq(api_key=groq_key)
                    
                    target_messages = None
                    target_model = "openai/gpt-oss-120b"
                    
                    # DUAL-PASS ARCHITECTURE FOR IMAGES:
                    # Pass 1: Extract verbatim text & options with Qwen 27B
                    # Pass 2: Solve with 120-Billion parameter GPT-OSS reasoner!
                    if image_bytes:
                        opt_img = optimize_image_bytes(image_bytes, max_dim=960)
                        extracted_ocr = None
                        
                        for attempt in range(2):
                            try:
                                ocr_res = await client.chat.completions.create(
                                    model="qwen/qwen3.8-27b",
                                    messages=[{
                                        "role": "user",
                                        "content": [
                                            {
                                                "type": "text",
                                                "text": "Transcribe all questions, text, equations, and options (A, B, C, D) visible in this image verbatim. Do not solve. Output ONLY the extracted question and options text."
                                            },
                                            {
                                                "type": "image_url",
                                                "image_url": {"url": f"data:image/jpeg;base64,{base64.b64encode(opt_img).decode('utf-8')}"}
                                            }
                                        ]
                                    }],
                                    temperature=0.0,
                                    max_tokens=600
                                )
                                extracted_ocr = ocr_res.choices[0].message.content.strip()
                                logger.info(f"[Dual-Pass] OCR Extracted: {extracted_ocr[:120]}...")
                                break
                            except RateLimitError:
                                if attempt == 0:
                                    logger.warning("[Dual-Pass] OCR rate limit reached, waiting 2s...")
                                    await asyncio.sleep(2)
                                else:
                                    extracted_ocr = None
                            except Exception as ex_ocr:
                                logger.warning(f"[Dual-Pass] OCR pass error: {ex_ocr}")
                                break

                        if extracted_ocr and len(extracted_ocr) > 10:
                            # Pass 2: 120B Master Reasoner
                            target_messages = [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": f"PROBLEM / SCREENSHOT CONTENT:\n{extracted_ocr}\n\nINSTRUCTION: Solve with 100% mathematical precision and output the correct option."}
                            ]
                            target_model = "openai/gpt-oss-120b"
                        else:
                            # Fallback to direct multimodal solve
                            target_messages = [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": build_multimodal_content(question, opt_img)}
                            ]
                            target_model = cfg.get("groq_vision_model") or GROQ_DEFAULT_VISION_MODEL
                    else:
                        target_messages = [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": question}
                        ]
                        target_model = "openai/gpt-oss-120b"

                    stream = None
                    for attempt in range(2):
                        try:
                            stream = await client.chat.completions.create(
                                model=target_model,
                                messages=target_messages,
                                stream=True,
                                max_tokens=2000,
                                temperature=0.0
                            )
                            break
                        except RateLimitError:
                            if attempt == 0:
                                logger.warning("[Solver Groq] Rate limit reached on stream, waiting 3s...")
                                await asyncio.sleep(3)
                            else:
                                raise

                    if not stream:
                        yield "*(Rate limit reached. Please wait a few seconds and try again.)*\n\n"
                        return

                    buf = ""
                    in_thought = False
                    async for chunk in stream:
                        delta = chunk.choices[0].delta.content or ""
                        buf += delta
                        while buf:
                            if not in_thought:
                                # Look for <thought> or <think>
                                tag_start = -1
                                tag_len = 0
                                for open_tag in ["<thought>", "<think>"]:
                                    pos = buf.find(open_tag)
                                    if pos != -1 and (tag_start == -1 or pos < tag_start):
                                        tag_start = pos
                                        tag_len = len(open_tag)
                                
                                if tag_start != -1:
                                    if tag_start > 0:
                                        clean_seg = clean_math_delimiters(buf[:tag_start])
                                        if clean_seg:
                                            yield clean_seg
                                    buf = buf[tag_start + tag_len:]
                                    in_thought = True
                                else:
                                    # Check partial open tag
                                    partial = False
                                    for open_tag in ["<thought>", "<think>"]:
                                        for i in range(1, len(open_tag)):
                                            if buf.endswith(open_tag[:i]):
                                                partial = True
                                                break
                                    if partial:
                                        break
                                    else:
                                        clean_seg = clean_math_delimiters(buf)
                                        if clean_seg:
                                            yield clean_seg
                                        buf = ""
                            else:
                                # Look for </thought> or </think>
                                tag_end = -1
                                tag_len = 0
                                for close_tag in ["</thought>", "</think>"]:
                                    pos = buf.find(close_tag)
                                    if pos != -1 and (tag_end == -1 or pos < tag_end):
                                        tag_end = pos
                                        tag_len = len(close_tag)
                                
                                if tag_end != -1:
                                    buf = buf[tag_end + tag_len:]
                                    in_thought = False
                                else:
                                    if len(buf) > 20:
                                        buf = buf[-15:]
                                    break
                    
                    if buf and not in_thought:
                        clean_seg = clean_math_delimiters(buf)
                        if clean_seg:
                            yield clean_seg
                    return
                except Exception as e:
                    logger.error(f"[Solver Groq] Error: {e}")
                    yield f"*(Solver Error: {e})*\n\n"
                    return

        # 2. GEMINI
        if provider == "gemini" and gemini_key:
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=gemini_key)
                model_name = cfg.get("llm_model") or "gemini-2.0-flash"
                contents = []
                if image_bytes:
                    contents.append(types.Part.from_bytes(data=image_bytes, mime_type=sniff_image_mime(image_bytes)))
                contents.append(f"{system_prompt}\n\nPROBLEM TO SOLVE:\n{question}")
                response = await client.aio.models.generate_content_stream(
                    model=model_name,
                    contents=contents,
                )
                async for chunk in response:
                    if chunk.text:
                        yield clean_math_delimiters(chunk.text)
                return
            except Exception as e:
                logger.error(f"[Solver Gemini] Error: {e}")
                yield f"*(Gemini Error: {e})*\n\n"
                return

        # Fallback to standard stream_answer
        async for chunk in self.stream_answer(question, image_bytes=image_bytes):
            yield clean_math_delimiters(chunk)

    async def generate_debrief(self, qa_pairs: list) -> str:
        """Generates an AI post-interview assessment report from recorded Q&A pairs."""
        if not qa_pairs:
            return "No interview questions were recorded during this session."

        cfg = config_manager.get_all()
        role = cfg.get("target_position", "Software Engineer")
        groq_key = cfg.get("groq_api_key") or os.getenv("GROQ_API_KEY", "")
        gemini_key = cfg.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")
        openai_key = cfg.get("openai_api_key") or os.getenv("OPENAI_API_KEY", "")

        transcript_text = "\n\n".join([
            f"**Q{i+1}:** {item.get('question', '')}\n**A{i+1}:** {item.get('answer', '')}"
            for i, item in enumerate(qa_pairs)
        ])

        debrief_prompt = f"""You are an elite Tech Interview Coach evaluating a candidate's live interview for the role of **{role}**.

Here is the complete interview transcript from this session:
{transcript_text}

Please generate a comprehensive, structured Debrief Report formatted in Markdown:
# 📊 Live Interview Debrief & Assessment Report

## 🎯 Executive Summary & Overall Score
- **Performance Rating**: [Score out of 10] / 10
- **Summary**: Concise high-level evaluation of how well the candidate responded to the questions.

## ✨ Key Strengths Demonstrated
- Specific technical concepts, architecture, or behavioral points that were answered exceptionally well.

## ⚠️ Nuances & Missed Opportunities
- Any edge cases, Big-O trade-offs, or system limitations that could have been mentioned.

## 🚀 Round 2 Study Recommendations
- 3 to 4 specific topics, system design patterns, or coding algorithms to review before the next round.
"""

        if groq_key:
            try:
                from groq import AsyncGroq
                client = AsyncGroq(api_key=groq_key)
                resp = await client.chat.completions.create(
                    model="openai/gpt-oss-120b",
                    messages=[
                        {"role": "system", "content": "You are an expert technical interviewer and executive career coach."},
                        {"role": "user", "content": debrief_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=1500
                )
                return resp.choices[0].message.content or "Debrief generated successfully."
            except Exception as e:
                logger.error(f"[Debrief Groq] Error: {e}")

        if gemini_key:
            try:
                from google import genai
                client = genai.Client(api_key=gemini_key)
                resp = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=debrief_prompt
                )
                return resp.text or "Debrief generated successfully."
            except Exception as e:
                logger.error(f"[Debrief Gemini] Error: {e}")

        if openai_key:
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=openai_key)
                resp = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are an expert technical interviewer and executive career coach."},
                        {"role": "user", "content": debrief_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=1500
                )
                return resp.choices[0].message.content or "Debrief generated successfully."
            except Exception as e:
                logger.error(f"[Debrief OpenAI] Error: {e}")

        return "Could not generate debrief report. Please ensure a valid API key is configured in settings."

llm_engine = LLMEngine()
