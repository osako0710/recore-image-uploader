#!/usr/bin/env python3
"""メルカリShops の全出品を取得し、fj_sync_listings.py が読む JSONL に書き出す。

使い方:
  python3 scripts/fj_fetch_shops_products.py out.jsonl

Shops API は社内の固定 IP からしか呼べない。先に社内 PC へトンネルを張り、
SHOPS_SOCKS（既定 127.0.0.1:11080）を経由して curl で送る（urllib は SOCKS を使えないため）。
トークンは ~/wms_stock_sync/.env の MERCARI_SHOPS_TOKEN を読む。画面やログには出さない。
"""
import collections
import json
import os
import subprocess
import sys
import time

API = "https://api.mercari-shops.com/v1/graphql"
QUERY = (
    "query($a:String){ products(first:100, after:$a){ pageInfo{ hasNextPage endCursor } "
    "edges{ node{ id name status description variants{ skuCode stockQuantity } } } } }"
)


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
    after, total, statuses = None, 0, collections.Counter()
    tmp = out + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        while True:
            page = call(token, socks, after)
            for edge in page["edges"]:
                node = edge["node"]
                statuses[node.get("status")] += 1
                f.write(json.dumps(node, ensure_ascii=False) + "\n")
                total += 1
            if not page["pageInfo"]["hasNextPage"]:
                break
            after = page["pageInfo"]["endCursor"]
    os.replace(tmp, out)
    print(json.dumps({"total": total, "by_status": dict(statuses)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
