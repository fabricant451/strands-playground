"""Serve the local WebGPU demo without isolation headers."""
import argparse
from functools import partial

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='.')
    args = parser.parse_args()
    print('http://127.0.0.1:8080', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8080), partial(Handler, directory=args.directory)).serve_forever()
