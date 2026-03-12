/* ============================================================
 *  NetWatch — What's Using My Internet?  v3.0  (C edition)
 *  Made by DoxNAF.online
 *
 *  A fast, lightweight Windows console tool that shows
 *  exactly which apps are using the internet in real time.
 *
 *  Compile with MSVC:
 *    cl netwatch.c /link iphlpapi.lib ws2_32.lib
 *
 *  Compile with MinGW / GCC:
 *    gcc netwatch.c -o netwatch.exe -liphlpapi -lws2_32
 *
 *  Requires Windows Vista or later.
 * ============================================================ */

#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS

#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <psapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "psapi.lib")

/* ── Constants ─────────────────────────────────────────────── */

#define MAX_APPS  512
#define COL_WIDTH 38

/* ── Data types ─────────────────────────────────────────────── */

/* One entry in our app list */
typedef struct {
    char  name[MAX_PATH]; /* Process file name, e.g. "chrome.exe" */
    DWORD pid;            /* Windows Process ID                    */
    int   connections;    /* Number of ESTABLISHED TCP connections  */
} AppEntry;

/* Network byte counters (snapshot) */
typedef struct {
    ULONGLONG bytes_recv; /* Total bytes received across all NICs  */
    ULONGLONG bytes_sent; /* Total bytes sent across all NICs      */
} NetStats;

/* ── Helpers ────────────────────────────────────────────────── */

/*
 * bytes_to_readable — convert raw byte count into a human-readable
 * string like "4.2 MB" or "820 KB".
 */
static void bytes_to_readable(ULONGLONG bytes, char *buf, size_t buflen)
{
    if (bytes < 1024ULL)
        snprintf(buf, buflen, "%llu B", bytes);
    else if (bytes < 1024ULL * 1024)
        snprintf(buf, buflen, "%.1f KB", (double)bytes / 1024.0);
    else if (bytes < 1024ULL * 1024 * 1024)
        snprintf(buf, buflen, "%.1f MB", (double)bytes / (1024.0 * 1024.0));
    else
        snprintf(buf, buflen, "%.1f GB", (double)bytes / (1024.0 * 1024.0 * 1024.0));
}

/*
 * speed_to_readable — same as bytes_to_readable but appends "/s".
 */
static void speed_to_readable(ULONGLONG bps, char *buf, size_t buflen)
{
    char tmp[64];
    bytes_to_readable(bps, tmp, sizeof(tmp));
    snprintf(buf, buflen, "%s/s", tmp);
}

/*
 * pick_indicator — returns a short ASCII activity bar based on how
 * many connections the app has.
 */
static const char *pick_indicator(int conns)
{
    if (conns >= 10) return "[***]"; /* Very busy — streaming / downloading */
    if (conns >= 5)  return "[** ]"; /* Pretty active                        */
    if (conns >= 2)  return "[*  ]"; /* A couple of connections              */
    return "[.  ]";                  /* Single quiet connection               */
}

/*
 * get_process_name — fills `name` with the EXE filename (e.g.
 * "chrome.exe") for the given PID.  Returns 1 on success.
 */
static int get_process_name(DWORD pid, char *name, size_t namelen)
{
    HANDLE hProc;
    char   path[MAX_PATH] = {0};
    DWORD  size = MAX_PATH;
    char  *last_slash;

    hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!hProc)
        return 0;

    if (!QueryFullProcessImageNameA(hProc, 0, path, &size)) {
        CloseHandle(hProc);
        return 0;
    }
    CloseHandle(hProc);

    /* Keep only the filename portion */
    last_slash = strrchr(path, '\\');
    strncpy(name, last_slash ? last_slash + 1 : path, namelen - 1);
    name[namelen - 1] = '\0';
    return 1;
}

/*
 * compare_apps — qsort comparator; sorts by connection count
 * descending so the busiest apps appear at the top.
 */
static int compare_apps(const void *a, const void *b)
{
    const AppEntry *x = (const AppEntry *)a;
    const AppEntry *y = (const AppEntry *)b;
    return y->connections - x->connections;
}

/*
 * clear_screen — erases the Windows console buffer without
 * spawning a separate "cls" process.
 */
