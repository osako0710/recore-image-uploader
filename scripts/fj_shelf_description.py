#!/usr/bin/env python3
"""棚番を Shops の説明欄の FJ 番号の横に入れた新しい説明を CSV に出す（dry-run のみ）。

使い方:
  python3 scripts/fj_shelf_description.py products.jsonl out.csv

Shops への書き込み（--apply --confirm）は承認後に足す。このスクリプトは読むだけで何も更新しない。
"""
import csv
import json
import re
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from fj_sync_listings import FJ_RE, load_env, rpc  # noqa: E402

SHELF_RE = re.compile(r"[ 　]*[（(]?棚[:：][^\s）)]+[）)]?")


def with_shelf(description, shelf):
    """説明の最初の FJ 番号の直後に「 棚:<棚番>」を入れる。前の棚番があれば置き換える。"""
    m = FJ_RE.search(description or "")
    if not m:
        return None
    head, tail = description[:m.end()], description[m.end():]
    tail = SHELF_RE.sub("", tail, count=1) if SHELF_RE.match(tail) else tail
    return f"{head} 棚:{shelf}{tail}"


def main():
    src, out = sys.argv[1], sys.argv[2]
    env = load_env()
    marks = {m["product_id"]: m for m in rpc(env, "fj_latest_shelf_marks", {"token": env["FJ_SYNC_TOKEN"]})}
    n = 0
    with open(out, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, lineterminator="\r\n")
        w.writerow(["product_id", "management_no", "shelf", "fj_found", "changed"])
        for line in open(src, encoding="utf-8"):
            p = json.loads(line)
            mark = marks.get(p.get("id"))
            if not mark:
                continue
            new = with_shelf(p.get("description") or "", mark["shelf"])
            w.writerow([p["id"], mark["management_no"], mark["shelf"], new is not None, new is not None and new != p.get("description")])
            n += 1
    print(f"{n} 件を {out} に出しました（Shops は更新していません）")


if __name__ == "__main__":
    main()
