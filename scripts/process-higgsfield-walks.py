"""Resume offline processing of downloaded Higgsfield clips; publish only reviewed jobs.

Usage: .venv/bin/python scripts/process-higgsfield-walks.py --indices 0,1,2
       .venv/bin/python scripts/process-higgsfield-walks.py --publish 0,1,2
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "artifacts/walk-higgsfield-v2"
TOOLS = ROOT / ".codex/skills/video2dsprite/scripts"
PLAN = WORK / "plan.json"
sys.path.insert(0, str(TOOLS))
import forge_core
from finish_frames import measure_body
from walk_phase import contact_phase_indices


def read(path):
    return json.loads(path.read_text())


def write(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")


def run(job, name, *args):
    with (job / "processing.log").open("a") as log:
        subprocess.run([sys.executable, str(TOOLS / name), *map(str, args)], cwd=ROOT,
                       stdout=log, stderr=subprocess.STDOUT, check=True)


def adopted_idle(cast, direction):
    source = (ROOT / "src/view/castMotion.ts").read_text()
    return json.loads(source.split("export const CAST_IDLE=", 1)[1].split(";", 1)[0])[cast][direction]


def protected_colors(master):
    a = np.asarray(Image.open(master).convert("RGBA"))
    pixels = a[a[:, :, 3] > 240, :3]
    quantized = Image.fromarray(pixels.reshape(1, -1, 3)).quantize(colors=24)
    palette = quantized.getpalette()
    return ["#%02x%02x%02x" % tuple(palette[k*3:k*3+3]) for _, k in quantized.getcolors()]


def recurrence_candidates(directory, output):
    """Numerical fallback for obscured legs; explicitly requires manual gait review.

    Armor, long coats and held props can hide the two-step silhouette test. Keep
    the source order, score position and velocity closure, and never ping-pong or
    synthesize frames. A candidate is not a certified gait.
    """
    files = sorted(directory.glob("*.png"))
    a = np.stack([np.asarray(Image.open(p).convert("RGBA").resize((80, 80)), dtype=np.float32)/255 for p in files])
    a[:, :, :, :3] *= a[:, :, :, 3:4]
    step = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2, 3))
    typical = max(float(np.percentile(step, 95)), 1e-6)
    candidates = []
    for length in range(14, min(40, len(a)-2)+1):
        for start in range(0, len(a)-length-1):
            end = start+length
            seam = float(np.abs(a[end-1]-a[start]).mean())/typical
            closure = float(np.abs(a[end]-a[start]).mean())/typical
            velocity = float(np.abs((a[start+1]-a[start])-(a[end]-a[end-1])).mean())/typical
            amplitude = float(np.abs(a[start:end]-a[start:end].mean(axis=0)).mean())
            if amplitude < 0.002:
                continue
            candidates.append({"start":start,"endExclusive":end,"frames":length,
                               "seam_over_p95":seam,"closure_over_p95":closure,
                               "velocity_over_p95":velocity,"amplitude":amplitude,
                               "score":closure+0.35*velocity+0.15*seam})
    if not candidates:
        raise ValueError("no moving recurrence candidate; regenerate")
    candidates.sort(key=lambda x:x["score"])
    best = candidates[0]
    output.mkdir()
    indices = list(range(best["start"],best["endExclusive"]))
    write(output/"selection.json", {"sourceIndices":indices,"loopPolicy":"cycle","review":"manual-gait-review-required"})
    confidence = {"label":"manual-review-required","overall":None,
                  "review":["gait_loop could not certify this take; inspect both alternating steps and the seam"]}
    write(output/"loop-report.json", {"period":{"verdict":"uncertified"},
        "recommendation":{"confidence":confidence,"seam":best,"window":best},
        "method":"source-order position and velocity recurrence; no interpolation",
        "candidates":candidates[:12]})


def process(entry, refresh_exports=False):
    job = ROOT / entry["directory"]
    ready = job / "ready.json"
    previous = read(ready) if ready.exists() else None
    if not refresh_exports and ready.exists() and read(ready)["job_id"] == entry["job_id"]:
        return {"index": entry["index"], "status": "already-processed"}
    if not (job / "clip.mp4").is_file():
        return {"index": entry["index"], "status": "awaiting-download"}
    idle = adopted_idle(entry["cast"], entry["direction"])
    protect = [arg for c in protected_colors(job / "master.png") for arg in ("--protect-color", c)]
    processed = job / "keyed-v2"
    if not processed.exists():
        run(job, "video2dsprite.py", "process", "--video", job / "clip.mp4", "--output-dir", processed,
            "--fps", 16, "--start", 0.5, "--duration", 3.5, "--key", "auto", "--matte", "soft",
            "--protect-tol", 0.05, "--reference", job / "master.png", "--frame-counts", 16,
            "--workers", 2, *protect)
    matte = read(processed / "frames-clean/matte-report.json")
    if matte.get("opaque_key_px", 0) > 0:
        raise ValueError(f"{entry['index']}: opaque key remains; re-key before adoption")
    # Reproduce the exact scale/offset used in the uploaded reference, in source units.
    registration = job / "registration-v2"
    anchor = [idle["originX"] * 256, idle["originY"] * 256]
    if not registration.exists():
        run(job, "prepare_i2v_input.py", "prepare", "--master", job / "master.png", "--action", "walk",
            "--output-dir", registration, "--canvas", "768,768", "--scale", 2.5,
            "--anchor", f"{anchor[0]},{anchor[1]}", "--root", f"{64+2.5*anchor[0]},{20+2.5*anchor[1]}",
            "--key", "magenta", "--allow-key-conflict", "--action-padding", "8,8,8,8", "--duration", 5,
            "--subject", "the adopted hand-painted game character", "--facing", entry["direction"])
        (registration / "prompt.txt").write_text(entry["prompt"] + "\n")
        meta = read(registration / "registration_job.json")
        meta["prompt"]["sha256"] = hashlib.sha256((registration / "prompt.txt").read_bytes()).hexdigest()
        meta["timeline"] = []  # Actual connector prompt requests steady walking throughout.
        meta["returnsToRest"] = False
        write(registration / "registration_job.json", meta)
    registered = job / "registered-v2"
    if not registered.exists():
        run(job, "register_clip.py", "apply", "--job", registration / "registration_job.json",
            "--frames", processed / "frames-clean", "--output-dir", registered,
            "--lock", "feet,x", "--action-padding", "8,8,8,8", "--rest-frames", "none")
    loop = job / "loop-v2"
    if not loop.exists():
        try:
            run(job, "gait_loop.py", "select", "--frames-dir", registered / "frames", "--fps", 16,
                "--output-dir", loop, "--state", "walk")
        except subprocess.CalledProcessError:
            recurrence_candidates(registered / "frames", loop)
    selection = read(loop / "selection.json")
    report = read(loop / "loop-report.json")
    indices = selection["sourceIndices"]
    files = sorted((registered / "frames").glob("*.png"))
    rest = Image.open(files[0]).convert("RGBA")
    rest_bbox = rest.getchannel("A").getbbox()
    body = measure_body(np.asarray(rest)[:, :, 3])
    target_height = min(190, body.height-1)
    finished = job / "finished-v2"
    if not finished.exists():
        run(job, "finish_frames.py", "hd", "--frames", registered, "--output-dir", finished,
            "--target-height", target_height, "--canvas", "256x256",
            "--canvas-anchor", f"{round(anchor[0])},{round(anchor[1])}", "--character", entry["cast"],
            "--colour-lock", job / "master.png")
    finished_files = sorted((finished / "frames").glob("*.png"))
    finish = read(finished / "finish.json")
    frames = [Image.open(f).convert("RGBA") for f in finished_files]
    removed = 0
    ground_key_removed = 0
    for k, frame in enumerate(frames):
        a = np.asarray(frame).copy()
        rgb = a[:, :, :3].astype(np.int16)
        # Generated contact shadows can be dark magenta, closer to brown costume
        # colours than to the bright key. Remove their hue only in the foot band;
        # purple eyes, ornaments and other higher design colours stay protected.
        ground_band = 60 if entry["cast"] == "neia" else 28
        ground = np.arange(a.shape[0])[:, None] >= round(finish["anchor"][1])-ground_band
        key_hue = (rgb[:, :, 0] > rgb[:, :, 1]+12) & (rgb[:, :, 2] > rgb[:, :, 1]+12) & (rgb[:, :, 2] > rgb[:, :, 0]*0.65)
        keyed_ground = ground & key_hue & (a[:, :, 3] > 0)
        ground_key_removed += int(keyed_ground.sum())
        a[keyed_ground] = 0
        labels, number = forge_core.label_components(a[:, :, 3] > 64)
        areas = np.bincount(labels.ravel(), minlength=number+1)
        if number:
            largest = 1+int(areas[1:].argmax())
            tiny = np.flatnonzero((areas < max(12, areas[largest]*0.004)) & (np.arange(len(areas)) != largest))
            tiny = tiny[tiny != 0]
            keep = (labels != 0) & ~np.isin(labels, tiny)
            # Retain antialiasing around meaningful components, but not the faint
            # alpha bridges that connect a stray floor fragment to a boot.
            fringe = np.asarray(Image.fromarray(keep.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(5))) > 0
            mask = ~fringe & (a[:, :, 3] > 0)
            removed += int(mask.sum())
            a[mask] = 0
        cleaned = Image.fromarray(a)
        contact = measure_body(a[:, :, 3], 2)
        dy = round(finish["anchor"][1])-contact.ground
        if dy:
            # Shadows have been removed; lock the actual planted boot, not the
            # shadow's lower edge. This is a translation, never a per-frame scale.
            grounded = Image.new("RGBA",cleaned.size)
            grounded.alpha_composite(cleaned,(0,dy))
            cleaned = grounded
        # Translation can bring a residual shadow into the foot band. Recheck
        # after registration, then ground the actual boot once more if needed.
        for _ in range(4):
            a=np.asarray(cleaned).copy();rgb=a[:,:,:3].astype(np.int16)
            band=np.arange(a.shape[0])[:,None]>=round(finish["anchor"][1])-28
            residue=band&(rgb[:,:,0]>rgb[:,:,1]+12)&(rgb[:,:,2]>rgb[:,:,1]+12)&(rgb[:,:,2]>rgb[:,:,0]*0.65)&(a[:,:,3]>0)
            if not residue.any():break
            ground_key_removed+=int(residue.sum());a[residue]=0
            cleaned=Image.fromarray(a);body=measure_body(a[:,:,3],2)
            dy=round(finish["anchor"][1])-body.ground
            if dy:
                grounded=Image.new('RGBA',cleaned.size);grounded.alpha_composite(cleaned,(0,dy));cleaned=grounded
        frames[k] = cleaned
    overrides = read(WORK / "contact-overrides.json")
    override = overrides.get(str(entry["index"]))
    if refresh_exports and previous and previous.get("job_id")==entry["job_id"] and previous.get("asset",{}).get("frames")==16 and "contactPhase" in previous:
        picked,phase=previous["sourceIndices"],previous["contactPhase"]
    elif override and override["job_id"] == entry["job_id"]:
        landmarks = override["landmarks"]
        picked = [round(left+(right-left)*i/4) for left,right in zip(landmarks,landmarks[1:]) for i in range(4)]
        phase = {"contactFrames":landmarks[::2],"passingFrames":landmarks[1::2],
                 "method":"manually reviewed contact landmarks", "reason":override["reason"],
                 "phaseFrames":[0,4,8,12],"status":"requires-visual-contact-review"}
    else:
        picked, phase = contact_phase_indices(frames, finish["anchor"], finish["targetHeight"])
    frames = [frames[i] for i in picked]
    periods, count = 1, 16
    sheet = Image.new("RGBA", (4*256, math.ceil(count/4)*256))
    for i, im in enumerate(frames):
        sheet.alpha_composite(im, (i % 4 * 256, i // 4 * 256))
    sheet.save(job / "walk.png", optimize=True)
    finish = read(finished / "finish.json")
    # Scale metadata describes the reference rest pose rather than the gait envelope.
    # Canvas fitting can lower the requested height. Runtime sizing must use the
    # actual finished height or that direction shrinks on the board (Garan E).
    nominal_height = finish["targetHeight"]
    # One fixed display scale per direction, measured from the full selected
    # stride after shadow cleanup. Never resize individual gait frames.
    body_height = float(np.median([measure_body(np.asarray(im)[:, :, 3], 2).height for im in frames]))
    size, foot = finish["size"], finish["anchor"]
    if size != [256, 256]:
        raise ValueError(f"unexpected finished canvas: {size}")
    def preview_frame(im, background):
        bg = Image.new("RGBA", (256, 256), background)
        scale = 180 / body_height
        resized = im.resize((round(256*scale),round(256*scale)),Image.Resampling.LANCZOS)
        bg.alpha_composite(resized,(round(128-foot[0]*scale),round(240-foot[1]*scale)))
        return bg.convert("RGB")
    preview = []
    for im in frames:
        preview.append(preview_frame(im,(219,220,208,255)))
    preview[0].save(job / "loop.gif", save_all=True, append_images=preview[1:],
                    duration=round(720*periods/count), loop=0, disposal=2)
    contact = Image.new("RGB", (8*128, 2*128+24), (32, 40, 45))
    draw = ImageDraw.Draw(contact)
    draw.text((4, 4), f"{entry['cast']} {entry['direction']} | {count} frames | {entry['job_id']}", fill="white")
    for i in range(16):
        frame = frames[math.floor(i*len(frames)/16)]
        bg=preview_frame(frame,(219,220,208,255) if i<8 else (32,40,45,255))
        contact.paste(bg.resize((128,128),Image.Resampling.LANCZOS),(i%8*128,i//8*128+24))
    contact.save(job / "review.jpg", quality=90)
    data = {
        "index": entry["index"], "cast": entry["cast"], "direction": entry["direction"],
        "job_id": entry["job_id"], "art_source": entry["art_source"],
        "source_sha256": entry["source_sha256"], "clip_sha256": hashlib.sha256((job / "clip.mp4").read_bytes()).hexdigest(),
        "sheet_sha256": hashlib.sha256((job / "walk.png").read_bytes()).hexdigest(),
        "asset": {"key": f"motion-v2-walk-{entry['cast']}-{entry['direction']}",
                  "path": f"/assets/characters/motion-v2/{entry['cast']}/walk-{entry['direction']}.png",
                  "originX": foot[0]/256, "originY": foot[1]/256,
                  "visibleHeight": body_height, "cell": 256, "frames": count,
                  "tilesPerCycle": 4, "cycleMs": 720},
        "sourceIndices": picked, "periods": periods, "detachedSpeckPixelsRemoved": removed,
        "groundKeyPixelsRemoved": ground_key_removed, "contactPhase": phase,
        "finishedTargetHeight": nominal_height,
        "matte": {k: matte.get(k) for k in ("opaque_key_px", "outer_ring_spill_fraction", "enclosed_key_pockets", "flips_per_frame_pair", "warnings")},
        "loop": {"confidence": report["recommendation"]["confidence"], "periodVerdict": report["period"].get("verdict"), "seam": report["recommendation"].get("seam")},
        "review": "needs-visual-review",
    }
    write(ready, data)
    return {"index": entry["index"], "status": "needs-visual-review", "frames": count}


def publish(indices, entries):
    manifest_path = ROOT / "src/view/walk-v2.json"
    manifest = read(manifest_path)
    for index in indices:
        entry = entries[index]
        job = ROOT / entry["directory"]
        ready = read(job / "ready.json")
        if ready["job_id"] != entry["job_id"]:
            raise ValueError("refusing a stale take")
        # This verb is only invoked after actual visual review of review.jpg and loop.
        dest = ROOT / ("public" + ready["asset"]["path"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((job / "walk.png").read_bytes())
        ready["review"] = "visually-reviewed"
        ready["contactPhase"]["status"] = "visually-reviewed"
        write(job / "ready.json", ready)
        write(dest.with_suffix(".json"), ready)
        manifest.setdefault(entry["cast"], {})[entry["direction"]] = ready["asset"]
        entry["review"] = "visually-reviewed"
    write(manifest_path, manifest)
    write(PLAN, {"version": 1, "jobs": entries})
    print(json.dumps({"published": indices}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--indices", default="")
    parser.add_argument("--publish", default="")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--refresh-exports", action="store_true")
    args = parser.parse_args()
    entries = read(PLAN)["jobs"]
    if args.publish:
        publish([int(i) for i in args.publish.split(",")], entries)
        return
    ids = [int(i) for i in args.indices.split(",")] if args.indices else list(range(len(entries)))
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks = {pool.submit(process, entries[i], args.refresh_exports): i for i in ids}
        for task in concurrent.futures.as_completed(tasks):
            try:
                print(json.dumps(task.result()), flush=True)
            except Exception as exc:
                errors.append(tasks[task])
                print(json.dumps({"index": tasks[task], "error": str(exc)}), flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
