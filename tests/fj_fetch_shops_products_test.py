import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import fj_fetch_shops_products as f  # noqa: E402
import fj_sync_listings as s  # noqa: E402


class IsFjTest(unittest.TestCase):
    def test_sku_8digit_starting_with_2(self):
        self.assertTrue(f.is_fj({"name": "ポケモンカード", "variants": [{"skuCode": "23276906"}]}))

    def test_fj_date_number(self):
        self.assertTrue(f.is_fj({"name": "カメラ 【FJ0526】", "variants": []}))

    def test_noise_numbers_are_not_fj(self):
        self.assertFalse(f.is_fj({"name": "スープジャー SFJ-300", "variants": [{"skuCode": "mybest_7903"}]}))
        self.assertFalse(f.is_fj({"name": "HFJ409 フィギュア", "variants": [{"skuCode": "W2411241430"}]}))


class ToRowTest(unittest.TestCase):
    def test_sold_listing_without_fj_number_is_kept(self):
        row = s.to_row({"id": "p1", "name": "ポケモンカード", "status": "OPENED",
                        "variants": [{"skuCode": "23276906", "stockQuantity": 0}]})
        self.assertEqual(row["management_no"], "23276906")
        self.assertIsNone(row["fj_no"])
        self.assertEqual(row["status"], "sold")


if __name__ == "__main__":
    unittest.main()
