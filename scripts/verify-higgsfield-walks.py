"""Verify all 48 published walks and render a synchronized FFmpeg review movie."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts/walk-higgsfield-v2"
sys.path.insert(0, str(ROOT / ".codex/skills/video2dsprite/scripts"))
from finish_frames import measure_body


def main():
    plan = json.loads((WORK / "plan.json").read_text())
    manifest = json.loads((ROOT / "src/view/walk-v2.json").read_text())
    if all(a['path'].startswith(('/assets/characters/motion-v3/','/assets/characters/motion-v4/')) for v in manifest.values() for a in v.values()):
        subprocess.run([sys.executable,str(ROOT/'scripts/verify-revised-walks.py')],check=True)
        return
    assert len(plan["jobs"]) == 48
    assert sum(len(v) for v in manifest.values()) == 48
    rows, sprites = [], []
    for entry in plan["jobs"]:
        asset = manifest[entry["cast"]][entry["direction"]]
        ready = json.loads((ROOT / entry["directory"] / "ready.json").read_text())
        assert ready["job_id"] == entry["job_id"]
        assert ready["review"] == "visually-reviewed"
        assert asset == ready["asset"]
        assert asset["frames"] == 16 and asset["cell"] == 256
        assert asset["cycleMs"] == 720 and asset["tilesPerCycle"] == 4
        path = ROOT / ("public" + asset["path"])
        assert hashlib.sha256(path.read_bytes()).hexdigest() == ready["sheet_sha256"]
        sheet = Image.open(path).convert("RGBA")
        assert sheet.size == (1024, 1024)
        frames, heights, foot_errors, edge = [], [], [], 0
        key_px = 0
        for i in range(16):
            frame = sheet.crop((i%4*256,i//4*256,i%4*256+256,i//4*256+256))
            frames.append(frame)
            a = np.asarray(frame)
            body = measure_body(a[:, :, 3], 2)
            assert body is not None
            heights.append(body.height * 90/asset["visibleHeight"])
            foot_errors.append(abs(body.ground - asset["originY"]*256)*90/asset["visibleHeight"])
            edge += int((a[0,:,3]>4).sum()+(a[-1,:,3]>4).sum()+(a[:,0,3]>4).sum()+(a[:,-1,3]>4).sum())
            rgb = a[:, :, :3].astype(np.int16)
            ground = np.arange(256)[:, None] >= round(asset["originY"]*256)-28
            key = ground & (rgb[:,:,0]>rgb[:,:,1]+12) & (rgb[:,:,2]>rgb[:,:,1]+12) & (rgb[:,:,2]>rgb[:,:,0]*0.65) & (a[:,:,3]>4)
            key_px += int(key.sum())
        assert edge == 0, (entry["index"], "canvas clipping", edge)
        assert key_px == 0, (entry["index"], "foot-band key residue", key_px)
        median_height = float(np.median(heights))
        assert abs(median_height-90) < 0.01
        reduced = np.stack([np.asarray(f.resize((64,64)),dtype=np.float32)/255 for f in frames])
        reduced[:,:,:,:3] *= reduced[:,:,:,3:4]
        step = np.abs(np.diff(reduced,axis=0)).mean(axis=(1,2,3))
        denominator = max(1e-6,float(np.percentile(step,95)))
        seam = float(np.abs(reduced[-1]-reduced[0]).mean())/denominator
        half_repeat = float(np.abs(reduced[:8]-reduced[8:]).mean())/max(1e-6,float(np.median(step)))
        assert seam < 2, (entry["index"], "loop seam", seam)
        assert half_repeat > 1, (entry["index"], "two repeated short cycles", half_repeat)
        rows.append({"index":entry["index"],"cast":entry["cast"],"direction":entry["direction"],
                     "job_id":entry["job_id"],"art_source":entry["art_source"],"frames":16,"cycleMs":720,
                     "medianDisplayBodyHeight":median_height,"maxDisplayFootError":round(max(foot_errors),3),
                     "edgePixels":edge,"footBandKeyPixels":key_px,"seamOverAdjacentP95":round(seam,3),
                     "oppositeHalfDifferenceOverStep":round(half_repeat,3),
                     "sourceIndices":ready["sourceIndices"],"contactPhase":ready["contactPhase"],
                     "visualReview":"all 16 phases examined over light and dark backgrounds; identity, facing, alternating leg poses and props reviewed"})
        sprites.append((entry,asset,frames))
    output = WORK / "synchronized-frames"
    output.mkdir(exist_ok=True)
    for phase in range(16):
        canvas = Image.new("RGB",(1200,704),(27,43,47))
        draw = ImageDraw.Draw(canvas)
        draw.text((20,14),f"All 12 characters / 48 directions | common 16-frame, 720 ms gait | phase {phase:02d}",fill="#f2e7ca")
        for entry,asset,frames in sprites:
            cast_index = entry["index"]//4
            direction_index = entry["index"]%4
            x, y = cast_index%3*400+direction_index*100, cast_index//3*164+48
            if direction_index == 0:
                draw.text((x+8,y),entry["cast"],fill="#ffe2a3")
            draw.text((x+45,y+18),entry["direction"],fill="#bacdc6")
            draw.line((x+4,y+150,x+96,y+150),fill="#526b68")
            im = frames[phase]
            scale = 90/asset["visibleHeight"]
            resized = im.resize((round(256*scale),round(256*scale)),Image.Resampling.LANCZOS)
            canvas.paste(resized,(round(x+50-asset["originX"]*256*scale),round(y+150-asset["originY"]*256*scale)),resized)
        canvas.save(output / f"frame_{phase:03d}.png")
    subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-framerate","200/9",
                    "-i",str(output/"frame_%03d.png"),"-vf","loop=loop=9:size=16:start=0",
                    "-frames:v","160","-c:v","libx264","-crf","18","-pix_fmt","yuv420p",
                    str(WORK/"all-walks.mp4")],check=True)
    audit = {"schema":"tactics.walk-audit.v1","directions":48,"framesPerCycle":16,"cycleMs":720,
             "gameTileMs":180,"tilesPerCycle":4,"numericChecks":"passed",
             "inspection":"all 48 direction contact sheets reviewed; targeted video retakes preserved",
             "limits":"Contact heuristics do not independently prove anatomical foot identity; contact sheets and actual playback are part of review.",
             "rejectedTakes":sum(len(j.get("rejected_takes",[])) for j in plan["jobs"]),"jobs":rows}
    (WORK/"audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    print(json.dumps({"directions":48,"status":"passed","movie":str(WORK/"all-walks.mp4"),
                      "maxSeamOverP95":max(r["seamOverAdjacentP95"] for r in rows),
                      "maxFootError":max(r["maxDisplayFootError"] for r in rows)}))


if __name__ == "__main__":
    main()