static void clear_screen(void)
{
    HANDLE                     h = GetStdHandle(STD_OUTPUT_HANDLE);
    CONSOLE_SCREEN_BUFFER_INFO csbi;
    DWORD                      count;
    COORD                      origin = {0, 0};

    if (!GetConsoleScreenBufferInfo(h, &csbi))
        return;

    FillConsoleOutputCharacter(h, ' ',
        (DWORD)csbi.dwSize.X * csbi.dwSize.Y, origin, &count);
    FillConsoleOutputAttribute(h, csbi.wAttributes,
        (DWORD)csbi.dwSize.X * csbi.dwSize.Y, origin, &count);
    SetConsoleCursorPosition(h, origin);
}

/* ── Network statistics ─────────────────────────────────────── */

/*
 * get_net_stats — sums InOctets / OutOctets across all real
 * network adapters (skipping loopback and tunnel interfaces).
 * Returns 1 on success, 0 on failure.
 */
static int get_net_stats(NetStats *stats)
{
    MIB_IF_TABLE2 *table = NULL;
    ULONG i;

    if (GetIfTable2(&table) != NO_ERROR)
        return 0;

    stats->bytes_recv = 0;
    stats->bytes_sent = 0;

    for (i = 0; i < table->NumEntries; i++) {
        MIB_IF_ROW2 *row = &table->Table[i];

        /* Skip loopback and virtual tunnel adapters */
        if (row->Type == IF_TYPE_SOFTWARE_LOOPBACK) continue;
        if (row->Type == IF_TYPE_TUNNEL)            continue;

        stats->bytes_recv += row->InOctets;
        stats->bytes_sent += row->OutOctets;
    }

    FreeMibTable(table);
    return 1;
}

/* ── Connected-apps enumeration ─────────────────────────────── */

/*
 * add_or_inc_pid — looks up `pid` in the pid array; increments its
 * counter if found, otherwise appends a new entry.
 */
static void add_or_inc_pid(DWORD *pids, int *counts, int *n,
                            DWORD pid, int max)
{
    int j;
    for (j = 0; j < *n; j++) {
        if (pids[j] == pid) {
            counts[j]++;
            return;
        }
    }
    if (*n < max) {
        pids[*n]   = pid;
        counts[*n] = 1;
        (*n)++;
    }
}

/*
 * get_connected_apps — fills `apps` with every process that has at
 * least one ESTABLISHED TCP connection (IPv4 + IPv6).
 * Sets *app_count to the number of entries written.
 * Returns 1 on success, 0 on failure.
 */
static int get_connected_apps(AppEntry *apps, int *app_count)
{
    /* Temporary PID / count arrays */
    static DWORD pid_list[MAX_APPS];
    static int   conn_list[MAX_APPS];
    int          n = 0;
    int          i;
    DWORD        sz;

    *app_count = 0;

    /* ── IPv4 ─────────────────────────────────────────────── */
    sz = 0;
    GetExtendedTcpTable(NULL, &sz, FALSE, AF_INET,
                        TCP_TABLE_OWNER_PID_CONNECTIONS, 0);
    {
        MIB_TCPTABLE_OWNER_PID *t4 = (MIB_TCPTABLE_OWNER_PID *)malloc(sz);
        if (t4) {
            if (GetExtendedTcpTable(t4, &sz, FALSE, AF_INET,
                    TCP_TABLE_OWNER_PID_CONNECTIONS, 0) == NO_ERROR) {
                for (i = 0; i < (int)t4->dwNumEntries; i++) {
                    if (t4->table[i].dwState == MIB_TCP_STATE_ESTAB)
                        add_or_inc_pid(pid_list, conn_list, &n,
                                       t4->table[i].dwOwningPid, MAX_APPS);
                }
            }
            free(t4);
        }
    }

    /* ── IPv6 ─────────────────────────────────────────────── */
    sz = 0;
    GetExtendedTcpTable(NULL, &sz, FALSE, AF_INET6,
                        TCP_TABLE_OWNER_PID_CONNECTIONS, 0);
    {
        MIB_TCP6TABLE_OWNER_PID *t6 = (MIB_TCP6TABLE_OWNER_PID *)malloc(sz);
        if (t6) {
            if (GetExtendedTcpTable(t6, &sz, FALSE, AF_INET6,
                    TCP_TABLE_OWNER_PID_CONNECTIONS, 0) == NO_ERROR) {
                for (i = 0; i < (int)t6->dwNumEntries; i++) {
                    if (t6->table[i].dwState == MIB_TCP_STATE_ESTAB)
                        add_or_inc_pid(pid_list, conn_list, &n,
                                       t6->table[i].dwOwningPid, MAX_APPS);
                }
            }
            free(t6);
        }
    }

    /* ── Build AppEntry list ──────────────────────────────── */
    for (i = 0; i < n && *app_count < MAX_APPS; i++) {
        char name[MAX_PATH];
        AppEntry *e = &apps[*app_count];

        if (!get_process_name(pid_list[i], name, sizeof(name)))
            snprintf(name, sizeof(name), "(pid %lu)", (unsigned long)pid_list[i]);

        strncpy(e->name, name, sizeof(e->name) - 1);
        e->name[sizeof(e->name) - 1] = '\0';
        e->pid         = pid_list[i];
        e->connections = conn_list[i];
        (*app_count)++;
    }

    return 1;
}

