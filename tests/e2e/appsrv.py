import http.server,os,functools,sys
import os
REAL_TOILET = os.environ.get('KAKU_REAL_TOILET', '.real/toilet.jww')  # 実図面（お客さんの図面）。リポジトリには入れない
KAKU_TESTS = os.environ.get('KAKU_TESTS', '../gaisan/kaku-tests')
os.makedirs('tests/e2e/shots', exist_ok=True); os.makedirs('tests/e2e/out', exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
    def send_head(self):
        p=self.translate_path(self.path)
        if os.path.isdir(p) and self.path.split('?')[0] not in ('/',''): self.send_error(404); return None   # アプリと同じ：フォルダのアドレスは返さない
        return super().send_head()
http.server.ThreadingHTTPServer(('127.0.0.1',8798),functools.partial(H,directory=sys.argv[1])).serve_forever()
