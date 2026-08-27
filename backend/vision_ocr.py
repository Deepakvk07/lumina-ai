"""
Vision & Screen Capture Engine
Handles full-screen native capture, clipboard image fetching, and multimodal problem solving.
"""

import io
import base64
import ctypes
from ctypes import windll, wintypes, Structure, c_long, c_int, byref
import logging
from typing import Optional, Tuple, Dict, Any
from PIL import Image, ImageGrab

logger = logging.getLogger(__name__)

class BITMAPINFOHEADER(Structure):
    _fields_ = [
        ('biSize', c_int),
        ('biWidth', c_long),
        ('biHeight', c_long),
        ('biPlanes', wintypes.WORD),
        ('biBitCount', wintypes.WORD),
        ('biCompression', wintypes.DWORD),
        ('biSizeImage', wintypes.DWORD),
        ('biXPelsPerMeter', c_long),
        ('biYPelsPerMeter', c_long),
        ('biClrUsed', wintypes.DWORD),
        ('biClrImportant', wintypes.DWORD)
    ]

class VisionEngine:
    def __init__(self):
        pass

    def capture_full_screen_native(self) -> Optional[bytes]:
        """
        Captures the entire desktop display using native Win32 GDI APIs.
        Temporarily hides overlay/stealth windows for 15ms during BitBlt to eliminate black boxes.
        Returns JPEG/PNG bytes.
        """
        try:
            user32 = windll.user32
            gdi32 = windll.gdi32

            # Find any overlay windows to prevent black boxes in GDI capture
            overlay_hwnds = []
            try:
                def enum_cb(h, _):
                    if user32.IsWindowVisible(h):
                        buff = ctypes.create_unicode_buffer(256)
                        user32.GetWindowTextW(h, buff, 256)
                        t = buff.value.lower()
                        if any(k in t for k in ["audiosrvhost", "lumina", "meetassist", "electron"]):
                            overlay_hwnds.append(h)
                    return True
                cb = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)(enum_cb)
                user32.EnumWindows(cb, 0)
            except Exception:
                pass

            # 1. Temporarily hide overlay windows
            for h in overlay_hwnds:
                try:
                    user32.ShowWindow(h, 0)  # SW_HIDE
                except Exception:
                    pass

            w = user32.GetSystemMetrics(0)
            h = user32.GetSystemMetrics(1)

            hdc_screen = None
            hdc_mem = None
            hbm = None
            try:
                hdc_screen = user32.GetDC(0)
                hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
                hbm = gdi32.CreateCompatibleBitmap(hdc_screen, w, h)
                gdi32.SelectObject(hdc_mem, hbm)

                SRCCOPY = 0x00CC0020
                gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, 0, 0, SRCCOPY)

                bmi = BITMAPINFOHEADER()
                bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
                bmi.biWidth = w
                bmi.biHeight = -h  # top-down DIB
                bmi.biPlanes = 1
                bmi.biBitCount = 32
                bmi.biCompression = 0

                buffer_size = w * h * 4
                buf = (ctypes.c_char * buffer_size)()
                gdi32.GetDIBits(hdc_mem, hbm, 0, h, buf, byref(bmi), 0)
            finally:
                # 2. Immediately restore overlay windows
                for h in overlay_hwnds:
                    try:
                        user32.ShowWindow(h, 5)  # SW_SHOW
                    except Exception:
                        pass

                # Release GDI handles
                if hbm:
                    gdi32.DeleteObject(hbm)
                if hdc_mem:
                    gdi32.DeleteDC(hdc_mem)
                if hdc_screen:
                    user32.ReleaseDC(0, hdc_screen)

            img = Image.frombuffer('RGBA', (w, h), buf, 'raw', 'BGRA', 0, 1)
            img = img.convert('RGB')

            out = io.BytesIO()
            img.save(out, format='JPEG', quality=95)
            return out.getvalue()
        except Exception as e:
            logger.error(f"[VisionEngine] Error capturing full screen: {e}")
            try:
                # Fallback to ImageGrab
                img = ImageGrab.grab()
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                out = io.BytesIO()
                img.save(out, format='JPEG', quality=95)
                return out.getvalue()
            except Exception as ex2:
                logger.error(f"[VisionEngine] Fallback capture error: {ex2}")
                return None

    def grab_clipboard_image(self) -> Optional[bytes]:
        """Grabs image currently in the Windows clipboard."""
        try:
            img = ImageGrab.grabclipboard()
            if isinstance(img, Image.Image):
                buf = io.BytesIO()
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.save(buf, format="JPEG", quality=90)
                return buf.getvalue()
        except Exception as e:
            logger.error(f"[VisionEngine] Error grabbing clipboard image: {e}")
        return None

    def bytes_to_data_url(self, raw_bytes: bytes, mime: str = "image/jpeg") -> str:
        """Converts raw image bytes to a base64 Data URL."""
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        return f"data:{mime};base64,{b64}"

    def base64_to_bytes(self, b64_str: str) -> Optional[bytes]:
        """Converts base64 data url / string to raw bytes."""
        try:
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]
            return base64.b64decode(b64_str)
        except Exception as e:
            logger.error(f"[VisionEngine] Error decoding base64: {e}")
            return None

vision_engine = VisionEngine()
