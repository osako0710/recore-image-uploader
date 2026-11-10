#!/usr/bin/env python3
"""メルカリShops の出品から FJ の出品だけを取得し、fj_sync_listings.py が読む JSONL に書き出す。

使い方:
  python3 scripts/fj_fetch_shops_products.py out.jsonl

全件（10万件超）は取らない。FJ の出品は SKU が2で始まる8桁か、出品名・説明に入荷日形の FJ 番号
（FJ0526 など、5〜12月）を持つ。新しい順に取り、FJ の候補が STOP_AFTER_EMPTY 件（既定 15000）
続けて出なかったら止める。2026-11-10 の取得では候補の最大の切れ目が 10,455 件、最後の候補が
44,818 件目だった。並びは出品日の順ではないので、日付では止めない。

Shops API は社内の固定 IP からしか呼べない。先に社内 PC へトンネルを張り、
SHOPS_SOCKS（既定 127.0.0.1:11080）を経由して curl で送る（urllib は SOCKS を使えないため）。
トークンは ~/wms_stock_sync/.env の MERCARI_SHOPS_TOKEN を読む。画面やログには出さない。
"""
import collections
import json
import os
import re
import subprocess
import sys
import time

API = "https://api.mercari-shops.com/v1/graphql"
QUERY = (
    "query($a:String){ products(first:100, after:$a){ pageInfo{ hasNextPage endCursor } "
    "edges{ node{ id name status description variants{ skuCode stockQuantity } } } } }"
)


FJ_DATE_RE = re.compile(r"FJ\s*-?\s*(\d{4})(?!\d)", re.IGNORECASE)
FJ_CODE_RE = re.compile(r"^2\d{7}$")


def is_fj(node):
    """SKU が2始まり8桁か、入荷日形の FJ 番号（5〜12月）を持つ出品なら True。"""
    if any(FJ_CODE_RE.match(str(v.get("skuCode") or "")) for v in node.get("variants") or []):
        return True
    m = FJ_DATE_RE.search(f"{node.get('name') or ''}\n{node.get('description') or ''}")
    return bool(m and 5 <= int(m.group(1)[:2]) <= 12 and 1 <= int(m.group(1)[2:]) <= 31)


def load_token(path=os.path.expanduser("~/wms_stock_sync/.env")):
    if os.environ.get("MERCARI_SHOPS_TOKEN"):
        return os.environ["MERCARI_SHOPS_TOKEN"]
    for line in open(path, encoding="utf-8"):
        if line.startswith("MERCARI_SHOPS_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"\'')
    raise SystemExit("MERCARI_SHOPS_TOKEN がありません")


def call(token, socks, after):
    body = json.dumps({"query": QUERY, "variables": {"a": after}})
    # トークンはコマンドラインに載せず、標準入力からヘッダーとして渡す
    cmd = ["curl", "-s", "--http1.1", "--retry", "5", "--retry-all-errors", "--max-time", "60",
           "--socks5-hostname", socks, API, "-H", "@-", "-H", "Content-Type: application/json", "-d", body]
    failures = 0
    while failures < 3:
        r = subprocess.run(cmd, input=f"Authorization: Bearer {token}\n", capture_output=True, text=True)
        try:
            data = json.loads(r.stdout, strict=False)
            if data.get("data"):
                return data["data"]["products"]
            err = data.get("errors")
        except json.JSONDecodeError:
            err = r.stdout[:200] or r.stderr[:200]
        # 利用量の上限に達したら、回復するまで待って同じページを取り直す（失敗に数えない）
        if "TOO_MANY_REQUESTS" in json.dumps(err):
            time.sleep(30)
            continue
        failures += 1
        time.sleep(2 * failures)
    raise SystemExit(f"Shops API の取得に失敗しました: {err}")


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    out = sys.argv[1]
    token = load_token()
    socks = os.environ.get("SHOPS_SOCKS", "127.0.0.1:11080")
    stop_after = int(os.environ.get("STOP_AFTER_EMPTY", "15000"))
    after, scanned, kept, empty, statuses = None, 0, 0, 0, collections.Counter()
    tmp = out + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        while True:
            page = call(token, socks, after)
            for edge in page["edges"]:
                node = edge["node"]
                scanned += 1
                if not is_fj(node):
                    empty += 1
                    continue
                empty = 0
                kept += 1
                statuses[node.get("status")] += 1
                f.write(json.dumps(node, ensure_ascii=False) + "\n")
            if empty >= stop_after or not page["pageInfo"]["hasNextPage"]:
                break
            after = page["pageInfo"]["endCursor"]
    os.replace(tmp, out)
    print(json.dumps({"scanned": scanned, "fj": kept, "by_status": dict(statuses)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
