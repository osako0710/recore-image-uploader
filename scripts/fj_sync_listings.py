#!/usr/bin/env python3
"""メルカリShops の FJ 出品を Supabase の fj_listings に写す。

使い方:
  python3 scripts/fj_sync_listings.py products.jsonl            # 件数だけ出す（書き込まない）
  python3 scripts/fj_sync_listings.py products.jsonl --apply    # fj_listings に書き込む

products.jsonl は Shops GraphQL の products を1行1件で保存したもの
（id, name, status, description, variants{skuCode, stockQuantity}）。
Shops API は社内の固定 IP からしか呼べないので、取得は Mac 側で行い、このスクリプトはファイルを読むだけにしている。
環境変数: SUPABASE_URL, SUPABASE_ANON_KEY, FJ_SYNC_TOKEN（~/mono-hq/.env から読む）。
"""
import argparse
import collections
import datetime
import json
import os
import re
import sys
import urllib.request

FJ_RE = re.compile(r"FJ\s*-?\s*(\d{2,})", re.IGNORECASE)
CODE_RE = re.compile(r"^\d{8}$")
FJ_CODE_RE = re.compile(r"^2\d{7}$")
BATCH = 500


def load_env(path=os.path.expanduser("~/mono-hq/.env")):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.rstrip("\n").split("=", 1)
                env[k.strip()] = v.strip().strip('"\'')
    for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "FJ_SYNC_TOKEN"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def norm_status(status, stock):
    s = str(status or "").lower()
    if s in ("on_sale", "opened", "open", "published", "active"):
        # 在庫が0なら売り切れとして扱う
        return "on_sale" if stock > 0 else "sold"
    # UNOPENED は非公開で登録した出品。公開停止と同じく「登録済み・非公開」として扱う
    if s in ("stopped", "closed", "unpublished", "draft", "private", "unopened"):
        return "stopped"
    if s in ("sold_out", "sold", "soldout"):
        return "sold"
    return s or "unknown"


def to_row(p):
    text = f"{p.get('name') or ''}\n{p.get('description') or ''}"
    m = FJ_RE.search(text)
    variants = p.get("variants") or []
    skus = [str(v.get("skuCode") or "").strip() for v in variants]
    code = next((s for s in skus if CODE_RE.match(s)), None)
    # FJ 番号が無くても、SKU が2で始まる8桁なら FJ の出品として扱う（売れた出品の多くは FJ 番号を持たない）
    # 画面確認対象の 8 桁 SKU（例: 23043853）は 2 始まりなのでこの条件に入る。
    if not m and not (code and FJ_CODE_RE.match(code)):
        return None
    stock = sum(int(v.get("stockQuantity") or 0) for v in variants)
    return {
        "product_id": p["id"],
        "management_no": code,
        "fj_no": "FJ" + m.group(1) if m else None,
        "name": (p.get("name") or "")[:300],
        "status": norm_status(p.get("status"), stock),
        "stock": stock,
        "sku_kind": "8桁" if code else ("空" if not any(skus) else "その他"),
    }


def build(path):
    rows, seen, total = [], set(), 0
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        total += 1
        p = json.loads(line)
        if p.get("id") in seen:
            continue
        seen.add(p.get("id"))
        r = to_row(p)
        if r:
            rows.append(r)
    return total, rows


def summarize(total, rows):
    by = collections.Counter((r["sku_kind"], r["status"]) for r in rows)
    listed = collections.Counter(r["management_no"] for r in rows if r["management_no"] and r["status"] in ("on_sale", "stopped"))
    dups = {k: v for k, v in listed.items() if v > 1}
    return {
        "shops_products": total,
        "fj_products": len(rows),
        "with_code": sum(1 for r in rows if r["management_no"]),
        "without_code": sum(1 for r in rows if not r["management_no"]),
        "by_kind_status": {f"{k}/{s}": n for (k, s), n in sorted(by.items())},
        "duplicate_listed_codes": len(dups),
        "duplicate_examples": sorted(dups)[:10],
    }


def rpc(env, name, payload):
    req = urllib.request.Request(
        env["SUPABASE_URL"].rstrip("/") + f"/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode(),
        headers={"apikey": env["SUPABASE_ANON_KEY"], "Authorization": "Bearer " + env["SUPABASE_ANON_KEY"],
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read() or b"null")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jsonl")
    ap.add_argument("--apply", action="store_true", help="fj_listings に書き込む")
    ap.add_argument("--min-products", type=int, default=1000,
                    help="取得件数がこれ未満なら書き込まない（取得途中のファイルで消し込みをしないため）")
    a = ap.parse_args()
    total, rows = build(a.jsonl)
    print(json.dumps(summarize(total, rows), ensure_ascii=False, indent=1))
    if not a.apply:
        return
    if total < a.min_products:
        sys.exit(f"取得件数 {total} が少なすぎるので書き込みません（--min-products {a.min_products}）")
    env = load_env()
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "FJ_SYNC_TOKEN") if not env.get(k)]
    if missing:
        sys.exit("環境変数がありません: " + ", ".join(missing))
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload_rows = [{k: v for k, v in r.items() if k != "sku_kind"} for r in rows]
    # FJ 出品が0件でも最後の呼び出しを1回送り、前回までの行を消し込む。
    for i in range(0, max(len(payload_rows), 1), BATCH):
        last = i + BATCH >= len(payload_rows)
        out = rpc(env, "fj_sync_listings", {"token": env["FJ_SYNC_TOKEN"], "rows": payload_rows[i:i + BATCH],
                                            "finish": last, "started": started})
        print(f"{min(i + BATCH, len(payload_rows))}/{len(payload_rows)}", out)


if __name__ == "__main__":
    main()
