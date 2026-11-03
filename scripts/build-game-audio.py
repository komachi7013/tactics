#!/usr/bin/env python3
"""Reproduce audio v2 through the project rpg-music skill; no network or install.
Editable score, renders, metadata and listening files live in the production
folder. Existing completed BGM results are reused. This does not publish audio.
"""
from pathlib import Path
import runpy,sys
ROOT=Path(__file__).resolve().parent.parent
if Path(sys.executable).resolve()!=(ROOT/'.venv/bin/python').resolve():
 raise SystemExit('Use project .venv/bin/python')
runpy.run_path(str(ROOT/'audio-production/v2-20261026/build.py'),run_name='__main__')
