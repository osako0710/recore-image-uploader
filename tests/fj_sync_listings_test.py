import sys, os, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fj_sync_listings  # noqa: E402
from fj_sync_listings import to_row, summarize, norm_status  # noqa: E402
from fj_shelf_description import with_shelf  # noqa: E402


class T(unittest.TestCase):
    def test_row(self):
        r = to_row({"id": "a", "name": "バッグ", "description": "FJ1234 です", "status": "ON_SALE",
                    "variants": [{"skuCode": "24130242", "stockQuantity": 1}]})
        self.assertEqual((r["management_no"], r["fj_no"], r["status"]), ("24130242", "FJ1234", "on_sale"))
        self.assertIsNone(to_row({"id": "b", "name": "バッグ", "description": "", "variants": []}))
        r = to_row({"id": "c", "name": "FJ-555 靴", "status": "ON_SALE", "variants": [{"skuCode": "", "stockQuantity": 0}]})
        self.assertEqual((r["management_no"], r["status"], r["sku_kind"]), (None, "sold", "空"))

    def test_summary_dup(self):
        rows = [{"management_no": "1" * 8, "status": "on_sale", "sku_kind": "8桁"}] * 2
        self.assertEqual(summarize(2, rows)["duplicate_listed_codes"], 1)
        self.assertEqual(norm_status("SOLD_OUT", 0), "sold")

    def test_with_shelf(self):
        self.assertEqual(with_shelf("管理 FJ1234\n本文", "A-12"), "管理 FJ1234 棚:A-12\n本文")
        self.assertEqual(with_shelf("FJ1234 棚:B-1\n本文", "A-12"), "FJ1234 棚:A-12\n本文")
        self.assertIsNone(with_shelf("番号なし", "A-1"))

    def test_empty_sync_finishes(self):
        import tempfile, json as j
        calls = []
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as fh:
            for i in range(3):
                fh.write(j.dumps({"id": str(i), "name": "靴", "description": "", "variants": []}) + "\n")
        old = (sys.argv, fj_sync_listings.load_env, fj_sync_listings.rpc)
        sys.argv = ["x", fh.name, "--apply", "--min-products", "1"]
        fj_sync_listings.load_env = lambda: {"SUPABASE_URL": "u", "SUPABASE_ANON_KEY": "k", "FJ_SYNC_TOKEN": "t"}
        fj_sync_listings.rpc = lambda env, name, payload: calls.append(payload) or {}
        try:
            fj_sync_listings.main()
        finally:
            sys.argv, fj_sync_listings.load_env, fj_sync_listings.rpc = old
        self.assertEqual(len(calls), 1)
        self.assertEqual((calls[0]["rows"], calls[0]["finish"]), ([], True))


unittest.main()
