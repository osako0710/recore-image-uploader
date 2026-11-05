# FJ 出品照合と棚番登録 spec（2026-11-02 v1）

## 目的

袋のラベルの8桁を入れたとき、その商品がメルカリShops に出品済みかを撮影画面で判定する。出品済みなら棚番だけを登録し、未出品なら撮影と棚番の登録へ進む。出品漏れと重複出品を防ぎ、発送時のピックを棚番で引けるようにする。依頼元は倉庫の玉城さん（#倉庫関連 2026-11-02 のスレッド）。

## 入口と画面の流れ

- 入口は今までと同じ `https://osako0710.github.io/recore-image-uploader/fromjapan.html?w=<作業者ID>`。
- 8桁を入れて「この番号で進む」を押すと、サーバーが出品の状態を返す。画面は状態ごとに次のどれかになる。

| 状態 | 画面 | 主ボタン | 記録 |
| --- | --- | --- | --- |
| 出品中 | 「出品中の商品です」と FJ 番号、商品名、棚番の入力欄 | 棚番を登録 | fj_shelf_marks（kind=listed） |
| 売れた出品だけがある | 「売れた商品です。棚に置かずに担当者へ渡してください」 | 担当者に渡す | fj_shelf_marks（kind=sold_hold） |
| 撮影済み | 今までどおり「この番号は登録済みです」 | 番号を直す | なし |
| 出品なし | 今までどおりの撮影。状態の下に棚番の入力欄を足す（必須） | 登録して次へ | fj_shots.shelf |

- 出品なしのとき、AI が商品名を作ったあとに、8桁が管理コードに入っていない古い FJ 出品から似た名前を最大3件出す。作業者が「この出品と同じ」を押したら、出品中と同じく棚番だけを登録する（kind=listed_by_name、出品の product_id を残す）。「どれでもない」を押したら撮影の登録を続ける。
- 棚番は端末に前回の値を残し、次の商品で最初から入れておく。全角は半角に直し、大文字にそろえる。20字まで。

## データ

- `fj_listings`：Shops の FJ 出品の写し。列は product_id（主キー）、management_no（8桁、無ければ null）、fj_no、name、status、stock、synced_at。FJ 出品は出品名か説明に `FJ` と3桁以上の数字を含むものとする。
- `fj_shelf_marks`：出品済みの商品に付けた棚番。列は mark_id、management_no、shelf、kind、product_id、worker_id、client_id（二重送信防止）、created_at。
- `fj_shots.shelf`：未出品の商品を撮影したときの棚番。
- 似た名前の検索は pg_trgm の類似度で行う関数 `fj_similar_listings(q, n)` にする。対象は management_no が null の出品だけ。
- 同期は Mac から行う。Edge Function からは Shops API を呼べない（IP 許可の制限）。`fj_sync_listings(token, rows)` 関数は security definer で、トークンのハッシュを照合してから upsert する。トークンは `~/mono-hq/.env` の `FJ_SYNC_TOKEN` に置き、画面には出さない。

## 出品状態の決め方

- 8桁で fj_listings を引き、出品中の行が1件でもあれば「出品中」とする。
- 出品中が無く、売れた行（売り切れ）だけがあれば「売れた出品だけがある」とする。現物があるのに売れている状態は二重売却の予備軍として扱い、棚に戻さず保留にする。
- 行が無ければ「出品なし」。同じ8桁に出品中が2件以上あれば画面は出品中のまま、照合結果に件数を返し、同期スクリプトの報告に重複として出す。

## 説明欄への棚番の追記

- `scripts/fj_shelf_description.py` を置く。fj_shelf_marks から出品ごとの最新の棚番を取り、説明欄の FJ 番号の横に `棚:<棚番>` を入れた新しい説明を CSV に出す（dry-run）。
- Shops への書き込み（`--apply --confirm`）は大迫さんの承認後に作る。この PR では dry-run だけにする。

## 出品名への棚番の追記（2026-11-05 追加）

- Fromjapan の相沢さんから、棚番を出品名に入れてほしいと依頼があった（2026-11-05）。出品名にある【FJ0526】は以前の棚番だった。
- `scripts/fj_shelf_description.py` は新しい出品名も CSV に出す（`new_name` 列）。出品名の末尾に ` 【<棚番>】` を付け、前の棚番タグと【FJ番号】タグは外す。
- 説明欄に FJ 番号が無い出品は【FJ番号】タグを残す。出品照合が FJ 番号で出品を見つけられるようにするため。
- これから出品する商品も、出品名の末尾に ` 【<棚番>】` を付ける。棚番は fj_shots.shelf を使う。

## 対象パス

- recore-image-uploader: `supabase/functions/fromjapan-shoot/handler.ts`、`fromjapan_shoot_20261030_v2.html`、`tests/fromjapan_shoot_*`、`supabase/migrations/`、`scripts/`
- Supabase pqfsanwopptslgdrdebn：上の2テーブル、1列、2関数

## 完了条件

1. 同期スクリプトで Shops の FJ 出品が fj_listings に入り、件数（8桁あり、なし、状態ごと）が出る。
2. 入口から8桁を入れ、出品中、売れた、出品なしの3通りで上の画面になる（本番の Edge Function と GitHub Pages で確かめる）。
3. 棚番が fj_shelf_marks と fj_shots.shelf に入る。
4. `node --test tests/` が通る。

## 大迫さんに決めてもらう点

- ReCORE の出品も照合に含めるか（今回は Shops だけ）。
- 説明欄への自動書き込みを行うか。
- 売れているのに現物がある商品をどう扱うか（今回は保留にして担当者へ渡す）。
