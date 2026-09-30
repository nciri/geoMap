import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

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
