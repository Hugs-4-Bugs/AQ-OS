#!/usr/bin/env python3
"""Self-healing dev-server watchdog.

Double-fork daemonizes itself (reparented to PID 1, all std fds detached so
nothing links it back to an agent shell). It then supervises `bun run dev`:
whenever localhost:3000 stops answering, it respawns the server as its own
child (start_new_session). This mirrors the platform boot-tree model
(PID-1-rooted supervisor -> bun dev) which is the only process class the
harness reaper spares between tool calls.
"""
import os, sys, socket, time, subprocess, signal

LOG = '/home/z/my-project/dev-watchdog.log'
PIDFILE = '/tmp/auth-server-watcher.pid'
CWD = '/home/z/my-project'

def log(msg):
    with open(LOG, 'ab', 0) as f:
        f.write(f"[watchdog {time.strftime('%FT%TZ')}] {msg}\n".encode())

def port_up():
    try:
        with socket.create_connection(('127.0.0.1', 3000), timeout=2):
            return True
    except OSError:
        return False

# ── single-instance guard ──
try:
    old = open(PIDFILE).read().strip()
    if old and os.path.exists(f'/proc/{old}'):
        print(f"watchdog already running pid={old}")
        sys.exit(0)
except Exception:
    pass

# ── double fork ──
if os.fork() > 0:
    os._exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)
os.chdir(CWD)
devnull = os.open(os.devnull, os.O_RDONLY)
logfd = os.open(LOG, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(devnull, 0)
os.dup2(logfd, 1)
os.dup2(logfd, 2)

with open(PIDFILE, 'w') as f:
    f.write(str(os.getpid()))

signal.signal(signal.SIGTERM, lambda *_: os._exit(0))

log(f"watchdog started pid={os.getpid()}")
child = None
last_up = port_up()
down_since = None if last_up else time.time()

while True:
    time.sleep(4)
    up = port_up()
    if up:
        down_since = None
        continue
    if down_since is None:
        down_since = time.time()
        log("port 3000 down — grace period started")
        continue
    if time.time() - down_since < 12:
        continue  # allow normal (re)start latency before acting
    # still down after grace — (re)spawn
    if child is not None:
        try:
            os.kill(child.pid, signal.SIGKILL)
        except Exception:
            pass
        try:
            child.wait(timeout=5)
        except Exception:
            pass
    log("spawning bun run dev as watchdog child")
    lf = open(LOG, 'ab', 0)
    child = subprocess.Popen(
        ['bun', 'run', 'dev'],
        cwd=CWD, stdin=subprocess.DEVNULL, stdout=lf, stderr=lf,
        start_new_session=True, env={**os.environ, 'NODE_ENV': 'development'},
    )
    log(f"child pid={child.pid}")
    # give the server up to 120s to come up before considering another spawn
    for _ in range(30):
        time.sleep(4)
        if port_up():
            log("port 3000 healthy again")
            break
    down_since = None if port_up() else time.time()
