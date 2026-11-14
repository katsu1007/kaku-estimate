#!/bin/sh
# 画面テスト用のサーバー（リポジトリの一番上で動かす）。ポート 8765
curl -s -o /dev/null http://localhost:8765/ || (setsid nohup python3 -m http.server 8765 >/tmp/kaku-srv.log 2>&1 < /dev/null & sleep 1)
