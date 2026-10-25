"""SoundFont precedence and ambiguity checks; no renderer or sound assets required."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'bgm', pathlib.Path(__file__).resolve().parents[1] / 'scripts/bgm.py')
bgm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bgm)


class SoundFontSelection(unittest.TestCase):
    def test_selection_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            assets = pathlib.Path(directory).resolve() / 'assets'
            assets.mkdir()
            with patch.object(bgm, 'ASSETS', assets):
                self.assertIsNone(bgm.soundfont_path())
                font = assets / 'orchestra.SF2'
                font.touch()
                self.assertEqual(bgm.soundfont_path(), font)
                default = assets / 'default.sf2'
                default.touch()
                with self.assertRaisesRegex(ValueError, 'multiple'):
                    bgm.soundfont_path()
                self.assertEqual(bgm.soundfont_path(str(font)), font)
                external = assets.parent / 'external.sf2'
                external.touch()
                self.assertEqual(bgm.soundfont_path(str(external)), external)
                with self.assertRaises(ValueError):
                    bgm.soundfont_path(str(assets / 'missing.sf2'))
                wrong = pathlib.Path(directory) / 'wrong.wav'
                wrong.touch()
                with self.assertRaises(ValueError):
                    bgm.soundfont_path(str(wrong))
                nested = assets / 'nested'
                nested.mkdir()
                (nested / 'ignored.sf2').touch()
                default.unlink()
                self.assertEqual(bgm.soundfont_path(), font)


if __name__ == '__main__':
    unittest.main()
