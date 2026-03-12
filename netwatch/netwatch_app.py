# ============================================================
#  NetWatch — What's Using My Internet? 🌐  v2.0
#  Full GUI App  ·  Made by DoxNAF.online
#
#  A polished point-and-click app that shows which programs
#  on your computer are using the internet right now.
#
#  ► Just double-click to run — no setup needed!
#    Dependencies are installed automatically on first launch.
# ============================================================

import sys
import os
import subprocess
import threading
import time

# ═══════════════════════════════════════════════════════════
#  STEP 1 — Auto-install psutil if missing
#  Shows a friendly splash window while installing.
# ═══════════════════════════════════════════════════════════

def _auto_install_psutil():
    """
    If psutil is not installed, launch a friendly tkinter splash
    that calls pip automatically, then continues to the main app.
    Returns True when psutil is ready, False on failure.
    """
    try:
        import psutil  # noqa: F401
        return True
    except ImportError:
        pass

    # psutil is missing — try to install it with a splash window
    try:
        import tkinter as tk
        from tkinter import ttk
    except ImportError:
        # No tkinter either — fall back to console install
        print("\n  📦  Installing required library: psutil …")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "psutil", "--quiet"],
                timeout=120,
            )
            print("  ✅  Done! Starting NetWatch…\n")
            return True
        except Exception as exc:
            print(f"\n  ❌  Could not install psutil automatically: {exc}")
            print("  Fix: open a terminal and type:  pip install psutil\n")
            return False

    # Build a minimal splash window
    splash = tk.Tk()
    splash.title("NetWatch — Setting up…")
    splash.configure(bg="#16082e")
    splash.geometry("440x220")
    splash.resizable(False, False)
    # Centre on screen
    splash.update_idletasks()
    x = (splash.winfo_screenwidth()  - 440) // 2
    y = (splash.winfo_screenheight() - 220) // 2
    splash.geometry(f"440x220+{x}+{y}")

    # Logo row
    tk.Label(splash, text="DoxNAF.online", bg="#16082e", fg="#a87dff",
             font=("Segoe UI", 11, "bold")).pack(pady=(18, 0))
    tk.Label(splash, text="✦  NetWatch", bg="#16082e", fg="#8a6aaa",
             font=("Segoe UI", 10)).pack()

    # Status label
    status_var = tk.StringVar(value="📦  Installing required library: psutil …")
    tk.Label(splash, textvariable=status_var, bg="#16082e", fg="#fff8e1",
             font=("Segoe UI", 11), wraplength=400).pack(pady=(18, 8))

    # Progress bar
    style = ttk.Style(splash)
    style.theme_use("default")
    style.configure("NW.Horizontal.TProgressbar",
                    troughcolor="#1e1040", background="#3ddc84",
                    bordercolor="#2d1a5e", lightcolor="#3ddc84",
                    darkcolor="#3ddc84")
    pb = ttk.Progressbar(splash, style="NW.Horizontal.TProgressbar",
                         mode="indeterminate", length=360)
    pb.pack(pady=(0, 8))
    pb.start(12)

    tk.Label(splash, text="This only happens once!", bg="#16082e", fg="#8a6aaa",
             font=("Segoe UI", 9)).pack()

    result = {"ok": False}

    def _do_install():
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "psutil", "--quiet"],
                timeout=120,
            )
            result["ok"] = True
            status_var.set("✅  Done! Launching NetWatch…")
        except Exception as exc:
            status_var.set(f"❌  Install failed: {exc}\n"
                           "Open a terminal and type:  pip install psutil")
        finally:
            pb.stop()
            splash.after(1200, splash.destroy)

    threading.Thread(target=_do_install, daemon=True).start()
    splash.mainloop()
    return result["ok"]


if not _auto_install_psutil():
    sys.exit(1)

# ═══════════════════════════════════════════════════════════
#  Now psutil is available — import everything
# ═══════════════════════════════════════════════════════════

import socket
import collections
import tkinter as tk
from tkinter import ttk
import psutil

# ── Colour palette ───────────────────────────────────────────
BG          = "#16082e"
NAV_BG      = "#0e0520"
TITLE_BG    = "#080214"   # slightly darker strip for the custom title bar
CARD_BG     = "#1e1040"
CARD_BORDER = "#2d1a5e"
ROW_ALT     = "#190d38"
ACCENT      = "#7c4dff"
ACCENT_LT   = "#a87dff"
GREEN       = "#3ddc84"
GREEN_LT    = "#6eeea6"
AMBER       = "#ffb74d"
RED         = "#ff5252"
CREAM       = "#fff8e1"
CREAM_2     = "#ede0c8"
MUTED       = "#c4aed0"
FAINT       = "#8a6aaa"

