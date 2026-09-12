import os, sys

pid = os.fork()
if pid > 0:
    print(f"Daemon started, child PID: {pid}")
    sys.exit(0)

os.setsid()

pid = os.fork()
if pid > 0:
    os._exit(0)

log = open('/home/z/my-project/dev.log', 'a')
os.dup2(log.fileno(), 0)
os.dup2(log.fileno(), 1)
os.dup2(log.fileno(), 2)

os.chdir('/home/z/my-project')
os.execvp('node', ['node', '.next/standalone/server.js'])