/* ── Entry point ────────────────────────────────────────────── */

int main(void)
{
    NetStats  prev, curr;
    AppEntry  apps[MAX_APPS];
    int       app_count;
    int       limit, i;
    char      dl_buf[32], ul_buf[32];
    char      recv_buf[32], sent_buf[32];

    /* Use UTF-8 output on Windows 10+ */
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleTitle("NetWatch -- What's Using My Internet?  |  DoxNAF.online");

    printf("\n");
    printf("  ==========================================================\n");
    printf("  WHAT'S USING MY INTERNET?   v3.0 (C edition)\n");
    printf("  Made by DoxNAF.online\n");
    printf("  ==========================================================\n\n");
    printf("  Starting up -- please wait one second...\n\n");

    if (!get_net_stats(&prev)) {
        fprintf(stderr, "  ERROR: Could not read network statistics.\n");
        printf("  Press Enter to exit...\n");
        getchar();
        return 1;
    }

    Sleep(1000); /* baseline measurement interval */

    while (1) {
        /* ── Take current snapshot ─────────────────────────── */
        if (!get_net_stats(&curr))
            break;

        /* speeds = bytes moved in the last ~1 second */
        ULONGLONG dl = (curr.bytes_recv > prev.bytes_recv)
                     ? curr.bytes_recv - prev.bytes_recv : 0;
        ULONGLONG ul = (curr.bytes_sent > prev.bytes_sent)
                     ? curr.bytes_sent - prev.bytes_sent : 0;

        /* ── Enumerate connected apps ──────────────────────── */
        get_connected_apps(apps, &app_count);
        if (app_count > 1)
            qsort(apps, app_count, sizeof(AppEntry), compare_apps);

        /* ── Render ────────────────────────────────────────── */
        clear_screen();

        printf("==============================================================\n");
        printf("  WHAT'S USING MY INTERNET?  (C edition)  |  DoxNAF.online\n");
        printf("  Press Ctrl+C to quit at any time.\n");
        printf("==============================================================\n\n");

        speed_to_readable(dl, dl_buf, sizeof(dl_buf));
        speed_to_readable(ul, ul_buf, sizeof(ul_buf));
        printf("  [v] Downloading:  %-16s\n", dl_buf);
        printf("  [^] Uploading:    %-16s\n\n", ul_buf);

        printf("--------------------------------------------------------------\n");
        printf("  Apps currently connected to the internet:\n");
        printf("--------------------------------------------------------------\n\n");

        if (app_count == 0) {
            printf("  (zzz)  No apps appear to be connected right now.\n");
            printf("         (You might be offline, or everything is idle.)\n");
        } else {
            limit = (app_count < 25) ? app_count : 25;
            for (i = 0; i < limit; i++) {
                const char *ind = pick_indicator(apps[i].connections);
                if (apps[i].connections == 1)
                    printf("  %s  %-*s  1 connection\n",
                           ind, COL_WIDTH, apps[i].name);
                else
                    printf("  %s  %-*s  %d connections\n",
                           ind, COL_WIDTH, apps[i].name, apps[i].connections);
            }
            if (app_count > 25)
                printf("       ... and %d more\n", app_count - 25);
        }

        bytes_to_readable(curr.bytes_recv, recv_buf, sizeof(recv_buf));
        bytes_to_readable(curr.bytes_sent, sent_buf, sizeof(sent_buf));

        printf("\n--------------------------------------------------------------\n\n");
        printf("  Total since your computer last started:\n");
        printf("       Downloaded:  %s\n", recv_buf);
        printf("       Uploaded:    %s\n\n", sent_buf);
        printf("  Updating every second...   (Ctrl+C to quit)\n\n");

        prev = curr;
        Sleep(1000);
    }

    return 0;
}
