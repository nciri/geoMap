import sqlite3
import tempfile
import unittest
from pathlib import Path

from imagery import mbtiles, tiles

PARIS = (2.20, 48.78, 2.47, 48.94)


class TileMathTest(unittest.TestCase):
    def test_single_tile_at_zoom_zero(self):
        self.assertEqual(tiles.tile_range(PARIS, 0), [(0, 0, 0)])

    def test_known_tile_contains_les_halles(self):
        self.assertIn((15, 16597, 11272), tiles.tile_range(PARIS, 15))

    def test_count_grows_about_four_times_per_zoom(self):
        low, high = tiles.count(PARIS, 14, 14), tiles.count(PARIS, 15, 15)
        self.assertGreater(high, 3 * low)
        self.assertEqual(tiles.count(PARIS, 14, 15), low + high)


class MbtilesTest(unittest.TestCase):
    def test_writes_tms_rows_and_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.mbtiles"
            mbtiles.write(path, {"name": "t", "format": "jpg", "attribution": "© IGN"}, [((1, 0, 0), b"jpeg")])
            db = sqlite3.connect(path)
            self.assertEqual(db.execute("SELECT tile_row FROM tiles").fetchone()[0], 1)
            self.assertEqual(dict(db.execute("SELECT name, value FROM metadata"))["attribution"], "© IGN")
            db.close()
