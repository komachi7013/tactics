"""Regression: moving boot soles must not move or resize the head."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('normalizer',ROOT/'scripts/normalize-walk-root.py')
norm=importlib.util.module_from_spec(spec);spec.loader.exec_module(norm)


class RootRegistration(unittest.TestCase):
    def test_boot_height_changes_do_not_pump_head_or_clip_canvas(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'artifacts',prefix='root-registration-test-') as tmp:
            path=Path(tmp);source=path/'source';keyed=source/'keyed-native24'
            for name in ['frames-clean','frames-raw']:(keyed/name).mkdir(parents=True)
            def figure(size,ground):
                im=Image.new('RGBA',(size,size));d=ImageDraw.Draw(im);s=size/256
                d.ellipse((108*s,30*s,148*s,70*s),fill='#62402b')
                d.rectangle((100*s,70*s,156*s,180*s),fill='#5b7b82')
                for x in [106,138]:d.rectangle((x*s,180*s,(x+12)*s,ground*s),fill='#56514b')
                return im
            master=source/'master.png';figure(256,240).save(master)
            for i,ground in enumerate([220,230,250]):
                im=figure(512,ground);im.save(keyed/'frames-clean'/f'{i:03d}.png')
                raw=Image.new('RGBA',im.size,'#ff00ff');raw.alpha_composite(im);raw.convert('RGB').save(keyed/'frames-raw'/f'{i:03d}.png')
            out=path/'normalized';m=norm.normalize(source,[0,1,2],master,out,keyed_directory='keyed-native24',padding=32)
            self.assertLess(m['finalHeadYDriftDisplayPx'],1.6)
            self.assertEqual(m['edgePixels'],0)
            with Image.open(out/'frame_000.png') as frame:self.assertEqual(frame.size,(320,320))
            grounds=[]
            for i in range(3):
                with Image.open(out/f'frame_{i:03d}.png') as frame:grounds.append(frame.getbbox()[3])
            self.assertGreater(max(grounds)-min(grounds),20)


if __name__=='__main__':unittest.main()
