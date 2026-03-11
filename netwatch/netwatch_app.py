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

# Speed-tier thresholds (bytes/sec)
SPEED_RED_THRESHOLD   = 5_000_000   # ≥ 5 MB/s  → red
SPEED_AMBER_THRESHOLD = 1_000_000   # ≥ 1 MB/s  → amber
SPEED_LT_THRESHOLD    =   100_000   # ≥ 100 KB/s → light green

# Connection strength bar constants
BAR_MAX_WIDTH        = 60   # pixel width of 100% full bar
BAR_MIN_WIDTH        = 4    # minimum visible bar width (px)
CONN_FULL_BAR        = 15   # connection count that fills the bar 100%

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
    VERSION  = "v2.0"

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("NetWatch — What's Using My Internet?")
        self.root.configure(bg=BG)
        self.root.geometry("860x720")
        self.root.minsize(680, 540)

        # Try to set window icon (EXE bundle puts it next to the exe)
        _icon = os.path.join(os.path.dirname(sys.executable), "netwatch_icon.ico")
        if not os.path.isfile(_icon):
            _icon = os.path.join(os.path.dirname(__file__), "netwatch_icon.ico")
        try:
            self.root.iconbitmap(_icon)
        except Exception:
            pass  # icon is optional

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
        self._start_monitor()

    # ── UI construction ──────────────────────────────────────

    def _build_ui(self):
        """Build all widgets once at startup."""

        # ── Navigation bar ───────────────────────────────────
        nav = tk.Frame(self.root, bg=NAV_BG, height=52)
        nav.pack(fill="x", side="top")
        nav.pack_propagate(False)

        tk.Label(nav, text="DoxNAF.online", bg=NAV_BG, fg=ACCENT_LT,
                 font=("Segoe UI", 12, "bold")).pack(side="left", padx=20)

        tk.Label(nav, text="✦  NetWatch", bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 11)).pack(side="left")

        tk.Label(nav, text=self.VERSION, bg=NAV_BG, fg=FAINT,
                 font=("Segoe UI", 9)).pack(side="left", padx=(6, 0))

        # Hostname chip on the right
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = "—"
        tk.Label(nav, text=f"🖥  {hostname}", bg=NAV_BG, fg=MUTED,
                 font=("Segoe UI", 9)).pack(side="right", padx=20)

        # ── Hero strip ───────────────────────────────────────
        hero = tk.Frame(self.root, bg=BG)
        hero.pack(fill="x", padx=28, pady=(16, 6))

        tk.Label(hero, text="What's Using My Internet?",
                 bg=BG, fg=CREAM, font=("Segoe UI", 22, "bold"),
                 anchor="w").pack(fill="x")

        sub_row = tk.Frame(hero, bg=BG)
        sub_row.pack(fill="x", pady=(4, 0))
        tk.Label(sub_row, text="Live network monitor · updates every second",
                 bg=BG, fg=MUTED, font=("Segoe UI", 11),
                 anchor="w").pack(side="left")

        # ── Separator ────────────────────────────────────────
        tk.Frame(self.root, bg=CARD_BORDER, height=1).pack(
            fill="x", padx=28, pady=(4, 0))

        # ── Speed cards row ──────────────────────────────────
        speed_row = tk.Frame(self.root, bg=BG)
        speed_row.pack(fill="x", padx=28, pady=(14, 0))

        dl_card, self._dl_val, self._dl_spark = self._make_speed_card(
            speed_row, "⬇   Download", "—", GREEN)
        ul_card, self._ul_val, self._ul_spark = self._make_speed_card(
            speed_row, "⬆   Upload",   "—", ACCENT_LT)

        dl_card.pack(side="left", fill="x", expand=True, padx=(0, 8))
        ul_card.pack(side="left", fill="x", expand=True, padx=(8, 0))

        # ── App list header ──────────────────────────────────
        list_hdr = tk.Frame(self.root, bg=BG)
        list_hdr.pack(fill="x", padx=28, pady=(16, 5))

        # Left side: title + pulsing live dot
        left = tk.Frame(list_hdr, bg=BG)
        left.pack(side="left")
        tk.Label(left, text="📋  Apps connected to the internet",
                 bg=BG, fg=CREAM, font=("Segoe UI", 12, "bold")).pack(side="left")
        PulsingDot(left, bg=BG, font=("Segoe UI", 10)).pack(
            side="left", padx=(10, 0))
        tk.Label(left, text="LIVE", bg=BG, fg=GREEN,
                 font=("Segoe UI", 9, "bold")).pack(side="left", padx=(2, 0))

        # Right side: sort buttons + search box
        right = tk.Frame(list_hdr, bg=BG)
        right.pack(side="right")

        tk.Label(right, text="Sort:", bg=BG, fg=FAINT,
                 font=("Segoe UI", 9)).pack(side="left", padx=(0, 4))

        self._sort_btn_conn = tk.Button(
            right, text="# Conns", bg=ACCENT, fg=CREAM,
            font=("Segoe UI", 9, "bold"), relief="flat",
            padx=8, pady=3, cursor="hand2",
            command=lambda: self._set_sort("connections"))
        self._sort_btn_conn.pack(side="left", padx=(0, 3))

        self._sort_btn_name = tk.Button(
            right, text="Name", bg=CARD_BG, fg=MUTED,
            font=("Segoe UI", 9), relief="flat",
            padx=8, pady=3, cursor="hand2",
            command=lambda: self._set_sort("name"))
        self._sort_btn_name.pack(side="left", padx=(0, 12))

        # Search field
        search_frame = tk.Frame(right, bg=CARD_BORDER, padx=1, pady=1)
        search_frame.pack(side="left")
        inner = tk.Frame(search_frame, bg=CARD_BG)
        inner.pack()
        tk.Label(inner, text="🔍", bg=CARD_BG, fg=FAINT,
                 font=("Segoe UI", 10)).pack(side="left", padx=(6, 2))
        self._search_entry = tk.Entry(
            inner, textvariable=self._filter_text,
            bg=CARD_BG, fg=CREAM, insertbackground=CREAM,
            font=("Segoe UI", 10), relief="flat", width=16,
            highlightthickness=0)
        self._search_entry.pack(side="left", pady=4, padx=(0, 6))
        self._filter_text.trace_add("write", lambda *_: self._redraw_list(
            self._last_apps))

        # ── Scrollable app list ──────────────────────────────
        list_outer = tk.Frame(self.root, bg=BG)
        list_outer.pack(fill="both", expand=True, padx=28, pady=(0, 4))

        self._canvas = tk.Canvas(
            list_outer, bg=CARD_BG,
            highlightthickness=1, highlightbackground=CARD_BORDER)
        scrollbar = ttk.Scrollbar(list_outer, orient="vertical",
                                  command=self._canvas.yview)
        self._canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self._canvas.pack(side="left", fill="both", expand=True)

        self._app_frame = tk.Frame(self._canvas, bg=CARD_BG)
        self._canvas_win = self._canvas.create_window(
            (0, 0), window=self._app_frame, anchor="nw")

        self._app_frame.bind("<Configure>", self._on_frame_resize)
        self._canvas.bind("<Configure>",   self._on_canvas_resize)
        self._canvas.bind("<MouseWheel>",   self._on_mousewheel)
        self._canvas.bind("<Button-4>",     self._scroll_up)
        self._canvas.bind("<Button-5>",     self._scroll_down)

        # ── Status bar ───────────────────────────────────────
        status_bar = tk.Frame(self.root, bg=NAV_BG, height=38)
        status_bar.pack(fill="x", side="bottom")
        status_bar.pack_propagate(False)

        self._status_label = tk.Label(
            status_bar,
            text="📊  Total since boot:   Downloaded: —   |   Uploaded: —",
            bg=NAV_BG, fg=MUTED, font=("Segoe UI", 10))
        self._status_label.pack(side="left", padx=16, expand=False)

        self._tick_label = tk.Label(
            status_bar, text="", bg=NAV_BG, fg=FAINT,
            font=("Segoe UI", 9))
        self._tick_label.pack(side="right", padx=16)
        self._start_tick()

    # ── Speed card factory ───────────────────────────────────

    def _make_speed_card(self, parent, label_text, value_text, value_color):
        """Create a speed card with label, big value, and sparkline."""
        card = tk.Frame(parent, bg=CARD_BG,
                        highlightthickness=1, highlightbackground=CARD_BORDER)

        # Top row: label
        tk.Label(card, text=label_text, bg=CARD_BG, fg=MUTED,
                 font=("Segoe UI", 10), anchor="w").pack(
                     anchor="w", padx=16, pady=(14, 0))

        # Big value label
        val_lbl = tk.Label(card, text=value_text, bg=CARD_BG, fg=value_color,
                           font=("Segoe UI", 22, "bold"), anchor="w")
        val_lbl.pack(anchor="w", padx=16, pady=(2, 6))

        # Sparkline canvas
        spark = SparklineCanvas(card, bars=HISTORY_LEN,
                                bar_color=value_color, bg=CARD_BG, height=36)
        spark.pack(fill="x", padx=16, pady=(0, 14))

        card._val_label = val_lbl
        return card, val_lbl, spark

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

    # ── Clock tick in status bar ─────────────────────────────

    def _start_tick(self):
        self._tick_label.configure(
            text=time.strftime("🕐  %H:%M:%S"))
        self.root.after(1000, self._start_tick)

    # ── Background monitoring thread ─────────────────────────

    def _start_monitor(self):
        t = threading.Thread(target=self._monitor_loop, daemon=True)
        t.start()

    def _monitor_loop(self):
        previous_stats = psutil.net_io_counters()
        time.sleep(1)

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
                time.sleep(1)

            except (psutil.Error, OSError):
                time.sleep(1)
            except Exception:
                time.sleep(2)

    # ── UI refresh ───────────────────────────────────────────

    def _update_ui(self, dl: int, ul: int, apps: list, stats):
        """Called on main thread via root.after()."""

        # Update speed history
        self._dl_history.append(dl)
        self._ul_history.append(ul)

        # Speed cards
        dl_color = _speed_color(dl)
        ul_color = _speed_color(ul)
        self._dl_val.configure(text=speed_to_readable(dl), fg=dl_color)
        self._ul_val.configure(text=speed_to_readable(ul), fg=ul_color)
        self._dl_spark.push(dl)
        self._dl_spark.set_color(dl_color)
        self._ul_spark.push(ul)
        self._ul_spark.set_color(ul_color)

        # Status bar
        self._status_label.configure(
            text=(f"📊  Since boot:  "
                  f"⬇ {bytes_to_readable(stats.bytes_recv)}"
                  f"  ·  ⬆ {bytes_to_readable(stats.bytes_sent)}"))

        # Cache & redraw app list
        self._last_apps = apps
        self._redraw_list(apps)

    def _redraw_list(self, apps: list):
        """Rebuild the scrollable app rows."""
        query = self._filter_text.get().lower().strip()

        # Filter
        filtered = [a for a in apps
                    if not query or query in a["name"].lower()]

        # Sort
        if self._sort_key == "name":
            filtered.sort(key=lambda a: a["name"].lower())
        else:
            filtered.sort(key=lambda a: a["connections"], reverse=True)

        # Destroy old rows
        for w in self._app_frame.winfo_children():
            w.destroy()

        if not filtered:
            msg = ("  😴  No apps match your search."
                   if query
                   else "  😴  No apps appear to be connected right now.")
            tk.Label(self._app_frame, text=msg,
                     bg=CARD_BG, fg=MUTED,
                     font=("Segoe UI", 11), anchor="w", pady=20
                     ).pack(fill="x", padx=18)
            return

        # Column header
        hdr = tk.Frame(self._app_frame, bg=NAV_BG)
        hdr.pack(fill="x")
        for txt, anchor, side, expand in [
            ("  App / Process", "w", "left",  True),
            ("Connections  ",   "e", "right", False),
            ("Ports (sample)  ","e", "right", False),
        ]:
            tk.Label(hdr, text=txt, bg=NAV_BG, fg=FAINT,
                     font=("Segoe UI", 9, "bold"),
                     anchor=anchor).pack(
                         side=side, fill="x" if expand else None,
                         expand=expand, padx=4, pady=5)

        # Rows
        for idx, app in enumerate(filtered[:self.MAX_ROWS]):
            n       = app["connections"]
            emoji   = pick_emoji(n)
            row_bg  = CARD_BG if idx % 2 == 0 else ROW_ALT
            row     = tk.Frame(self._app_frame, bg=row_bg)
            row.pack(fill="x")

            # Left: emoji + name
            tk.Label(row, text=f"  {emoji}  {app['name']}",
                     bg=row_bg, fg=CREAM, font=("Segoe UI", 11),
                     anchor="w", pady=9).pack(
                         side="left", fill="x", expand=True, padx=(4, 0))

            # Right: port list (small)
            ports_str = ", ".join(str(p) for p in app.get("ports", []))
            if ports_str:
                tk.Label(row, text=ports_str + "  ",
                         bg=row_bg, fg=FAINT,
                         font=("Segoe UI", 9), anchor="e"
                         ).pack(side="right", pady=9)

            # Right: connection count with colour
            conn_color = (RED   if n >= 10 else
                          AMBER if n >= 5  else
                          GREEN if n >= 2  else MUTED)
            conn_text = f"{n} conn{'s' if n != 1 else ''}"
            tk.Label(row, text=conn_text + "  ",
                     bg=row_bg, fg=conn_color,
                     font=("Segoe UI", 10, "bold"), anchor="e"
                     ).pack(side="right", pady=9, padx=4)

            # Strength bar (tiny canvas)
            bar_canvas = tk.Canvas(row, bg=row_bg,
                                   width=BAR_MAX_WIDTH, height=6,
                                   highlightthickness=0)
            bar_canvas.pack(side="right", padx=(0, 6))
            bar_w = min(BAR_MAX_WIDTH,
                        max(BAR_MIN_WIDTH,
                            int(n / CONN_FULL_BAR * BAR_MAX_WIDTH)))
            bar_canvas.create_rectangle(
                0, 1, bar_w, 5, fill=conn_color, outline="")

        # "… and N more" row
        if len(filtered) > self.MAX_ROWS:
            extra = len(filtered) - self.MAX_ROWS
            tk.Label(self._app_frame,
                     text=f"   ···  and {extra} more (use search to filter)",
                     bg=CARD_BG, fg=FAINT,
                     font=("Segoe UI", 10), anchor="w", pady=8
                     ).pack(fill="x", padx=18)

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
