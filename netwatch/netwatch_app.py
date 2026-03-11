# ============================================================
#  NetWatch — What's Using My Internet? 🌐
#  Full GUI App  ·  Made by DoxNAF.online
#
#  A point-and-click app that shows you which programs on
#  your computer are using the internet right now.
#
#  HOW TO RUN:
#    1. Install Python from https://python.org  (it's free!)
#    2. Open your terminal / Command Prompt
#    3. Type:  pip install psutil
#    4. Double-click this file  (or: python netwatch_app.py)
#    5. That's it! 🎉
# ============================================================

import threading
import time
import sys

# ── Step 1: Make sure psutil is installed ────────────────────
try:
    import psutil
except ImportError:
    # If tkinter is available, show a friendly error window
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "Missing Library — NetWatch",
            "The 'psutil' library is needed but not installed.\n\n"
            "To fix this, open a terminal and type:\n\n"
            "    pip install psutil\n\n"
            "Then run NetWatch again!"
        )
        root.destroy()
    except Exception:
        print("\n  ❌  Missing library: psutil")
        print("  Fix: pip install psutil\n")
    sys.exit(1)

import tkinter as tk
from tkinter import font as tkfont

# ── Colour palette (mirrors DoxNAF.online) ───────────────────
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
CREAM       = "#fff8e1"
CREAM_2     = "#ede0c8"
MUTED       = "#c4aed0"
FAINT       = "#8a6aaa"


# ── Helpers (same logic as netwatch.py) ──────────────────────

def bytes_to_readable(num_bytes):
    """Convert a byte count to a human-readable string."""
    if num_bytes < 1_024:
        return f"{num_bytes} B"
    elif num_bytes < 1_024 ** 2:
        return f"{num_bytes / 1_024:.1f} KB"
    elif num_bytes < 1_024 ** 3:
        return f"{num_bytes / 1_024 ** 2:.1f} MB"
    else:
        return f"{num_bytes / 1_024 ** 3:.1f} GB"


def speed_to_readable(bytes_per_second):
    """Convert bytes-per-second to a human-readable speed string."""
    return bytes_to_readable(bytes_per_second) + "/s"


def pick_emoji(num_connections):
    """Return an emoji that reflects how active a process is."""
    if num_connections >= 10:
        return "🔥"
    elif num_connections >= 5:
        return "📶"
    elif num_connections >= 2:
        return "🌐"
    else:
        return "🔌"


# ── Main application window ───────────────────────────────────

