#!/usr/bin/env python3
"""棚番を Shops の出品名の末尾【棚番】と、説明欄の FJ 番号の横に入れた新しい出品名・説明を CSV に出す（dry-run のみ）。

出品名に棚番を入れるのは Fromjapan の依頼（2026-11-05、#fromjapan スレッド）。

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


# 出品名の【FJ0526】のような古い FJ 番号タグ（どこにあっても対象）
NAME_FJ_TAG_RE = re.compile(r"[ 　]*【FJ\s*-?\s*\d{3,}】")
# 前に入れた棚番タグ。末尾にある、英字と数字の両方を含む英数字（ハイフン可）の形（【1103A】【A-12】【B3】）だけを対象にし、【XL】【DVD】【2024】などの商品情報と【FJ番号】は残す
NAME_SHELF_TAG_RE = re.compile(r"[ 　]*【(?!FJ\s*-?\s*\d)(?=[^】]*\d)(?=[^】]*[A-Z])[A-Z0-9][A-Z0-9-]{0,19}】[ 　]*$")


def with_shelf_name(name, shelf, keep_fj=False):
    """出品名の末尾に「 【<棚番>】」を付ける。【FJ番号】タグと、末尾の前の棚番タグは外す。

    keep_fj=True のとき（説明欄に FJ 番号が無いとき）は【FJ番号】タグを残す。出品照合が FJ 番号で出品を見つけられるようにするため。
    """
    base = (name or "").rstrip()
    if not keep_fj:
        base = NAME_FJ_TAG_RE.sub("", base).rstrip()
    base = NAME_SHELF_TAG_RE.sub("", base).rstrip()
    # 今回の棚番と同じタグが末尾にあれば外す（数字だけの棚番でも二重にしない）
    same = f"【{shelf}】"
    if base.endswith(same):
        base = base[: -len(same)].rstrip()
    if not keep_fj:
        base = NAME_FJ_TAG_RE.sub("", base).rstrip()
    return f"{base} 【{shelf}】"


def main():
    src, out = sys.argv[1], sys.argv[2]
    env = load_env()
    marks = {m["product_id"]: m for m in rpc(env, "fj_latest_shelf_marks", {"token": env["FJ_SYNC_TOKEN"]})}
    n = 0
    with open(out, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, lineterminator="\r\n")
        w.writerow(["product_id", "management_no", "shelf", "fj_found", "changed", "new_description", "name_changed", "new_name"])
        for line in open(src, encoding="utf-8"):
            p = json.loads(line)
            mark = marks.get(p.get("id"))
            if not mark:
                continue
            new = with_shelf(p.get("description") or "", mark["shelf"])
            new_name = with_shelf_name(p.get("name") or "", mark["shelf"], keep_fj=new is None)
            w.writerow([p["id"], mark["management_no"], mark["shelf"], new is not None, new is not None and new != p.get("description"), new or "",
                        new_name != (p.get("name") or ""), new_name])
            n += 1
    print(f"{n} 件を {out} に出しました（Shops は更新していません）")


if __name__ == "__main__":
    main()
