"""Rebuild the standing comparison with geometry, palette and head-width stages."""
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
for script in ['align-lise-standing-pairs.py','align-standing-direction-pairs.py',
               'match-standing-material-colours.py','match-standing-head-widths.py','shrink-dani-back-heads.py',
               'apply-standing-equipment-corrections.py','apply-standing-arm-corrections.py',
               'redraw-standing-jaw-guides.py']:
    subprocess.run([sys.executable,str(ROOT/'scripts'/script)],cwd=ROOT,check=True)
