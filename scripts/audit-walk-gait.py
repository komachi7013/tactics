"""Audit rendered gait, separately from file/timing contracts.

Image recurrence is a review aid, never evidence of anatomical foot identity.
Acceptance requires contact annotations tied to the exact production sheet hash.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REPORTED = {"lise": "W", "garan": "NESW", "dani": "S", "guard": "W",
            "vesk": "SW", "toma": "W", "worker": "SW"}


def contact_check(annotation, count, cycle_ms, tiles, sheet_hash):
    """Contacts span one complete loop, with the closing event in the next repeat.
    A seam can be at any phase: first contact need not be frame zero.
    """
    if not annotation:
        return {"status": "unverified", "reasons": ["anatomical foot contacts not annotated"]}
    reasons = []
    if annotation.get("sheet_sha256") != sheet_hash:
        reasons.append("annotations do not match the production sheet hash")
    events = annotation.get("contacts", [])
    valid = (len(events) >= 3 and all(isinstance(e.get("frame"), int) and
             e.get("foot") in ("L", "R") for e in events))
    if not valid:
        return {"status": "rejected", "reasons": reasons + ["need at least L/R/L or R/L/R contacts including closure"]}
    frames = [e["frame"] for e in events]
    feet = [e["foot"] for e in events]
    if not (0 <= frames[0] < count) or frames[-1] - frames[0] != count or any(b <= a for a, b in zip(frames, frames[1:])):
        reasons.append("contacts must increase over exactly one loop from an in-loop first contact")
    if any(a == b for a, b in zip(feet, feet[1:])) or feet[0] != feet[-1]:
        reasons.append("feet must alternate and close on the same foot")
    steps = len(events) - 1
    if steps != 2:
        reasons.append("selected loop must contain exactly two alternating steps")
    intervals = np.diff(frames) * cycle_ms / count
    if intervals.min() <= 0 or float(np.max(np.abs(intervals - cycle_ms / 2))) > cycle_ms * .10:
        reasons.append("left/right contact intervals differ by more than 20% of target step time")
    return {"status": "rejected" if reasons else "verified-contacts", "reasons": reasons,
            "stepsPerLoop": steps, "stepsPerSecond": round(steps * 1000 / cycle_ms, 3),
            "tilesPerStep": tiles / steps, "contactIntervalsMs": intervals.tolist()}


def motion_metrics(legs, cycle_ms):
    # Premultiplied colour + alpha, so invisible RGB cannot create motion.
    a = np.stack(legs).astype(np.float32) / 255
    a[:, :, :, :3] *= a[:, :, :, 3:4]
    delta = np.abs(np.roll(a, -1, axis=0) - a).mean(axis=(1, 2, 3))
    median = float(np.median(delta))
    holds = delta < max(.0001, median * .25)
    longest = run = 0
    for hold in list(holds) * 2:
        run = run + 1 if hold else 0
        longest = max(longest, min(len(holds), run))
    lags = []
    for lag in range(2, len(a) // 2 + 1):
        error = float(np.abs(np.roll(a, lag, axis=0) - a).mean())
        lags.append({"lagFrames": lag, "error": round(error, 6),
                     "relativeToAdjacent": round(error / max(median, 1e-8), 3)})
    # Two nearby similar frames are ordinary slow movement, not a subcycle.
    # Require a separated local minimum at least a quarter-loop away.
    candidates = [r for i, r in enumerate(lags) if
                  r["lagFrames"] >= max(4, int(np.ceil(len(a) / 4))) and
                  r["relativeToAdjacent"] < 1.25 and i > 0 and
                  r["error"] < lags[i-1]["error"] and
                  (i == len(lags)-1 or r["error"] <= lags[i+1]["error"])]
    return {"adjacentFootMotion": [round(float(x), 6) for x in delta],
            "motionVariationCv": round(float(delta.std() / max(median, 1e-8)), 3),
            "longestLowMotionMs": round(longest * cycle_ms / len(a), 1),
            "seamOverMedianAdjacent": round(float(delta[-1]) / max(median, 1e-8), 3),
            "similarSubcycleCandidates": candidates, "lagProfile": lags}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT / "artifacts/walk-gait-audit")
    parser.add_argument("--contacts", type=Path)
    parser.add_argument("--strict", action="store_true", help="fail unless all anatomical contact checks pass")
    parser.add_argument("--require-replacements", action="store_true", help="require contact annotation checks for the 12 reported directions and delegation S; does not approve uniformity")
    args = parser.parse_args(); args.out.mkdir(parents=True, exist_ok=True)
    annotations = json.loads(args.contacts.read_text()) if args.contacts else {}
    manifest = json.loads((ROOT / "src/view/walk-v2.json").read_text())
    rows = []; cards = []; template = {}
    for cast, directions in manifest.items():
        for direction, asset in directions.items():
            key = f"{cast}-{direction}"; cell = asset["cell"]; count = asset["frames"]
            path = ROOT / ("public" + asset["path"]); digest = hashlib.sha256(path.read_bytes()).hexdigest()
            meta = json.loads(path.with_suffix(".json").read_text())
            sheet = Image.open(path).convert("RGBA")
            cols = sheet.width // cell
            frames = [sheet.crop((i % cols * cell, i // cols * cell,
                       (i % cols + 1) * cell, (i // cols + 1) * cell)) for i in range(count)]
            ground = round(asset["originY"] * cell)
            top = max(0, round(ground - asset["visibleHeight"] * .38))
            x0 = cell // 2 - 64; x1 = cell // 2 + 64
            legs = [np.asarray(f.crop((x0, top, x1, min(cell, ground + 5))).resize((96, 64))) for f in frames]
            metrics = motion_metrics(legs, asset["cycleMs"])
            ids = meta["sourceIndices"]
            order_ok = len(ids) == count and all(b - a == 1 for a, b in zip(ids, ids[1:]))
            user_report = direction in REPORTED.get(cast, "")
            signals = []
            if metrics["longestLowMotionMs"] >= 90: signals.append("low-motion interval >=90ms")
            if metrics["seamOverMedianAdjacent"] > 2: signals.append("foot-region loop seam >2x median adjacent change")
            if metrics["similarSubcycleCandidates"]: signals.append("possible repeated subcycle; inspect foot identity")
            if not order_ok: signals.append("source frame order broken")
            contacts = contact_check(annotations.get(key), count, asset["cycleMs"], asset["tilesPerCycle"], digest)
            template[key] = {"sheet_sha256": digest, "contacts": [], "note": "frame numbers are 0-based; closing contact is first contact + frame count in the next repeat; foot L/R means anatomical foot, not screen side"}
            annotation = annotations.get(key, {})
            resolved = (contacts["status"] == "verified-contacts" and
                        annotation.get("resolvesReportedDefect") is True and
                        bool(annotation.get("reviewNote", "").strip()))
            reviewed_signals = (bool(annotation.get("reviewNote", "").strip()) and
                                annotation.get("imageSignalsReviewed") is True)
            accepted = (order_ok and contacts["status"] == "verified-contacts" and (not user_report or resolved)
                        and (not signals or reviewed_signals))
            row = {"cast": cast, "direction": direction, "frames": count, "sheet_sha256": digest,
                   "userReportedDefect": user_report, "reportedDefectResolved": resolved,
                   "reviewNote": annotation.get("reviewNote"), "sourceOrderValid": order_ok,
                   "cycleMs": asset["cycleMs"], "tilesPerCycle": asset["tilesPerCycle"],
                   "assumedStepMsIfOneFullGait": asset["cycleMs"] / 2,
                   "sourceWindowMs": count / meta["sourceFps"] * 1000,
                   "playbackSpeedVsExtractedVideo": round(count / meta["sourceFps"] * 1000 / asset["cycleMs"], 3),
                   "signals": signals, "metrics": metrics, "contacts": contacts,
                   "contactCheckPassed":accepted,"uniformityStatus":"unverified",
                   "status": "contact-check-only-uniformity-unverified" if accepted else "rejected-user-report" if user_report and not resolved else "needs-review"}
            rows.append(row)
            # Every frame, numbered: no 16-thumbnail sampling that can hide a repeated step.
            contact = Image.new("RGB", (8 * 192, ((count + 7) // 8) * 132), "#25343a")
            draw = ImageDraw.Draw(contact)
            for i, leg in enumerate(legs):
                tile = Image.new("RGBA", (192, 104), "#d5d6c8")
                leg_im = ImageOps.contain(frames[i].crop((x0, top, x1, min(cell, ground + 5))),
                                          (184, 104), Image.Resampling.LANCZOS)
                tile.alpha_composite(leg_im, ((192-leg_im.width)//2, 104-leg_im.height))
                x = i % 8 * 192; y = i // 8 * 132
                contact.paste(tile.convert("RGB"), (x, y + 24))
                draw.text((x + 4, y + 4), f'{i:02d} / source {ids[i]} / {i*asset["cycleMs"]/count:.0f}ms', fill="white")
            contact.save(args.out / f"{key}-feet.jpg", quality=92)
            frames[0].save(args.out / f"{key}.gif", save_all=True, append_images=frames[1:],
                           duration=round(asset["cycleMs"] / count / 10) * 10, loop=0, disposal=2)
            # JS animation uses exact cycleMs, GIF is only an auxiliary preview (10ms quantization).
            sheet.save(args.out / f"{key}.png")
            data = json.dumps({**asset, "image": key + ".png", "crop": [x0, top, x1-x0, min(cell, ground+5)-top]})
            cards.append(f'<article class="{row["status"]}"><h2>{html.escape(key)} · {row["status"]}</h2>'
                         f'<canvas width="320" height="230" data-asset=\'{data}\'></canvas>'
                         f'<p>{count} frames · source {row["sourceWindowMs"]:.0f}ms → {asset["cycleMs"]}ms '
                         f'({row["playbackSpeedVsExtractedVideo"]}×)</p>'
                         f'<p>{html.escape(" / ".join(signals) or ("左右2歩・接地間隔を目視注釈で確認" if accepted else "自動異常候補なし・左右の接地は未確認"))}</p>'
                         f'<a href="{key}-feet.jpg">全フレームの足元</a></article>')
    report = {"status": "uniformity-not-accepted", "directions": len(rows),
              "userReportedDefects": sum(r["userReportedDefect"] for r in rows),
              "accepted":0,"contactChecksPassed":sum(r["contactCheckPassed"] for r in rows),
              "automaticSignalDirections": sum(bool(r["signals"]) for r in rows),
              "limits": "This script checks supplied contact annotations and image signals. It does not measure or approve cross-character size, stride, speed or motion intensity. Automatic image metrics cannot infer anatomical foot identity.",
              "rows": rows}
    targets={(c,d) for c,ds in REPORTED.items() for d in ds}|{('delegation','S')}
    passed={(r['cast'],r['direction']) for r in rows if r['contactCheckPassed']}
    report['replacementDirections']=len(targets)
    report['replacementContactCheckStatus']='passed' if targets<=passed else 'not-accepted'
    report['replacementAcceptanceStatus']='uniformity-unverified'
    (args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.out / "contacts-template.json").write_text(json.dumps(template, indent=2) + "\n")
    page = '''<!doctype html><html lang="ja"><meta charset="utf-8"><title>歩行・接地監査</title>
<style>body{font:14px system-ui;background:#18282c;color:#eee;padding:16px}header{position:sticky;top:0;background:#18282cf5;padding:10px;z-index:1}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px}article{border:1px solid #748482;padding:10px}.rejected-user-report{border-color:#ef9183}.rejected-user-report h2{color:#ffb3a5}canvas{background:#d5d6c8}a{color:#ffe0a0}button,input{margin:8px}</style>
<header><h1>全48方向：歩行・接地監査（未承認）</h1><p>全ループ720ms。時間の統一と、左右2歩の確認は別項目。rejected はユーザー報告により監査上不採用（ゲーム素材は未変更）。</p>
<button id="play">一時停止</button><button id="step">1/120周期進める</button><label>速度<input id="speed" type="range" min="0.1" max="1" value="1" step=".1"></label><span id="position"></span><p>足元を拡大表示。足の色・輪郭変化は接地とは限りません。<a href="report.json">検証JSON</a></p></header><main>'''
    page=page.replace('全48方向：歩行・接地監査（未承認）',f'全48方向：接地注釈 {report["contactChecksPassed"]} 方向／動作統一は未合格')
    page += "\n".join(cards) + '''</main><script type="module">
let paused=false,phase=0,last;const actors=[];const speed=document.querySelector('#speed');
document.querySelector('#play').onclick=e=>{paused=!paused;e.target.textContent=paused?'再生':'一時停止'};
document.querySelector('#step').onclick=()=>{paused=true;document.querySelector('#play').textContent='再生';phase=(phase+1/120)%1};
for(const canvas of document.querySelectorAll('canvas')){const a=JSON.parse(canvas.dataset.asset),img=new Image();img.src=a.image;await img.decode();actors.push({canvas,a,img})}
function draw(t){if(last!==undefined&&!paused)phase=(phase+Math.min(100,t-last)/720*Number(speed.value))%1;last=t;
for(const {canvas,a,img}of actors){const c=canvas.getContext('2d'),f=Math.min(a.frames-1,Math.floor(phase*a.frames));c.clearRect(0,0,320,230);
const [x,y,w,h]=a.crop,s=Math.min(320/w,200/h);c.drawImage(img,(f%4)*a.cell+x,Math.floor(f/4)*a.cell+y,w,h,(320-w*s)/2,220-h*s,w*s,h*s);c.fillText('frame '+f+' / '+a.frames,8,14)}
document.querySelector('#position').textContent=Math.round(phase*720)+'ms';requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script></html>'''
    (args.out / "index.html").write_text(page)
    print(json.dumps({k: v for k, v in report.items() if k != "rows"}))
    if args.strict and report["accepted"] != report["directions"]: raise SystemExit(1)
    if args.require_replacements and not targets<=passed: raise SystemExit(1)


if __name__ == "__main__": main()
