# ============================================================
#  What's Using My Internet? 🌐
#  Made by DoxNAF.online
#
#  This tool shows you exactly which apps on your computer
#  are connected to the internet right now!
#
#  HOW TO RUN:
#    1. Install Python from https://python.org  (it's free!)
#    2. Open your terminal / Command Prompt
#    3. Type:  pip install psutil
#    4. Type:  python netwatch.py
#    5. That's it! 🎉
# ============================================================

import time   # lets us wait between updates
import os     # lets us clear the screen
import sys    # lets us exit the program cleanly

# ── Step 1: Make sure psutil is installed ────────────────────
#
# psutil is a helper library that lets Python peek at what
# programs are running and what network connections they have.
#
# If it's not installed yet, we'll tell the user exactly how
# to get it — no confusing error messages!
#
try:
    import psutil
except ImportError:
    print()
    print("  ❌  Oops! A helper library called 'psutil' is missing.")
    print()
    print("  To install it, open your terminal and type:")
    print()
    print("      pip install psutil")
    print()
    print("  Then run this program again!")
    print()
    input("  Press Enter to close...")
    sys.exit(1)


# ── Helper: Clear the screen ──────────────────────────────────

def clear_screen():
    """
    Wipes the terminal so the display looks clean every update.
    Uses 'cls' on Windows and 'clear' on Mac/Linux.
    """
    os.system('cls' if os.name == 'nt' else 'clear')


# ── Helper: Turn a huge byte number into something readable ───

def bytes_to_readable(num_bytes):
    """
    Converts a big number of bytes into words a human understands.

    Examples:
      800          ->  "800 B"    (bytes — tiny!)
      8,192        ->  "8.0 KB"   (kilobytes — small file)
      8,388,608    ->  "8.0 MB"   (megabytes — like a song)
      8,589,934,592 -> "8.0 GB"  (gigabytes — like a movie)

    We use 1024 (not 1000) because that's how computers actually
    count memory and storage — 1 KB = 1024 bytes.
    """
    if num_bytes < 1_024:
        return f"{num_bytes} B"
    elif num_bytes < 1_024 ** 2:
        return f"{num_bytes / 1_024:.1f} KB"
    elif num_bytes < 1_024 ** 3:
        return f"{num_bytes / 1_024 ** 2:.1f} MB"
    else:
        return f"{num_bytes / 1_024 ** 3:.1f} GB"


def speed_to_readable(bytes_per_second):
    """
    Turns a speed (in bytes per second) into something like '2.5 MB/s'.
    Just calls bytes_to_readable and adds '/s' for 'per second'.
    """
    return bytes_to_readable(bytes_per_second) + "/s"


# ── Helper: Pick an emoji based on how many connections ───────

def pick_emoji(num_connections):
    """
    Returns a fun emoji that shows how busy an app is.

    More connections = more internet activity = more exciting emoji!
    """
    if num_connections >= 10:
        return "🔥"   # Super busy — probably downloading or streaming
    elif num_connections >= 5:
        return "📶"   # Pretty active
    elif num_connections >= 2:
        return "🌐"   # A couple of connections — normal browsing
    else:
        return "🔌"   # Just one quiet connection


# ── Main function: Keep watching the internet! ────────────────

