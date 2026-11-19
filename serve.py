"""Tiny static server for the lab. Run: python3 serve.py  then open http://localhost:8000"""
import functools, http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=ROOT)) as httpd:
    print(f'Material Interaction Lab → http://localhost:{PORT}')
    httpd.serve_forever()
