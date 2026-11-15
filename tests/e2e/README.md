# 画面のテスト（e2e）

ブラウザ（Playwright + Chrome）で実際に画面を操作して確かめるスクリプト。
いつもリポジトリの一番上で動かす。

```sh
sh tests/e2e/srv.sh                    # ポート 8765 でサーバーを立てる
python3 tests/e2e/place.py             # 例：器具を置く
```

- 画面写真は `tests/e2e/shots/` に、書き出したファイルは `tests/e2e/out/` に出る（どちらも git に入れない）
- `tests/e2e/fixtures/` は自分で作った簡単な図・写真だけ（お客さんの図面は入れない）

## お客さんの図面（実図面）が要るテスト

`.real/`（git に入れない）に置いて使う。場所を変える時は環境変数で指定する。

- `KAKU_REAL_TOILET`：現場のトイレの図面（既定 `.real/toilet.jww`）
- `KAKU_TESTS`：読み取りテストの図面と正解（katsu1007/gaisan リポジトリの `kaku-tests/`。既定 `../gaisan/kaku-tests`）

実図面が要る物：br bundle bundle2 ctr d3 demo edit f3 fin fl fxsize l2 lall lcmp light lp modes ui ui2 ui3 uv view2 view3

## 何を確かめるか

| スクリプト | 中身 |
|---|---|
| checks.py | 入れ忘れのチェック・数量の根拠と確認済みの印・品番の欄とメーカーのサイトを開くボタン・案件全体の元に戻す（スマホの幅） |
| sk.py / sk2.py | 寸法で間取りを作る（四角・向きと長さ・写真の角） |
| trace.py `<pdf か画像>` | なぞって拾う（下に敷く・縮尺合わせ・直角・測る・拡大） |
| place.py | 器具を置く（1個ずつ・部屋に並べる・壁に沿って・向き・移動） |
| imp3.py `<図面> <名前>` | 図面の読み込み・区画と器具の数・電気を数える（入れる・外す） |
| grid.py `<dxf…>` | 通り芯の表示・非表示 |
| layer.py | 下の層も解体（壁の多層） |
| parts.py | 寸法を足す・引く（L字など） |
| wall.py / demo.py | 壁の解体・仕上げ（線で・範囲で）と部屋の壁から自動で引く |
| fin.py / ui.py / ui2.py | 区画を順にタップ → 終了 → 仕上げを決める |
| uv.py | 部屋から外す・この区画をトイレにする |
| edit.py / fxsize.py | 器具を直す・器具の大きさ |
| light.py / l2.py / lall.py / lp.py / lcmp.py | 照明・コンセント・スイッチの自動配置と配線（前のKAKUと比べる） |
| loupe.py | 長押しの虫めがね |
| modes.py | 図面の作業の切り替えボタン（スマホの幅） |
| d3.py / view2.py / view3.py / f3.py | 3D（前のKAKUの3Dに渡す中身） |
| fl.py / ui3.py | 階ごとの内訳 |
| sync2.py / syncfs.py / syncsh.py | 保存先フォルダ（iCloud など）との同期・共有メニュー |
| native.py / appsrv.py / bundle.py / bundle2.py | IPA（アプリ）と同じ読み込み方での確認 |
| regress_new.py / regress_old.py | 読み取りの回帰テスト（新旧の比較） |
| one.py / ctr.py / br.py | 1枚だけ読む・その他の確認 |