# ── Friendly process-name map ─────────────────────────────────
# Keys are lowercase base names (no .exe).  Values are display labels.
FRIENDLY_NAMES: dict[str, str] = {
    # Browsers
    "chrome":           "Chrome",
    "firefox":          "Firefox",
    "msedge":           "Microsoft Edge",
    "msedgewebview2":   "Edge WebView",
    "opera":            "Opera",
    "brave":            "Brave",
    "vivaldi":          "Vivaldi",
    "iexplore":         "Internet Explorer",
    # Communication / Social
    "discord":          "Discord",
    "discordptb":       "Discord PTB",
    "discordcanary":    "Discord Canary",
    "slack":            "Slack",
    "teams":            "Microsoft Teams",
    "ms-teams":         "Microsoft Teams",
    "zoom":             "Zoom",
    "skype":            "Skype",
    "telegram":         "Telegram",
    "whatsapp":         "WhatsApp",
    "signal":           "Signal",
    "element":          "Element",
    # Gaming
    "steam":            "Steam",
    "epicgameslauncher":"Epic Games",
    "battle.net":       "Battle.net",
    "origin":           "EA Origin",
    "eadesktop":        "EA Desktop",
    "riotclientservices":"Riot Client",
    "gog galaxy":       "GOG Galaxy",
    "galaxyclient":     "GOG Galaxy",
    # Media / Streaming
    "spotify":          "Spotify",
    "vlc":              "VLC",
    "obs64":            "OBS Studio",
    "obs32":            "OBS Studio",
    "plex":             "Plex",
    "plexmediaserver":  "Plex Media Server",
    # Productivity / Cloud
    "outlook":          "Outlook",
    "thunderbird":      "Thunderbird",
    "onedrive":         "OneDrive",
    "dropbox":          "Dropbox",
    "googledrivefs":    "Google Drive",
    "notion":           "Notion",
    "obsidian":         "Obsidian",
    # Dev tools
    "code":             "VS Code",
    "devenv":           "Visual Studio",
    "pycharm64":        "PyCharm",
    "idea64":           "IntelliJ IDEA",
    "webstorm64":       "WebStorm",
    "clion64":          "CLion",
    "rider64":          "Rider",
    "datagrip64":       "DataGrip",
    "goland64":         "GoLand",
    "androidstudio64":  "Android Studio",
    "sublime_text":     "Sublime Text",
    "atom":             "Atom",
    "cursor":           "Cursor",
    # Runtimes / system helpers
    "node":             "Node.js",
    "python":           "Python",
    "pythonw":          "Python",
    "git":              "Git",
    "svchost":          "Windows Service",
}


def friendly_name(proc_name: str) -> str:
    """Return a clean display name for a process.

    Strips the .exe extension from every process and maps well-known
    executables to their human-readable app names.
    """
    base = proc_name
    if base.lower().endswith(".exe"):
        base = base[:-4]
    return FRIENDLY_NAMES.get(base.lower(), base)

# Speed-tier thresholds (bytes/sec)
SPEED_RED_THRESHOLD   = 5_000_000   # ≥ 5 MB/s  → red
SPEED_AMBER_THRESHOLD = 1_000_000   # ≥ 1 MB/s  → amber
SPEED_LT_THRESHOLD    =   100_000   # ≥ 100 KB/s → light green

# Connection strength bar constants
BAR_MAX_WIDTH        = 60   # pixel width of 100% full bar
BAR_MIN_WIDTH        = 4    # minimum visible bar width (px)
CONN_FULL_BAR        = 15   # connection count that fills the bar 100%
MAX_PORT_DISPLAY_LEN = 22   # max chars shown in the ports column

# Speed-tier colour helper
def _speed_color(bps: int) -> str:
    """Return a colour based on the current speed (bytes/sec)."""
    if bps >= SPEED_RED_THRESHOLD:   return RED
    if bps >= SPEED_AMBER_THRESHOLD: return AMBER
    if bps >= SPEED_LT_THRESHOLD:    return GREEN_LT
    return GREEN

# ── Helpers ───────────────────────────────────────────────────

HISTORY_LEN = 30   # seconds of speed history for sparklines

def bytes_to_readable(n: int) -> str:
    if n < 1_024:        return f"{n} B"
    if n < 1_024**2:     return f"{n/1_024:.1f} KB"
    if n < 1_024**3:     return f"{n/1_024**2:.1f} MB"
    return                      f"{n/1_024**3:.1f} GB"

def speed_to_readable(bps: int) -> str:
    return bytes_to_readable(bps) + "/s"

def pick_emoji(n: int) -> str:
    if n >= 10: return "🔥"
    if n >= 5:  return "📶"
    if n >= 2:  return "🌐"
    return       "🔌"


# ═══════════════════════════════════════════════════════════
#  SparklineCanvas — mini bar-chart for speed history
# ═══════════════════════════════════════════════════════════

class SparklineCanvas(tk.Canvas):
    """A small canvas that draws a scrolling bar-chart sparkline."""

    BAR_W  = 4
    BAR_GAP = 1

    def __init__(self, parent, bars: int = HISTORY_LEN,
                 bar_color: str = GREEN, bg: str = CARD_BG, **kw):
        width  = bars * (self.BAR_W + self.BAR_GAP)
        height = kw.pop("height", 36)
        super().__init__(parent, width=width, height=height,
                         bg=bg, highlightthickness=0, **kw)
        self._bars  = bars
        self._color = bar_color
        self._h     = height
        self._data: collections.deque = collections.deque(
            [0] * bars, maxlen=bars
        )

    def push(self, value: int):
        self._data.append(value)
        self._redraw()

    def set_color(self, color: str):
        self._color = color
        self._redraw()

    def _redraw(self):
        self.delete("all")
        peak = max(self._data) or 1
        x = 0
        for v in self._data:
            bar_h = max(2, int((v / peak) * (self._h - 4)))
            y0 = self._h - bar_h
            self.create_rectangle(
                x, y0, x + self.BAR_W, self._h,
                fill=self._color, outline="", tags="bar"
            )
            x += self.BAR_W + self.BAR_GAP


