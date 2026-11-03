"""Prepare reproducible direction-locked I2V jobs from the adopted cast sheets.

Run with .venv/bin/python. Generation is submitted through the Higgsfield connector;
this script never submits or spends credits.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/walk-higgsfield-v2"
CAST = ["lise", "garan", "neia", "sena", "iva", "dani", "guard", "archer", "vesk", "toma", "worker", "delegation"]
FACING = {
    "N": "away from the viewer toward screen upper-right, exactly as the reference",
    "E": "toward screen lower-right, exactly as the reference",
    "S": "toward screen lower-left, exactly as the reference",
    "W": "away from the viewer toward screen upper-left, exactly as the reference",
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = []
    for cast in CAST:
        for direction, facing in FACING.items():
            source = ROOT / f"public/assets/motion-v1/{cast}/idle-{direction}.png"
            job = OUT / cast / direction
            job.mkdir(parents=True, exist_ok=True)
            master = Image.open(source).convert("RGBA")
            # The adopted four-view assets preserve costume and screen-space facing.
            master.save(job / "master.png")
            canvas = Image.new("RGBA", (768, 768), (255, 0, 255, 255))
            # One fixed transform for each full clip; room around all moving limbs.
            canvas.alpha_composite(master.resize((640, 640), Image.Resampling.LANCZOS), (64, 20))
            canvas.convert("RGB").save(job / "input.png")
            prompt = (
                f"Animate only the single same hand-painted chibi game character in the reference. "
                f"The character faces {facing} throughout the entire clip. Preserve that exact "
                "three-quarter viewing angle; never turn or rotate the character or camera. "
                "Walk in place on a treadmill at a steady natural walking pace, with clearly "
                "alternating left and right steps, heel contact, bent-knee passing poses and toe-off. "
                "Use a full left-and-right stride cycle, natural weight transfer and subtle cloth motion. "
                "Keep all existing equipment, weapons, bags, hair, face, costume, colours and body "
                "proportions identical to the reference. Hands carrying equipment retain their grip. "
                "The body remains centered at a constant size, with no travel across the frame. "
                "At least one foot contacts the same horizontal ground line. "
                "Begin walking immediately; repeat several complete steady cycles with no pauses. "
                "No new objects, no floor, no shadow, no text, no particles or effects. "
                "Locked orthographic game camera, no pan, no zoom, no cuts. "
                "Solid flat pure magenta #ff00ff background for the entire shot. "
                "Preserve the precise illustrated style, do not switch to realistic or 3D rendering."
            )
            (job / "prompt.txt").write_text(prompt + "\n")
            jobs.append({
                "index": len(jobs), "cast": cast, "direction": direction,
                "source": str(source.relative_to(ROOT)),
                "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "directory": str(job.relative_to(ROOT)), "prompt": prompt,
                "art_source": "Higgsfield / Kling v3.0 image-to-video",
                "params": {"model": "kling3_0", "duration": 5, "mode": "std", "sound": "off", "aspect_ratio": "1:1", "count": 1},
                "status": "prepared",
            })
    plan = OUT / "plan.json"
    if plan.exists():
        old = {j["index"]: j for j in json.loads(plan.read_text())["jobs"]}
        for j in jobs:
            prev = old.get(j["index"], {})
            if prev.get("source_sha256") == j["source_sha256"]:
                for key in ("media_id", "job_id", "status", "result_url", "error", "review",
                            "directory", "params", "prompt", "art_source", "rejected_takes",
                            "referenceRoles", "driving_job_id", "type", "model"):
                    if key in prev:
                        j[key] = prev[key]
                (ROOT / j["directory"] / "prompt.txt").write_text(j["prompt"] + "\n")
    plan.write_text(json.dumps({"version": 1, "jobs": jobs}, indent=2) + "\n")
    print(json.dumps({"plan": str(plan), "jobs": len(jobs)}))


if __name__ == "__main__":
    main()
