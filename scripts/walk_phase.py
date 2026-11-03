"""Map two alternating contacts and their passing poses onto one common cycle.

Only selects original video frames. No mirroring, ping-pong, generated poses or
interpolation. Contact candidates still require visual review for leg identity.
"""
import numpy as np


def contact_phase_indices(frames, anchor, body_height):
    signal = []
    for image in frames:
        a = np.asarray(image)
        y, x = np.nonzero((a[:, :, 3] > 128) & (np.arange(a.shape[0])[:, None] > anchor[1]-body_height*0.22))
        if len(x) < 8:
            signal.append(0.0)
            continue
        # Perspective makes contacts separate in both screen axes.
        width = np.percentile(x, 95)-np.percentile(x, 5)
        height = np.percentile(y, 95)-np.percentile(y, 5)
        signal.append(float(np.hypot(width, height)))
    raw = np.asarray(signal)
    smooth = np.convolve(np.pad(raw, (1, 1), mode="edge"), [0.25, 0.5, 0.25], mode="valid")
    peaks = [i for i in range(1, len(smooth)-1) if smooth[i] >= smooth[i-1] and smooth[i] > smooth[i+1]]
    # Suppress boot-edge jitter within a contact rather than counting it as a step.
    keep = []
    for i in sorted(peaks, key=lambda p: smooth[p], reverse=True):
        if all(abs(i-p) >= 4 for p in keep):
            keep.append(i)
    peaks = sorted(keep)
    arrays = [np.asarray(f.resize((64, 64)), dtype=np.float32)/255 for f in frames]
    for a in arrays:
        a[:, :, :3] *= a[:, :, 3:4]
    candidates = []
    for p, q, r in zip(peaks, peaks[1:], peaks[2:]):
        if min(q-p, r-q) < 4 or max(q-p, r-q) > 18 or max(q-p,r-q)/min(q-p,r-q)>1.8:
            continue
        passing1 = p+int(np.argmin(smooth[p:q+1]))
        passing2 = q+int(np.argmin(smooth[q:r+1]))
        if not p < passing1 < q < passing2 < r:
            continue
        amplitude = min(smooth[p]-smooth[passing1], smooth[q]-smooth[passing2])
        if amplitude < max(0.8, body_height*0.006):
            continue
        seam = float(np.abs(arrays[p]-arrays[r]).mean())
        symmetry = abs((q-p)-(r-q))/max(1, r-p)
        candidates.append((seam+0.01*symmetry, [p, passing1, q, passing2, r], amplitude))
    if not candidates:
        raise ValueError("no stable pair of alternating contacts; manual contact landmarks required")
    _, landmarks, amplitude = min(candidates)
    indices = []
    for left, right in zip(landmarks, landmarks[1:]):
        indices.extend([round(left+(right-left)*i/4) for i in range(4)])
    return indices, {"contactFrames": [landmarks[0],landmarks[2],landmarks[4]],
                     "passingFrames": [landmarks[1],landmarks[3]],
                     "footSpreadAmplitude": float(amplitude),
                     "phaseFrames": [0,4,8,12], "method": "two alternating contact candidates with passing poses",
                     "status": "requires-visual-contact-review"}
