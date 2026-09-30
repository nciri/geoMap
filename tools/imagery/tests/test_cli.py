import io
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from imagery import cli

BASE = ["ign", "--bbox", "2.2,48.78,2.47,48.94", "--name", "Paris", "--licence", "Etalab 2.0", "--yes"]


class CliTest(unittest.TestCase):
    def run_cli(self, *args):
        out = io.StringIO()
        converted = []
        with redirect_stdout(out):
            code = cli.main(list(args), fetch=lambda z, x, y: b"jpeg", convert=lambda src, dst: converted.append(dst))
        return code, out.getvalue(), converted

    def test_refuses_without_attribution(self):
        code, out, converted = self.run_cli(*BASE, "--zooms", "10-11", "--out", "/tmp/x.pmtiles")
        self.assertNotEqual(code, 0)
        self.assertIn("attribution", out)
        self.assertEqual(converted, [])

    def test_refuses_above_the_tile_cap(self):
        code, out, converted = self.run_cli(*BASE, "--zooms", "10-17", "--attribution", "© IGN",
                                            "--out", "/tmp/x.pmtiles", "--max-tiles", "100")
        self.assertNotEqual(code, 0)
        self.assertIn("tuiles", out)
        self.assertEqual(converted, [])

    def test_estimates_then_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "paris.pmtiles"
            code, out, converted = self.run_cli(*BASE, "--zooms", "10-11", "--attribution", "© IGN", "--out", str(target))
        self.assertEqual(code, 0)
        self.assertIn("tuiles", out)
        self.assertEqual(converted, [target])


class GdalCliTest(unittest.TestCase):
    GDAL_BASE = ["gdal", "input.tif", "--name", "Paris", "--licence", "Etalab 2.0",
                 "--attribution", "© IGN", "--zooms", "10-12", "--yes"]

    def fake_gdal(self, source, out, zmax):
        db = sqlite3.connect(out)
        db.executescript(
            "CREATE TABLE metadata (name TEXT, value TEXT);"
            "CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);"
        )
        db.executemany("INSERT INTO metadata VALUES (?, ?)", [("name", "gdal-name"), ("minzoom", "0")])
        db.commit()
        db.close()

    def test_gdal_metadata_keeps_one_row_per_key_with_cli_values(self):
        captured = {}

        def fake_convert(src, dst):
            db = sqlite3.connect(src)
            captured.update(dict(db.execute("SELECT name, value FROM metadata")))
            captured["rows"] = db.execute("SELECT COUNT(*) FROM metadata").fetchone()[0]
            db.close()

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "out.pmtiles"
            out = io.StringIO()
            with mock.patch("imagery.sources.gdal_available", return_value=True), redirect_stdout(out):
                code = cli.main(list(self.GDAL_BASE) + ["--out", str(target)],
                                 convert=fake_convert, gdal=self.fake_gdal)
        self.assertEqual(code, 0)
        self.assertEqual(captured["name"], "Paris")
        self.assertEqual(captured["minzoom"], "10")
        self.assertEqual(captured["attribution"], "© IGN")
        self.assertEqual(captured["licence"], "Etalab 2.0")
        self.assertEqual(captured["rows"], 7)

    def test_refuses_when_gdal_is_not_installed(self):
        out = io.StringIO()
        converted = []
        with mock.patch("imagery.sources.gdal_available", return_value=False):
            with redirect_stdout(out):
                code = cli.main(list(self.GDAL_BASE) + ["--out", "/tmp/x.pmtiles"],
                                 convert=lambda src, dst: converted.append(dst))
        self.assertEqual(code, 2)
        self.assertIn("GDAL", out.getvalue())
        self.assertEqual(converted, [])