def watch_internet():
    """
    This is the main loop. It checks what's using the internet
    every second and shows a live, refreshing display.

    Here's what it does each loop:
      1. Grab current network stats
      2. Compare to last time to get download/upload speeds
         (1 second apart = the difference IS bytes-per-second)
      3. Find every program with an active internet connection
      4. Print it all in a nice, easy-to-read layout
      5. Wait 1 second, then do it all again
    """

    # Take a starting snapshot of how many bytes have been
    # sent and received since the computer booted up.
    previous_stats = psutil.net_io_counters()

    # Wait 1 second so we have a "before" and "after" to compare.
    time.sleep(1)

    # ── The loop that runs forever (until Ctrl+C) ──
    # Each pass takes exactly 1 second (sleep at the bottom),
    # so  current - previous  gives a true bytes-per-second speed.
    while True:

        # Grab the latest network stats
        current_stats = psutil.net_io_counters()

        # Work out speed:
        #   current - previous = how many bytes moved in the last second
        download_speed = current_stats.bytes_recv - previous_stats.bytes_recv
        upload_speed   = current_stats.bytes_sent - previous_stats.bytes_sent

        # Wipe the screen so the output looks like it's updating in place
        clear_screen()

        # ── Print the title bar ──────────────────────────────
        print("=" * 62)
        print("  🌐  WHAT'S USING MY INTERNET?       DoxNAF.online")
        print("  Ctrl+C to quit at any time.")
        print("=" * 62)
        print()

        # ── Show live download / upload speeds ───────────────
        print(f"  ⬇️  Downloading right now:   {speed_to_readable(download_speed)}")
        print(f"  ⬆️  Uploading right now:     {speed_to_readable(upload_speed)}")
        print()

        # ── Find every app with an active internet connection ─
        print("-" * 62)
        print("  📋  Apps currently connected to the internet:")
        print("-" * 62)
        print()

        connected_apps = []

        # Go through every running program on the computer
        for process in psutil.process_iter(['pid', 'name']):
            try:
                # Ask psutil for this program's network connections
                connections = process.net_connections()

                # 'ESTABLISHED' means the connection is live and active
                # (other statuses like 'LISTEN' mean it's just waiting)
                active_connections = [
                    c for c in connections
                    if c.status == 'ESTABLISHED'
                ]

                # If the app has at least one active connection, add it
                if active_connections:
                    connected_apps.append({
                        'name':        process.info['name'] or '(unknown)',
                        'connections': len(active_connections),
                    })

            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                # These errors just mean we couldn't check a particular
                # process — that's normal, so we just skip it quietly.
                pass

        if not connected_apps:
            print("  😴  No apps appear to be connected right now.")
            print("      (You might be offline, or everything is idle.)")
        else:
            # Sort the list so the busiest apps show up at the top
            connected_apps.sort(key=lambda app: app['connections'], reverse=True)

            # Print each app — cap at 25 so it fits on one screen
            for app in connected_apps[:25]:
                name      = app['name']
                num_conn  = app['connections']
                emoji     = pick_emoji(num_conn)

                # Make the connection count sound natural
                if num_conn == 1:
                    conn_label = "1 connection"
                else:
                    conn_label = f"{num_conn} connections"

                # Pad the name so all the connection counts line up neatly
                print(f"  {emoji}  {name:<34}  {conn_label}")

            # If there were more than 25, let the user know
            if len(connected_apps) > 25:
                extra = len(connected_apps) - 25
                print(f"       ... and {extra} more")

        # ── Show total data used since computer start ─────────
        print()
        print("-" * 62)
        print()
        print(f"  📊  Total since your computer last started:")
        print(f"       Downloaded:  {bytes_to_readable(current_stats.bytes_recv)}")
        print(f"       Uploaded:    {bytes_to_readable(current_stats.bytes_sent)}")
        print()
        print("  🔄  Updating every second...   (Ctrl+C to quit)")
        print()

        # Save the current stats so we can compare again next loop
        previous_stats = current_stats

        # Wait 1 second before the next refresh.
        # Because we measure bytes over exactly 1 second, the difference
        # between current and previous stats IS the bytes-per-second speed.
        time.sleep(1)


# ── Entry point ───────────────────────────────────────────────
#
# This block only runs when you execute THIS file directly.
# (If another script imports this file, this block is skipped —
# that's what `if __name__ == "__main__"` does.)
#
if __name__ == "__main__":
    print()
    print("  🌐  Welcome to  WHAT'S USING MY INTERNET?")
    print()
    print("  This tool shows you which apps are using your internet")
    print("  connection right now, updated live every second.")
    print()
    print("  Starting up — hang on for one second...")
    print()

    try:
        watch_internet()
    except KeyboardInterrupt:
        # The user pressed Ctrl+C — exit gracefully with a nice message
        print()
        print()
        print("  👋  See ya! Thanks for using What's Using My Internet?")
        print("      DoxNAF.online")
        print()
