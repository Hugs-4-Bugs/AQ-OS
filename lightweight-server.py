import http.server
import socketserver
import subprocess
import threading
import time
import os
import urllib.request
import urllib.error

PORT = 3000
NEXT_PORT = 3001
CHECK_INTERVAL = 5
MAX_RETRIES = 3

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.proxy_request()
    
    def do_POST(self):
        self.proxy_request()
    
    def do_PUT(self):
        self.proxy_request()
    
    def do_DELETE(self):
        self.proxy_request()
    
    def do_OPTIONS(self):
        self.proxy_request()
    
    def proxy_request(self):
        # Try to proxy to Next.js
        url = f"http://localhost:{NEXT_PORT}{self.path}"
        
        # Read request body if present
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        try:
            req = urllib.request.Request(url, data=body, method=self.command)
            # Forward headers
            for key, value in self.headers.items():
                if key.lower() not in ('host', 'content-length'):
                    req.add_header(key, value)
            
            resp = urllib.request.urlopen(req, timeout=10)
            
            self.send_response(resp.status)
            for key, value in resp.getheaders():
                if key.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception:
            self.send_response(502)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<html><body><h1>AcquisitionOS</h1><p>Server is restarting, please refresh in a few seconds...</p></body></html>')
    
    def log_message(self, format, *args):
        pass  # Suppress logs

def manage_nextjs():
    """Ensure Next.js is always running on NEXT_PORT"""
    while True:
        try:
            urllib.request.urlopen(f"http://localhost:{NEXT_PORT}/", timeout=3)
        except:
            # Next.js is down, restart it
            print(f"[{time.strftime('%H:%M:%S')}] Next.js down, restarting...")
            try:
                subprocess.Popen(
                    ['npx', 'next', 'start', '-p', str(NEXT_PORT)],
                    cwd='/home/z/my-project',
                    env={**os.environ, 'NODE_ENV': 'production'},
                    stdout=open('/tmp/next-prod.log', 'a'),
                    stderr=open('/tmp/next-prod.log', 'a'),
                    stdin=subprocess.DEVNULL
                )
                print(f"[{time.strftime('%H:%M:%S')}] Next.js restart initiated")
            except Exception as e:
                print(f"[{time.strftime('%H:%M:%S')}] Failed to restart: {e}")
        
        time.sleep(CHECK_INTERVAL)

if __name__ == '__main__':
    # Start Next.js manager in background thread
    manager = threading.Thread(target=manage_nextjs, daemon=True)
    manager.start()
    
    # Start lightweight proxy server
    with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"Lightweight proxy running on port {PORT}")
        httpd.serve_forever()