class NetWatchApp:
    """
    The main GUI window for NetWatch.

    Layout (top to bottom):
      • Nav bar        — logo + app name
      • Hero strip     — title + subtitle
      • Speed cards    — download / upload live speed
      • App list       — scrollable list of connected processes
      • Status bar     — total data since boot + update ticker
    """

    # How many app rows to show at most (keeps the list readable)
    MAX_ROWS = 30

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("NetWatch — What's Using My Internet?")
        self.root.configure(bg=BG)
        self.root.geometry("800x680")
        self.root.minsize(640, 520)

        # Flag for the background monitor thread
        self._running = True

        self._build_ui()
        self._start_monitor()

    # ── UI construction ──────────────────────────────────────

    def _build_ui(self):
        """Build all widgets once at startup."""

        # ── Navigation bar ──────────────────────────────────
        nav = tk.Frame(self.root, bg=NAV_BG, height=52)
        nav.pack(fill="x", side="top")
        nav.pack_propagate(False)

        tk.Label(
            nav,
            text="DoxNAF.online",
            bg=NAV_BG, fg=ACCENT_LT,
            font=("Segoe UI", 12, "bold"),
        ).pack(side="left", padx=20)

        tk.Label(
            nav,
            text="✦  NetWatch",
            bg=NAV_BG, fg=FAINT,
            font=("Segoe UI", 11),
        ).pack(side="left")

        # ── Hero strip ──────────────────────────────────────
        hero = tk.Frame(self.root, bg=BG)
        hero.pack(fill="x", padx=28, pady=(18, 6))

        tk.Label(
            hero,
            text="What's Using My Internet?",
            bg=BG, fg=CREAM,
            font=("Segoe UI", 21, "bold"),
            anchor="w",
        ).pack(fill="x")

        tk.Label(
            hero,
            text="Live network monitor · updates every second",
            bg=BG, fg=MUTED,
            font=("Segoe UI", 11),
            anchor="w",
        ).pack(fill="x", pady=(3, 0))

        # ── Speed cards row ──────────────────────────────────
        speed_row = tk.Frame(self.root, bg=BG)
        speed_row.pack(fill="x", padx=28, pady=(14, 0))

        dl_card = self._make_speed_card(
            speed_row, "⬇️   Download speed", "—", GREEN
        )
        ul_card = self._make_speed_card(
            speed_row, "⬆️   Upload speed", "—", ACCENT_LT
        )
        dl_card.pack(side="left", fill="x", expand=True, padx=(0, 8))
        ul_card.pack(side="left", fill="x", expand=True, padx=(8, 0))

        # Keep references so we can update values
        self._dl_val = dl_card._val_label
        self._ul_val = ul_card._val_label

        # ── App list header row ──────────────────────────────
        list_hdr = tk.Frame(self.root, bg=BG)
        list_hdr.pack(fill="x", padx=28, pady=(16, 5))

        tk.Label(
            list_hdr,
            text="📋   Apps connected to the internet",
            bg=BG, fg=CREAM,
            font=("Segoe UI", 12, "bold"),
        ).pack(side="left")

        self._live_dot = tk.Label(
            list_hdr,
            text="● Live",
            bg=BG, fg=GREEN,
            font=("Segoe UI", 10),
        )
        self._live_dot.pack(side="right")

        # ── Scrollable app list ──────────────────────────────
        list_outer = tk.Frame(self.root, bg=BG)
        list_outer.pack(fill="both", expand=True, padx=28, pady=(0, 4))

        # Canvas + scrollbar give us a scrollable interior frame
        self._canvas = tk.Canvas(
            list_outer,
            bg=CARD_BG,
            highlightthickness=1,
            highlightbackground=CARD_BORDER,
        )
        scrollbar = tk.Scrollbar(
            list_outer,
            orient="vertical",
            command=self._canvas.yview,
        )
        self._canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self._canvas.pack(side="left", fill="both", expand=True)

        # Inner frame that holds the actual rows
        self._app_frame = tk.Frame(self._canvas, bg=CARD_BG)
        self._canvas_win = self._canvas.create_window(
            (0, 0), window=self._app_frame, anchor="nw"
        )

        self._app_frame.bind("<Configure>", self._on_frame_resize)
        self._canvas.bind("<Configure>", self._on_canvas_resize)

        # Mouse-wheel scrolling (Windows, Mac, Linux)
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
            bg=NAV_BG, fg=MUTED,
            font=("Segoe UI", 10),
        )
        self._status_label.pack(expand=True)

    def _make_speed_card(self, parent, label_text, value_text, value_color):
        """Create a card widget that shows a labelled speed value."""
        card = tk.Frame(
            parent,
            bg=CARD_BG,
            highlightthickness=1,
            highlightbackground=CARD_BORDER,
        )

        tk.Label(
            card,
            text=label_text,
            bg=CARD_BG, fg=MUTED,
            font=("Segoe UI", 10),
            anchor="w",
        ).pack(anchor="w", padx=16, pady=(14, 0))

        val_lbl = tk.Label(
            card,
            text=value_text,
            bg=CARD_BG, fg=value_color,
            font=("Segoe UI", 20, "bold"),
            anchor="w",
        )
        val_lbl.pack(anchor="w", padx=16, pady=(2, 14))

        card._val_label = val_lbl
        return card

    # ── Canvas / scroll helpers ──────────────────────────────

    def _on_frame_resize(self, _event):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    def _on_canvas_resize(self, event):
        self._canvas.itemconfig(self._canvas_win, width=event.width)

    def _on_mousewheel(self, event):
        self._canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _scroll_up(self, _event):
        self._canvas.yview_scroll(-1, "units")

    def _scroll_down(self, _event):
        self._canvas.yview_scroll(1, "units")

    # ── Background monitoring thread ─────────────────────────

    def _start_monitor(self):
        """Spin up the background thread that polls psutil."""
        t = threading.Thread(target=self._monitor_loop, daemon=True)
        t.start()

    def _monitor_loop(self):
        """
        Runs in a background thread.
        Every second: gather network data, schedule a UI update on the
        main thread via root.after() (thread-safe tkinter pattern).
        """
        previous_stats = psutil.net_io_counters()
        time.sleep(1)

        while self._running:
            try:
                current_stats = psutil.net_io_counters()

                dl_speed = current_stats.bytes_recv - previous_stats.bytes_recv
                ul_speed = current_stats.bytes_sent - previous_stats.bytes_sent

                # Collect processes that have active TCP connections
                connected_apps = []
                for proc in psutil.process_iter(["pid", "name"]):
                    try:
                        conns = proc.net_connections()
                        active = [c for c in conns if c.status == "ESTABLISHED"]
                        if active:
                            connected_apps.append(
                                {
                                    "name": proc.info["name"] or "(unknown)",
                                    "connections": len(active),
                                }
                            )
                    except (
                        psutil.NoSuchProcess,
                        psutil.AccessDenied,
                        psutil.ZombieProcess,
                    ):
                        pass

                # Busiest first
                connected_apps.sort(
                    key=lambda a: a["connections"], reverse=True
                )

                # Schedule the UI refresh on the main thread
                self.root.after(
                    0,
                    self._update_ui,
                    dl_speed,
                    ul_speed,
                    connected_apps,
                    current_stats,
                )

                previous_stats = current_stats
                time.sleep(1)

            except (psutil.Error, OSError):
                # psutil or OS-level error — log briefly and retry next cycle
                time.sleep(1)
            except Exception:
                # Unexpected error — back off slightly and continue so the
                # UI stays alive rather than silently freezing.
                time.sleep(2)

    # ── UI refresh (called on main thread via root.after) ────

    def _update_ui(self, dl_speed, ul_speed, apps, stats):
        """Refresh every dynamic part of the window."""

        # Speed cards
        self._dl_val.config(text=speed_to_readable(dl_speed))
        self._ul_val.config(text=speed_to_readable(ul_speed))

        # Status bar totals
        self._status_label.config(
            text=(
                f"📊  Total since boot:   "
                f"Downloaded: {bytes_to_readable(stats.bytes_recv)}"
                f"   |   Uploaded: {bytes_to_readable(stats.bytes_sent)}"
            )
        )

        # Rebuild the app list rows
        for widget in self._app_frame.winfo_children():
            widget.destroy()

        if not apps:
            tk.Label(
                self._app_frame,
                text="  😴  No apps appear to be connected right now.",
                bg=CARD_BG, fg=MUTED,
                font=("Segoe UI", 11),
                anchor="w",
                pady=18,
            ).pack(fill="x", padx=18)
        else:
            for idx, app in enumerate(apps[: self.MAX_ROWS]):
                row_bg = CARD_BG if idx % 2 == 0 else ROW_ALT
                row = tk.Frame(self._app_frame, bg=row_bg)
                row.pack(fill="x")

                n = app["connections"]
                emoji = pick_emoji(n)
                conn_text = f"{n} connection{'s' if n != 1 else ''}"
                conn_color = GREEN if n >= 5 else MUTED

                # Left: emoji + process name
                tk.Label(
                    row,
                    text=f"  {emoji}  {app['name']}",
                    bg=row_bg, fg=CREAM,
                    font=("Segoe UI", 11),
                    anchor="w",
                    pady=9,
                ).pack(side="left", fill="x", expand=True, padx=(8, 0))

                # Right: connection count
                tk.Label(
                    row,
                    text=conn_text + "   ",
                    bg=row_bg, fg=conn_color,
                    font=("Segoe UI", 10),
                    anchor="e",
                ).pack(side="right", pady=9, padx=8)

            # "… and N more" row if list was trimmed
            if len(apps) > self.MAX_ROWS:
                extra = len(apps) - self.MAX_ROWS
                tk.Label(
                    self._app_frame,
                    text=f"   ···  and {extra} more",
                    bg=CARD_BG, fg=FAINT,
                    font=("Segoe UI", 10),
                    anchor="w",
                    pady=8,
                ).pack(fill="x", padx=18)

    # ── Clean shutdown ───────────────────────────────────────

    def on_close(self):
        """Stop the monitor thread then destroy the window."""
        self._running = False
        self.root.destroy()


# ── Entry point ───────────────────────────────────────────────

def main():
    root = tk.Tk()
    app = NetWatchApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
