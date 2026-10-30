# Fromjapan 撮影画面（8桁番号入力版） 仕様 v1 2026-10-29

## 目的

ジグザグ用の撮影画面（zigzag_shoot_20261026_v1.html）を Fromjapan 用に複製した。
ジグザグとの違いは、袋のラベルのバーコードを読む代わりに、ラベルの「(検)」の右にある8桁の数字を手で入力する点だけ。

## 決定事項

- 鍵は8桁の数字（例 24130242）。管理番号もこの8桁をそのまま使う。Z番号は発行しない
- 同じ番号は1回しか登録できない。2回目は API が 409 number_registered を返し、画面に「この番号は登録済みです」と出す
- 番号を入れた時点で登録済みかを調べ、登録済みなら主ボタンを押せなくする
- 作業者 URL（?w=）はジグザグと同じ zz_workers を使う。既存の作業者リンクのまま使える
- 候補リスト（先方の商品リスト）は任意。fj_candidates にその番号の行が無ければ、写真だけから商品名を作る
- 写真は mercari-images リポジトリの recoreimages/fromjapan/<8桁>_<n>.jpg に置く

## 現在の成果物

| 種類 | 場所 |
|---|---|
| 画面 | fromjapan_shoot_20261030_v2.html（入口 fromjapan.html） |
| API | Supabase Edge Function fromjapan-shoot（配備済み、verify_jwt=false、zigzag-shoot と同じ環境変数） |
| API の元コード | supabase/functions/fromjapan-shoot/{index.ts,handler.ts} |
| テーブル | fj_candidates / fj_shots（migration fromjapan_shoot_tables で作成済み、RLS 有効・匿名は不可） |
| テスト | tests/fromjapan_shoot_code.test.js（node --test tests/ で全件通過） |

画面の URL: https://osako0710.github.io/recore-image-uploader/fromjapan.html?w=<作業者ID>
動作確認用: ?mock=1 を付けると API を使わずに動く。番号 99999999 は登録済みの例、00000000 は候補なしの例

## API

- GET ?w=&code=12345678 → { code, candidates[], registered: {management_no, created_at} | null }
- POST {action:'draft', w, code, photos[2〜3], candidate_id?, prev_name?} → 下書き
- POST {action:'save', w, code, client_id, candidate_id, condition, quantity, photos[2〜8], draft, memo} → { ok, management_no, photo_urls }
- 主なエラー: bad_code（8桁でない）、number_registered（409）、worker_forbidden（403）、rate_limited（429）

## fj_candidates の列

candidate_id, source_key（一意）, code（8桁）, product_name, remaining, shop, ref_url, ref_title, list_class
先方のリストを取り込むときは、1行ごとに code と product_name を入れる。

## 未確定

- Fromjapan から商品リストが来るか（来るなら列の対応を決めて fj_candidates に取り込む）
- 作業者をジグザグと分けるか（分けるなら zz_workers に Fromjapan 用の行を足すだけで足りる）
- ラベルの「#980662」（注文番号らしき番号）を控えるか。現状は使わない
- 出品側の取り込み（fj_shots → ReCORE）の経路。ジグザグの zz_shots と同じ列構成にしてある

## 次にやること

1. 実機（スマホ）で番号入力→撮影→登録を1件通す
2. 2件目で同じ番号を入れ、登録済みの表示を確かめる
3. Fromjapan の商品リストが届いたら fj_candidates へ取り込む