# ═══════════════════════════════════════════════════════════
#  PulsingDot — animated ● indicator
# ═══════════════════════════════════════════════════════════

class PulsingDot(tk.Label):
    """Label that pulses between two colours to indicate live status."""

    def __init__(self, parent, on_color=GREEN, off_color=FAINT, **kw):
        super().__init__(parent, text="●", **kw)
        self._on  = on_color
        self._off = off_color
        self._state = True
        self._pulse()

    def _pulse(self):
        self.configure(fg=self._on if self._state else self._off)
        self._state = not self._state
        self.after(700, self._pulse)


# ═══════════════════════════════════════════════════════════
#  NetWatchApp — main window
# ═══════════════════════════════════════════════════════════

class NetWatchApp:
    """
    NetWatch v2 — main GUI window.

    Layout:
      ┌─────────────────────────────────────┐
      │  NAV BAR  (logo · version · host)   │
      ├─────────────────────────────────────┤
      │  HERO     (title + subtitle)        │
      ├──────────────┬──────────────────────┤
      │  ⬇ DL card  │  ⬆ UL card           │
      │  [sparkline] │  [sparkline]         │
      ├─────────────────────────────────────┤
      │  APP LIST HEADER  (search + sort)   │
      │  ┌───────────────────────────────┐  │
      │  │  scrollable rows              │  │
      │  └───────────────────────────────┘  │
      ├─────────────────────────────────────┤
      │  STATUS BAR  (totals + tick)        │
      └─────────────────────────────────────┘
    """

    MAX_ROWS = 40
    VERSION  = "v3.0"

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("NetWatch")
        self.root.configure(bg=BG)
        self.root.geometry("1020x680")
        self.root.minsize(820, 540)

        # Remove the default Windows title bar — we draw our own below
        self.root.overrideredirect(True)

        # Window-drag / maximize state
        self._drag_x     = 0
        self._drag_y     = 0
        self._maximized  = False
        self._pre_max_geo = "1020x680"

        # ── Icon loading ──────────────────────────────────────
        # Locate NETWATCH.png (works both frozen .exe and plain .py)
        def _asset(name: str) -> str:
            for base in (os.path.dirname(sys.executable),
                         getattr(sys, "_MEIPASS", ""),
                         os.path.dirname(os.path.abspath(__file__))):
                p = os.path.join(base, name)
                if os.path.isfile(p):
                    return p
            return ""

        _icon_png = _asset("NETWATCH.png")
        _icon_ico = _asset("NETWATCH.ico")

        self._icon_photo = None
        self._icon_small = None

        if _icon_png:
            try:
                _img = tk.PhotoImage(file=_icon_png)
                self._icon_photo = _img.subsample(100, 100)
                self.root.iconphoto(True, self._icon_photo)
                self._icon_small = _img.subsample(146, 146)
                del _img
            except (tk.TclError, FileNotFoundError, OSError):
                pass

        # Use .ico for the native Windows taskbar icon (crisp at all sizes)
        if _icon_ico:
            try:
                self.root.iconbitmap(_icon_ico)
            except (tk.TclError, FileNotFoundError, OSError):
                pass

        self._running      = True
        self._filter_text  = tk.StringVar()
        self._sort_key     = "connections"  # "connections" | "name"
        self._last_apps    = []

        self._dl_history: collections.deque = collections.deque(
            [0] * HISTORY_LEN, maxlen=HISTORY_LEN
        )
        self._ul_history: collections.deque = collections.deque(
            [0] * HISTORY_LEN, maxlen=HISTORY_LEN
        )

        self._build_ui()
        # Ensure window appears in taskbar even without a native title bar
        self.root.after(150, self._fix_taskbar)
        self._start_monitor()

    # ── UI construction ──────────────────────────────────────

    def _build_ui(self):
        """Build all widgets once at startup (sidebar + main-content layout)."""

        # ── Custom title bar ──────────────────────────────────────
        self._title_bar = tk.Frame(self.root, bg=TITLE_BG, height=40)
        self._title_bar.pack(fill="x", side="top")
        self._title_bar.pack_propagate(False)

        # Accent stripe on the far left
        tk.Frame(self._title_bar, bg=ACCENT, width=4).pack(side="left", fill="y")

        # Window icon
        self._icon_label = None
        if self._icon_small:
            self._icon_label = tk.Label(
                self._title_bar, image=self._icon_small,
                bg=TITLE_BG, bd=0)
            self._icon_label.pack(side="left", padx=(10, 0))

        # App name
        self._title_label = tk.Label(
            self._title_bar, text="NetWatch",
            bg=TITLE_BG, fg=CREAM, font=("Segoe UI", 10, "bold"))
        self._title_label.pack(side="left", padx=(8, 0))

        # Version badge
        tk.Label(
            self._title_bar, text=self.VERSION,
            bg=ACCENT, fg=CREAM, font=("Segoe UI", 7, "bold"),
            padx=6, pady=2).pack(side="left", padx=(8, 0))

        # Window controls: ─  □  ✕
        _btn_kw = dict(
            bg=TITLE_BG, relief="flat", bd=0,
            padx=12, pady=0, font=("Segoe UI", 11),
            cursor="hand2", highlightthickness=0)

        self._close_btn = tk.Button(
            self._title_bar, text="✕", fg=MUTED,
            activebackground=RED, activeforeground=CREAM,
            command=self.on_close, **_btn_kw)
        self._close_btn.pack(side="right", fill="y")
        self._close_btn.bind("<Enter>",
            lambda e: self._close_btn.config(bg=RED, fg=CREAM))
        self._close_btn.bind("<Leave>",
            lambda e: self._close_btn.config(bg=TITLE_BG, fg=MUTED))

        self._max_btn = tk.Button(
            self._title_bar, text="□", fg=MUTED,
            activebackground=CARD_BG, activeforeground=CREAM,
            command=self._toggle_maximize, **_btn_kw)
        self._max_btn.pack(side="right", fill="y")
        self._max_btn.bind("<Enter>",
            lambda e: self._max_btn.config(bg=CARD_BG, fg=CREAM))
        self._max_btn.bind("<Leave>",
            lambda e: self._max_btn.config(bg=TITLE_BG, fg=MUTED))

        self._min_btn = tk.Button(
            self._title_bar, text="─", fg=MUTED,
            activebackground=CARD_BG, activeforeground=CREAM,
            command=self._minimize_window, **_btn_kw)
        self._min_btn.pack(side="right", fill="y")
        self._min_btn.bind("<Enter>",
            lambda e: self._min_btn.config(bg=CARD_BG, fg=CREAM))
        self._min_btn.bind("<Leave>",
            lambda e: self._min_btn.config(bg=TITLE_BG, fg=MUTED))

        # Drag-to-move bindings on title bar elements
        drag_targets = [w for w in (self._title_bar, self._icon_label,
                                    self._title_label) if w]
        for widget in drag_targets:
            widget.bind("<Button-1>",        self._start_drag)
            widget.bind("<B1-Motion>",       self._do_drag)
            widget.bind("<Double-Button-1>", lambda e: self._toggle_maximize())

        # ── Horizontal split: sidebar | main content ───────────────
        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True)

        # ── LEFT SIDEBAR ──────────────────────────────────────────
        sidebar = tk.Frame(body, bg=NAV_BG, width=200)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)

        # Top accent line
        tk.Frame(sidebar, bg=ACCENT, height=2).pack(fill="x")

        # Brand section
        brand = tk.Frame(sidebar, bg=NAV_BG)
        brand.pack(fill="x", padx=18, pady=(18, 0))
        tk.Label(brand, text="DoxNAF.online",
                 bg=NAV_BG, fg=ACCENT_LT,
                 font=("Segoe UI", 11, "bold"), anchor="w").pack(fill="x")
        tk.Label(brand, text="Network Activity Monitor",
                 bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 8), anchor="w").pack(fill="x")

        tk.Frame(sidebar, bg=CARD_BORDER, height=1).pack(
            fill="x", padx=18, pady=(14, 14))

        # HOST section
        host_sec = tk.Frame(sidebar, bg=NAV_BG)
        host_sec.pack(fill="x", padx=18)
        tk.Label(host_sec, text="HOST",
                 bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x")
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = "—"
        tk.Label(host_sec, text=f"🖥  {hostname}",
                 bg=NAV_BG, fg=CREAM,
                 font=("Segoe UI", 9), anchor="w").pack(fill="x", pady=(3, 0))

        tk.Frame(sidebar, bg=CARD_BORDER, height=1).pack(
            fill="x", padx=18, pady=(14, 14))

        # BANDWIDTH SINCE BOOT
        bw_sec = tk.Frame(sidebar, bg=NAV_BG)
        bw_sec.pack(fill="x", padx=18)
        tk.Label(bw_sec, text="SINCE BOOT",
                 bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x")

        dl_row = tk.Frame(bw_sec, bg=NAV_BG)
        dl_row.pack(fill="x", pady=(8, 3))
        tk.Label(dl_row, text="⬇", bg=NAV_BG, fg=GREEN,
                 font=("Segoe UI", 12)).pack(side="left")
        self._sidebar_dl_total = tk.Label(
            dl_row, text="—",
            bg=NAV_BG, fg=CREAM,
            font=("Segoe UI", 10, "bold"), anchor="w")
        self._sidebar_dl_total.pack(side="left", padx=(5, 0))

        ul_row = tk.Frame(bw_sec, bg=NAV_BG)
        ul_row.pack(fill="x")
        tk.Label(ul_row, text="⬆", bg=NAV_BG, fg=ACCENT_LT,
                 font=("Segoe UI", 12)).pack(side="left")
        self._sidebar_ul_total = tk.Label(
            ul_row, text="—",
            bg=NAV_BG, fg=CREAM,
            font=("Segoe UI", 10, "bold"), anchor="w")
        self._sidebar_ul_total.pack(side="left", padx=(5, 0))

        tk.Frame(sidebar, bg=CARD_BORDER, height=1).pack(
            fill="x", padx=18, pady=(14, 14))

        # ACTIVE PROCESSES count
        proc_sec = tk.Frame(sidebar, bg=NAV_BG)
        proc_sec.pack(fill="x", padx=18)
        tk.Label(proc_sec, text="ACTIVE PROCESSES",
                 bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x")
        self._sidebar_proc_count = tk.Label(
            proc_sec, text="—",
            bg=NAV_BG, fg=ACCENT_LT,
            font=("Segoe UI", 28, "bold"), anchor="w")
        self._sidebar_proc_count.pack(fill="x", pady=(4, 0))

        # Clock pinned to bottom of sidebar
        tk.Frame(sidebar, bg=CARD_BORDER, height=1).pack(
            side="bottom", fill="x", padx=18, pady=(0, 0))
        time_sec = tk.Frame(sidebar, bg=NAV_BG)
        time_sec.pack(side="bottom", fill="x", padx=18, pady=(0, 12))
        tk.Label(time_sec, text="LOCAL TIME",
                 bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 7, "bold"), anchor="w").pack(fill="x")
        self._sidebar_time = tk.Label(
            time_sec, text="",
            bg=NAV_BG, fg=MUTED,
            font=("Segoe UI", 13, "bold"), anchor="w")
        self._sidebar_time.pack(fill="x", pady=(3, 0))

        # ── RIGHT MAIN CONTENT ─────────────────────────────────────
        content = tk.Frame(body, bg=BG)
        content.pack(side="left", fill="both", expand=True)

        # Vertical accent line dividing sidebar from content
        tk.Frame(body, bg=CARD_BORDER, width=1).place(relx=0, rely=0,
            relheight=1, x=200)

        # ── Speed panel (top of content) ──────────────────────────
        speed_panel = tk.Frame(content, bg=CARD_BG,
                               highlightthickness=1,
                               highlightbackground=CARD_BORDER)
        speed_panel.pack(fill="x", padx=14, pady=(14, 0))

        # Panel header
        spd_hdr = tk.Frame(speed_panel, bg=CARD_BG)
        spd_hdr.pack(fill="x", padx=14, pady=(10, 6))
        tk.Label(spd_hdr, text="⚡  NETWORK SPEED",
                 bg=CARD_BG, fg=FAINT,
                 font=("Segoe UI", 8, "bold")).pack(side="left")
        tk.Label(spd_hdr, text="updates every 500 ms",
                 bg=CARD_BG, fg=FAINT,
                 font=("Segoe UI", 8)).pack(side="right")

        # Two-column: download | divider | upload
        spd_cols = tk.Frame(speed_panel, bg=CARD_BG)
        spd_cols.pack(fill="x", padx=14, pady=(0, 12))

        # Download column
        dl_col = tk.Frame(spd_cols, bg=CARD_BG)
        dl_col.pack(side="left", fill="x", expand=True, padx=(0, 6))

        dl_top = tk.Frame(dl_col, bg=CARD_BG)
        dl_top.pack(fill="x")
        tk.Label(dl_top, text="⬇  DOWNLOAD",
                 bg=CARD_BG, fg=GREEN,
                 font=("Segoe UI", 8, "bold")).pack(side="left")
        self._dl_val = tk.Label(
            dl_top, text="—",
            bg=CARD_BG, fg=CREAM,
            font=("Segoe UI", 12, "bold"))
        self._dl_val.pack(side="right")
        self._dl_spark = SparklineCanvas(
            dl_col, bars=HISTORY_LEN,
            bar_color=GREEN, bg=CARD_BG, height=34)
        self._dl_spark.pack(fill="x", pady=(5, 0))

        # Vertical divider
        tk.Frame(spd_cols, bg=CARD_BORDER, width=1).pack(
            side="left", fill="y", padx=6)

        # Upload column
        ul_col = tk.Frame(spd_cols, bg=CARD_BG)
        ul_col.pack(side="left", fill="x", expand=True, padx=(6, 0))

        ul_top = tk.Frame(ul_col, bg=CARD_BG)
        ul_top.pack(fill="x")
        tk.Label(ul_top, text="⬆  UPLOAD",
                 bg=CARD_BG, fg=ACCENT_LT,
                 font=("Segoe UI", 8, "bold")).pack(side="left")
        self._ul_val = tk.Label(
            ul_top, text="—",
            bg=CARD_BG, fg=CREAM,
            font=("Segoe UI", 12, "bold"))
        self._ul_val.pack(side="right")
        self._ul_spark = SparklineCanvas(
            ul_col, bars=HISTORY_LEN,
            bar_color=ACCENT_LT, bg=CARD_BG, height=34)
        self._ul_spark.pack(fill="x", pady=(5, 0))

        # ── Process table controls ────────────────────────────────
        ctrl_bar = tk.Frame(content, bg=BG)
        ctrl_bar.pack(fill="x", padx=14, pady=(14, 0))

        # Left: title + live dot
        ctrl_left = tk.Frame(ctrl_bar, bg=BG)
        ctrl_left.pack(side="left")
        tk.Label(ctrl_left, text="PROCESSES",
                 bg=BG, fg=CREAM,
                 font=("Segoe UI", 10, "bold")).pack(side="left")
        PulsingDot(ctrl_left, bg=BG, font=("Segoe UI", 9)).pack(
            side="left", padx=(10, 3))
        tk.Label(ctrl_left, text="LIVE",
                 bg=BG, fg=GREEN,
                 font=("Segoe UI", 8, "bold")).pack(side="left")

        # Right: segmented sort + search
        ctrl_right = tk.Frame(ctrl_bar, bg=BG)
        ctrl_right.pack(side="right")

        sort_wrap = tk.Frame(ctrl_right, bg=CARD_BORDER, padx=1, pady=1)
        sort_wrap.pack(side="left", padx=(0, 8))
        sort_inner = tk.Frame(sort_wrap, bg=CARD_BG)
        sort_inner.pack()

        self._sort_btn_conn = tk.Button(
            sort_inner, text="# Conns",
            bg=ACCENT, fg=CREAM,
            font=("Segoe UI", 8, "bold"), relief="flat",
            padx=8, pady=4, cursor="hand2",
            command=lambda: self._set_sort("connections"))
        self._sort_btn_conn.pack(side="left")
        tk.Frame(sort_inner, bg=CARD_BORDER, width=1).pack(
            side="left", fill="y")
        self._sort_btn_name = tk.Button(
            sort_inner, text="Name",
            bg=CARD_BG, fg=MUTED,
            font=("Segoe UI", 8), relief="flat",
            padx=8, pady=4, cursor="hand2",
            command=lambda: self._set_sort("name"))
        self._sort_btn_name.pack(side="left")

        # Search
        search_wrap = tk.Frame(ctrl_right, bg=CARD_BORDER, padx=1, pady=1)
        search_wrap.pack(side="left")
        search_inner = tk.Frame(search_wrap, bg=CARD_BG)
        search_inner.pack()
        tk.Label(search_inner, text="⌕",
                 bg=CARD_BG, fg=FAINT,
                 font=("Segoe UI", 11)).pack(side="left", padx=(6, 2))
        self._search_entry = tk.Entry(
            search_inner, textvariable=self._filter_text,
            bg=CARD_BG, fg=CREAM, insertbackground=CREAM,
            font=("Segoe UI", 9), relief="flat", width=14,
            highlightthickness=0)
        self._search_entry.pack(side="left", pady=3, padx=(0, 6))
        self._filter_text.trace_add("write",
            lambda *_: self._redraw_list(self._last_apps))

        # ── Scrollable process table ──────────────────────────────
        table_outer = tk.Frame(content, bg=BG)
        table_outer.pack(fill="both", expand=True, padx=14, pady=(8, 14))

        table_wrap = tk.Frame(
            table_outer, bg=CARD_BG,
            highlightthickness=1, highlightbackground=CARD_BORDER)
        table_wrap.pack(fill="both", expand=True)

        self._canvas = tk.Canvas(
            table_wrap, bg=CARD_BG, highlightthickness=0)
        scrollbar = ttk.Scrollbar(
            table_wrap, orient="vertical", command=self._canvas.yview)
        self._canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self._canvas.pack(side="left", fill="both", expand=True)

        self._app_frame = tk.Frame(self._canvas, bg=CARD_BG)
        self._canvas_win = self._canvas.create_window(
            (0, 0), window=self._app_frame, anchor="nw")

        self._app_frame.bind("<Configure>", self._on_frame_resize)
        self._canvas.bind("<Configure>",    self._on_canvas_resize)
        self._canvas.bind("<MouseWheel>",   self._on_mousewheel)
        self._canvas.bind("<Button-4>",     self._scroll_up)
        self._canvas.bind("<Button-5>",     self._scroll_down)

        self._start_tick()

    # ── Window-management helpers ─────────────────────────────

    def _start_drag(self, event):
        """Record the cursor offset relative to the window origin."""
        self._drag_x = event.x_root - self.root.winfo_x()
        self._drag_y = event.y_root - self.root.winfo_y()

    def _do_drag(self, event):
        """Move the window as the title bar is dragged."""
        if self._maximized:
            return
        x = event.x_root - self._drag_x
        y = event.y_root - self._drag_y
        self.root.geometry(f"+{x}+{y}")

    def _minimize_window(self):
        """Iconify the window (requires briefly re-enabling the native chrome)."""
        self.root.overrideredirect(False)
        self.root.iconify()
        # Re-apply custom chrome once the window is restored from the taskbar
        self.root.bind("<Map>", self._on_restore)

    def _on_restore(self, _event=None):
        """Called when the window is un-iconified; restores the custom title bar."""
        if self.root.state() == "normal":
            self.root.after(10, lambda: self.root.overrideredirect(True))
            self.root.after(160, self._fix_taskbar)
            self.root.unbind("<Map>")

    def _fix_taskbar(self):
        """Add WS_EX_APPWINDOW so the window appears in the Windows taskbar."""
        if sys.platform != "win32":
            return
        try:
            import ctypes
            GWL_EXSTYLE      = -20
            WS_EX_APPWINDOW  = 0x00040000
            WS_EX_TOOLWINDOW = 0x00000080
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
            style = ctypes.windll.user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
            style = (style & ~WS_EX_TOOLWINDOW) | WS_EX_APPWINDOW
            ctypes.windll.user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)
            ctypes.windll.user32.ShowWindow(hwnd, 5)   # SW_SHOW
        except (AttributeError, OSError):
            pass  # Windows API unavailable — silently ignore

    def _toggle_maximize(self):
        """Toggle between maximized and restored window size."""
        if self._maximized:
            self.root.geometry(self._pre_max_geo)
            self._maximized = False
            self._max_btn.configure(text="□")
        else:
            self._pre_max_geo = self.root.geometry()
            # Use the OS work area (screen minus taskbar) on Windows
            try:
                import ctypes
                class _RECT(ctypes.Structure):
                    _fields_ = [
                        ("left",   ctypes.c_long), ("top",    ctypes.c_long),
                        ("right",  ctypes.c_long), ("bottom", ctypes.c_long),
                    ]
                rc = _RECT()
                # SPI_GETWORKAREA = 0x30 (48)
                ctypes.windll.user32.SystemParametersInfoW(48, 0, ctypes.byref(rc), 0)
                w = rc.right  - rc.left
                h = rc.bottom - rc.top
                self.root.geometry(f"{w}x{h}+{rc.left}+{rc.top}")
            except Exception:
                sw = self.root.winfo_screenwidth()
                sh = self.root.winfo_screenheight()
                self.root.geometry(f"{sw}x{sh}+0+0")
            self._maximized = True
            self._max_btn.configure(text="❐")

    # ── Sort helpers ─────────────────────────────────────────

    def _set_sort(self, key: str):
        self._sort_key = key
        if key == "connections":
            self._sort_btn_conn.configure(bg=ACCENT, fg=CREAM)
            self._sort_btn_name.configure(bg=CARD_BG, fg=MUTED)
        else:
            self._sort_btn_name.configure(bg=ACCENT, fg=CREAM)
            self._sort_btn_conn.configure(bg=CARD_BG, fg=MUTED)
        self._redraw_list(self._last_apps)

    # ── Canvas / scroll helpers ──────────────────────────────

    def _on_frame_resize(self, _event):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    def _on_canvas_resize(self, event):
        self._canvas.itemconfig(self._canvas_win, width=event.width)

    def _on_mousewheel(self, event):
        self._canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _scroll_up(self,   _event): self._canvas.yview_scroll(-1, "units")
    def _scroll_down(self, _event): self._canvas.yview_scroll(1,  "units")

    # ── Clock tick in sidebar ────────────────────────────────

    def _start_tick(self):
        self._sidebar_time.configure(text=time.strftime("%H:%M:%S"))
        self.root.after(1000, self._start_tick)

    # ── Background monitoring thread ─────────────────────────

    def _start_monitor(self):
        t = threading.Thread(target=self._monitor_loop, daemon=True)
        t.start()

    def _monitor_loop(self):
        previous_stats = psutil.net_io_counters()
        time.sleep(0.5)

        while self._running:
            try:
                current_stats = psutil.net_io_counters()
                dl = current_stats.bytes_recv - previous_stats.bytes_recv
                ul = current_stats.bytes_sent - previous_stats.bytes_sent

                apps = []
                for proc in psutil.process_iter(["pid", "name"]):
                    try:
                        conns  = proc.net_connections()
                        active = [c for c in conns if c.status == "ESTABLISHED"]
                        if active:
                            # Collect remote ports for tooltip detail
                            ports = sorted({c.raddr.port
                                            for c in active if c.raddr})[:5]
                            apps.append({
                                "name":        proc.info["name"] or "(unknown)",
                                "connections": len(active),
                                "ports":       ports,
                            })
                    except (psutil.NoSuchProcess,
                            psutil.AccessDenied,
                            psutil.ZombieProcess):
                        pass

                self.root.after(
                    0, self._update_ui, dl, ul, apps, current_stats)

                previous_stats = current_stats
                time.sleep(0.5)

            except (psutil.Error, OSError):
                time.sleep(0.5)
            except Exception:
                time.sleep(0.5)

    # ── UI refresh ───────────────────────────────────────────

    def _update_ui(self, dl: int, ul: int, apps: list, stats):
        """Called on main thread via root.after()."""

        # Update speed history
        self._dl_history.append(dl)
        self._ul_history.append(ul)

        # Speed panel
        dl_color = _speed_color(dl)
        ul_color = _speed_color(ul)
        self._dl_val.configure(text=speed_to_readable(dl), fg=dl_color)
        self._ul_val.configure(text=speed_to_readable(ul), fg=ul_color)
        self._dl_spark.push(dl)
        self._dl_spark.set_color(dl_color)
        self._ul_spark.push(ul)
        self._ul_spark.set_color(ul_color)

        # Sidebar totals
        self._sidebar_dl_total.configure(
            text=bytes_to_readable(stats.bytes_recv))
        self._sidebar_ul_total.configure(
            text=bytes_to_readable(stats.bytes_sent))
        self._sidebar_proc_count.configure(text=str(len(apps)))

        # Cache & redraw app list
        self._last_apps = apps
        self._redraw_list(apps)

    def _redraw_list(self, apps: list):
        """Rebuild the scrollable process table."""
        query = self._filter_text.get().lower().strip()

        # Filter — match against both raw name and friendly display name
        filtered = [
            a for a in apps
            if not query
            or query in a["name"].lower()
            or query in friendly_name(a["name"]).lower()
        ]

        # Sort
        if self._sort_key == "name":
            filtered.sort(key=lambda a: friendly_name(a["name"]).lower())
        else:
            filtered.sort(key=lambda a: a["connections"], reverse=True)

        # Destroy old rows
        for w in self._app_frame.winfo_children():
            w.destroy()

        if not filtered:
            msg = ("  No processes match your filter."
                   if query
                   else "  No processes appear to be connected right now.")
            tk.Label(self._app_frame, text=msg,
                     bg=CARD_BG, fg=MUTED,
                     font=("Segoe UI", 11), anchor="w", pady=24
                     ).pack(fill="x", padx=18)
            return

        # ── Column header ─────────────────────────────────────────
        hdr = tk.Frame(self._app_frame, bg=TITLE_BG)
        hdr.pack(fill="x")

        tk.Label(hdr, text="  PROCESS",
                 bg=TITLE_BG, fg=FAINT,
                 font=("Segoe UI", 8, "bold"), anchor="w"
                 ).pack(side="left", fill="x", expand=True, padx=4, pady=6)
        tk.Label(hdr, text="ACTIVITY        ",
                 bg=TITLE_BG, fg=FAINT,
                 font=("Segoe UI", 8, "bold"), anchor="e"
                 ).pack(side="right", padx=4, pady=6)
        tk.Label(hdr, text="CONNS  ",
                 bg=TITLE_BG, fg=FAINT,
                 font=("Segoe UI", 8, "bold"), anchor="e"
                 ).pack(side="right", padx=4, pady=6)
        tk.Label(hdr, text="PORTS            ",
                 bg=TITLE_BG, fg=FAINT,
                 font=("Segoe UI", 8, "bold"), anchor="e"
                 ).pack(side="right", padx=4, pady=6)

        # ── Data rows ─────────────────────────────────────────────
        for idx, app in enumerate(filtered[:self.MAX_ROWS]):
            n        = app["connections"]
            emoji    = pick_emoji(n)
            row_bg   = ROW_ALT if idx % 2 == 0 else CARD_BG
            conn_color = (RED   if n >= 10 else
                          AMBER if n >= 5  else
                          GREEN if n >= 2  else MUTED)

            row = tk.Frame(self._app_frame, bg=row_bg)
            row.pack(fill="x")

            # Thin left accent stripe colour-coded by connection level
            tk.Frame(row, bg=conn_color, width=3).pack(side="left", fill="y")

            # Process name
            display = friendly_name(app["name"])
            tk.Label(row, text=f"  {emoji}  {display}",
                     bg=row_bg, fg=CREAM, font=("Segoe UI", 10),
                     anchor="w", pady=8
                     ).pack(side="left", fill="x", expand=True, padx=(2, 0))

            # Activity bar (horizontal fill bar, right-aligned)
            bar_frame = tk.Frame(row, bg=row_bg, width=90)
            bar_frame.pack(side="right", padx=(0, 10))
            bar_frame.pack_propagate(False)
            bar_bg = tk.Canvas(bar_frame, bg=CARD_BORDER,
                               height=6, highlightthickness=0)
            bar_bg.pack(fill="x", pady=10)
            bar_w = min(88, max(4, int(n / CONN_FULL_BAR * 88)))
            bar_bg.create_rectangle(0, 0, bar_w, 6,
                                    fill=conn_color, outline="")

            # Connection count badge
            badge_bg = conn_color if n >= 2 else CARD_BORDER
            badge = tk.Label(row, text=f" {n} ",
                             bg=badge_bg, fg=TITLE_BG if n >= 2 else MUTED,
                             font=("Segoe UI", 8, "bold"), padx=4, pady=2)
            badge.pack(side="right", padx=(0, 8))

            # Ports
            ports_str = ", ".join(str(p) for p in app.get("ports", []))
            tk.Label(row,
                     text=(ports_str[:MAX_PORT_DISPLAY_LEN] + "…"
                           if len(ports_str) > MAX_PORT_DISPLAY_LEN
                           else ports_str) + "   ",
                     bg=row_bg, fg=FAINT,
                     font=("Segoe UI", 8), anchor="e"
                     ).pack(side="right", padx=4)

            # Horizontal rule between rows
            tk.Frame(self._app_frame, bg=CARD_BORDER, height=1).pack(fill="x")

        # "… and N more" footer
        if len(filtered) > self.MAX_ROWS:
            extra = len(filtered) - self.MAX_ROWS
            tk.Label(self._app_frame,
                     text=f"  ···  {extra} more — refine your search to see them",
                     bg=CARD_BG, fg=FAINT,
                     font=("Segoe UI", 9), anchor="w", pady=8
                     ).pack(fill="x", padx=14)

    # ── Shutdown ─────────────────────────────────────────────

    def on_close(self):
        self._running = False
        self.root.destroy()


# ═══════════════════════════════════════════════════════════
#  Entry point
# ═══════════════════════════════════════════════════════════

def main():
    root = tk.Tk()
    app  = NetWatchApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
