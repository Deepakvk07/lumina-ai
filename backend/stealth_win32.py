"""
Stealth Win32 Helper
Enables 100% screen-share invisibility (Zoom, MS Teams, Google Meet, Discord, OBS)
using Windows DWM SetWindowDisplayAffinity API (WDA_EXCLUDEFROMCAPTURE = 0x00000011).
"""

import ctypes
from ctypes import wintypes
import logging

logger = logging.getLogger(__name__)

# Win32 Constants
WDA_NONE = 0x00000000
WDA_MONITOR = 0x00000001
WDA_EXCLUDEFROMCAPTURE = 0x00000011  # Windows 10 build 2004+ and Windows 11

GWL_EXSTYLE = -20
WS_EX_TRANSPARENT = 0x00000020
WS_EX_LAYERED = 0x00080000

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

def set_window_stealth(hwnd: int, enable_stealth: bool = True) -> bool:
    """
    Sets the window display affinity so it is EXCLUDED from screen capture,
    screen recording, window shares, and screenshot tools.
    """
    if not hwnd or hwnd == 0:
        logger.warning("Invalid HWND provided to set_window_stealth")
        return False

    affinity = WDA_EXCLUDEFROMCAPTURE if enable_stealth else WDA_NONE
    try:
        res = user32.SetWindowDisplayAffinity(wintypes.HWND(hwnd), wintypes.DWORD(affinity))
        if not res and enable_stealth:
            # Fallback to WDA_MONITOR if WDA_EXCLUDEFROMCAPTURE is not supported on older builds
            res = user32.SetWindowDisplayAffinity(wintypes.HWND(hwnd), wintypes.DWORD(WDA_MONITOR))
        logger.info(f"SetWindowDisplayAffinity for HWND {hwnd} with affinity {hex(affinity)} -> Result: {bool(res)}")
        return bool(res)
    except Exception as e:
        logger.error(f"Failed to set window display affinity: {e}")
        return False

def set_window_clickthrough(hwnd: int, enable: bool = True) -> bool:
    """
    Toggles click-through (mouse events pass through to underlying windows).
    """
    if not hwnd or hwnd == 0:
        return False
    try:
        hwnd_val = wintypes.HWND(hwnd)
        style = user32.GetWindowLongW(hwnd_val, GWL_EXSTYLE)
        if enable:
            new_style = style | WS_EX_TRANSPARENT | WS_EX_LAYERED
        else:
            new_style = (style & ~WS_EX_TRANSPARENT)
        user32.SetWindowLongW(hwnd_val, GWL_EXSTYLE, new_style)
        return True
    except Exception as e:
        logger.error(f"Failed to set click-through: {e}")
        return False

def find_window_by_title_substring(title_substr: str) -> int:
    """
    Finds top-level window containing title_substr (case-insensitive).
    """
    result_hwnd = 0

    def enum_windows_callback(hwnd, extra):
        nonlocal result_hwnd
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            if title_substr.lower() in buff.value.lower():
                result_hwnd = hwnd
                return False  # stop enumeration
        return True

    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows(EnumWindowsProc(enum_windows_callback), 0)
    return result_hwnd
