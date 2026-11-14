# CLAUDE.md — KAKU の作業の引き継ぎ

最初に全部読んでから作業すること。分からないことは決めつけずに、かつに聞く。

## 相手と話し方

- 持ち主は **かつ**（現場仕事の人。週末の会社でリフォームの見積もりに使う）。Claude のことは「くらちゃん」と呼ぶ
- **会話は関西弁のフランクな口調**。ただし **アプリの画面の文言は標準語**（「〜してください」）。画面に関西弁を入れない
- 会話を勝手にまとめて「休もう」「おやすみ」で締めない
- 前のやりとりを踏まえて話す。分からない時は言い切らずに聞き直す
- 専門用語やファイル名・コードの話は最小限。何ができるようになったかを、現場の言葉で伝える

## アプリ

- 見積もりワークスペース **KAKU**（PWA、ES モジュールの素の JS、保存は IndexedDB）
- 公開：https://katsu1007.github.io/kaku-estimate/ （main に push すると GitHub Pages に出る）
- iPhone アプリ（IPA）：https://github.com/katsu1007/kaku-estimate/releases/download/ipa-latest/Kaku.ipa （LiveContainer で入れて使っている）
- 案件を開くと ①現場 → ②部屋 → ③工事 → ④確認 → ⑤書類
- `old/` は前のKAKU（1枚の大きな HTML）。図面の読み取り・照明の配置・3D・電気を数えるは、**前のKAKUのコードを裏の iframe で動かして結果だけもらう**（精度を変えないため。`old/` の読み取りの中身は基本いじらない）
  - `js/legacy.js` の `getReader()` が `./old/index.html?reader=1` を隠し iframe で開く。前のKAKUの `let` の変数は `W.eval(...)` で読み書きする
  - 3D は `./old/index.html?view3d=1`（`js/view3d.js`）

### 大事な約束（守らないと壊れる・困る）

- **変更したら必ず `sw.js` の `VERSION` を上げる**（古いキャッシュが残る）。新しい JS ファイルを足したら `sw.js` の一覧にも足す
- パスは `./old/index.html` のように **index.html まで書く**（IPA の中では `./old/` で開けない）
- 前のKAKUからの移行は「全部移す」が方針。前のKAKUにあった機能・ボタン・長押し・ドラッグが新しい画面に無いのは不具合として扱う（何度も指摘されている）

### 主なファイル

| ファイル | 中身 |
|---|---|
| js/app.js | 起動・画面の切り替え・保存のまとめ役 |
| js/project.js | 案件の①〜④。図面の作業（部屋を作る・器具を直す・壁の解体と仕上げ・カッター・照明と配線・器具を置く・測る）もここ |
| js/planview.js | 図面の表示（拡大・ずらす・長押しの虫めがね・ドラッグ・通り芯・下に敷いた図） |
| js/calc.js | 計算（画面に触らない。部屋の寸法、壁から引く分 `wallOff`、寸法を足す・引く `parts`） |
| js/lighting.js | 照明の数・スイッチ・配線（前のKAKUの KW_calc を移した物） |
| js/roomfin.js | 部屋の仕上げ（床・壁・天井・巾木） |
| js/place.js | 器具を図面に置く（1個ずつ・並べる・壁に沿って） |
| js/elec.js | この図面の電気を数える（前のKAKUの KE_* を裏で使う） |
| js/sketch.js / sketchui.js | 寸法で間取りを作る・なぞって拾う（PDF・写真を下に敷く、縮尺合わせ） |
| js/view3d.js | 3D（前のKAKUの3Dに中身を渡す） |
| js/floors.js | 階ごとの内訳 |
| js/sync.js / syncplan.js | 保存先フォルダ（iCloud・Google Drive・OneDrive）と同期。1案件1ファイル（.kaku.json）＋見られる .xlsx |
| js/store.js | IndexedDB・前のKAKUからの引き継ぎ・バックアップ。アプリ（IPA）の中ではネイティブ側にも控える |
| js/legacy.js | 前のKAKUを裏で動かす部分 |
| ios/ | iPhone アプリの Xcode 設定と Swift（`kaku://` で中身を出す、保存・共有・PDF・フォルダの橋渡し） |

## テスト

- 計算のテスト：`for f in tests/*.test.mjs; do node $f; done`（全部通ること）
- 画面のテスト：`tests/e2e/README.md` を見る（Playwright + Chrome、`sh tests/e2e/srv.sh` でポート 8765）
- 読み取りの回帰テスト：`KAKU_TESTS=../gaisan/kaku-tests python3 tests/regress_drawing.py`
  - 図面と正解は **katsu1007/gaisan リポジトリの `kaku-tests/`**（このリポジトリには入れない）

### テストの方針（かつと決めたこと）

- **自分でテスト用データを作って、自分で採点しない**（都合のいい結果になるので）。正解は別の担当が作った物か、かつが教えた物だけ
- 読み取りテストは **5枚セット**：新しい図面3枚（新しい苦手を見つける）＋前に失敗した図面2枚（再テスト）
- 直したら全部の図面で回して、**前に通っていた所が悪くなっていないか**毎回確かめる。通った結果は基準（baseline）として固める
- 失敗は原因ごとに分ける。直す前と後を比べる。テストの答えに合わせすぎない。実際の JWW でも確かめる

### お客さんの図面（実図面）

- **絶対にリポジトリ（どれにも）に入れない**。「関係者外秘」と書いてある物もある
- 手元では `.real/` に置く（`.gitignore` 済み）。e2e は `KAKU_REAL_TOILET` で場所を変えられる
- 今あるもの：現場のトイレの JWW（区画29・大便器18・小便器15・カウンター6・SK3・コンセント24）、2026-11-15 にもらった4枚（下の「残り」）

## コミットと公開

- コミットの名前：`git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit ...`
- push の前に `git fetch -q origin main`（必要なら rebase）してから `git push origin HEAD:main`
- コミットメッセージは日本語で何をしたか。最後にこのセッションの決まった署名行を付ける

### IPA を作り直す

1. `ios/project.yml` の `CURRENT_PROJECT_VERSION` を1つ上げる
2. `sh tools/pack-ios.sh`（`kaku-ios.zip` ができる）
3. コミットして push → GitHub Actions の「Build KAKU IPA」が IPA を作って release `ipa-latest` に出す（`gh run list --workflow build-ipa.yml` で確認）

## 残り（2026-11-15 時点）

- **新しい図面4枚の読み取りテスト**：かつに正解（大便器・小便器・洗面・SK・浴槽などの数）を聞いている途中。正解をもらったら 4枚＋前の失敗図面1枚で回す
  - ①ある工場の現況図（DXF）：区画193、便器14・洗面カウンター12
  - ②ある自動車学校の提案図（DXF）：区画163、便器7・洗面カウンター12・浴槽2・流し4
  - ③0530（JWW）：区画264、浴槽10・洗面カウンター3・SK1
  - ④トイレの平面図（JWW）：区画50、洗面カウンター1 だけ。**図には大便器・小便器がたくさんあるのに拾えていない**（失敗の可能性が高い）
  - 4枚とも建築の図面で、電気の書き込みは無い
- 「電気を数える」は電気屋さんが書き込んだ図面でまだ試していない（かつに電気の図面をもらったら確かめる）
- 通り芯：Shift_JIS の「通り芯」という名前のレイヤーの DXF だと線が出ない（`GRID` なら出る）。原因は未調査
- 前のKAKUとの抜けが他に無いか、見つけたら直す（ボタン65個・長押し・ドラッグは一度洗い出し済み）
