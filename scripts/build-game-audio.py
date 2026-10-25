#!/usr/bin/env python3
"""Original score + synthetic SFX. Run only with project .venv/bin/python.

No network/install. Refuses to replace any generated v1 material. GeneralUser
is rendered, never copied. Skill helper is local and has been inspected.
"""
import array
import hashlib
import importlib.util
import json
import math
import pathlib
import random
import shutil
import struct
import subprocess
import sys
import types
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/audio/v1'
PUBLIC = ROOT / 'public/audio/v1'
SKILL = ROOT / '.codex/skills/rpg-music'
FONT = SKILL / 'assets/GeneralUser-GS.sf2'
FONT_SHA = '9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe'
RATE = 44100


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def write_wav(path, samples, rate=RATE):
    with wave.open(str(path), 'wb') as w:
        w.setparams((2, 2, rate, 0, 'NONE', 'not compressed'))
        w.writeframes(samples.tobytes())


def read_wav(path):
    with wave.open(str(path), 'rb') as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getcomptype()) == (2, 2, 'NONE')
        rate, frames = w.getframerate(), w.getnframes()
        a = array.array('h', w.readframes(frames))
    return a, rate, frames


def normalize(values, peak):
    scale = peak * 32767 / max(max(abs(v) for v in values), 1)
    return array.array('h', (round(v * scale) for v in values))


def extract_offset(data, cycle, kind):
    if kind != 'tactics':
        return RATE // 4
    # Choose a common musical phase where the naturally rendered cycles agree
    # in amplitude AND slope. Never alter/crossfade notes or the 8-bar duration.
    def error(offset):
        start, end = 2 * cycle + offset, 3 * cycle + offset
        total = 0
        for ch in range(2):
            h, t = data[start * 2 + ch], data[(end - 1) * 2 + ch]
            dh = data[(start + 1) * 2 + ch] - h
            dt = t - data[(end - 2) * 2 + ch]
            total += (h - t) ** 2 + (dh - dt) ** 2
        return total
    return min(range(RATE // 8 // 2 * 2, RATE * 2 // 5, 2), key=error)


def metrics(path, loop=False):
    a, rate, frames = read_wav(path)
    peak = max(abs(v) for v in a) / 32768
    rms = math.sqrt(sum(float(v) * v for v in a) / len(a)) / 32768
    dc = [sum(a[c::2]) / frames / 32768 for c in range(2)]
    result = dict(path=str(path.relative_to(ROOT)), sha256=sha(path),
                  bytes=path.stat().st_size, sampleRate=rate, channels=2,
                  sampleWidthBytes=2, frames=frames, durationSeconds=frames / rate,
                  samplePeak=peak, samplePeakDbFS=20 * math.log10(max(peak, 1e-12)),
                  rms=rms, rmsDbFS=20 * math.log10(max(rms, 1e-12)), dc=dc,
                  railSamples=sum(v <= -32768 or v >= 32767 for v in a),
                  loop=[0, frames] if loop else None,
                  loopEndExclusive=True if loop else None)
    assert peak > 0.01 and peak < 0.95 and max(abs(v) for v in dc) < 0.005
    assert result['railSamples'] == 0
    return result


def track(name, channel, program, role):
    return dict(name=name, channel=channel, program=program, role=role, notes=[])


def note(t, beat, duration, pitch, velocity):
    t['notes'].append(dict(beat=beat, duration=duration, pitch=pitch, velocity=velocity))


def score(kind):
    # Each tuple is an original note at (beat within bar, duration, MIDI pitch).
    minor = [
        [(0, 1.3, 74), (1.5, .7, 77), (2.5, .8, 76)],
        [(.5, .8, 72), (1.5, 1.6, 69)],
        [(0, .8, 72), (1, .8, 77), (2.5, 1.1, 79)],
        [(0, 1.5, 76), (2, .8, 74)],
        [(.5, .8, 74), (1.5, .8, 77), (2.5, 1.1, 79)],
        [(0, 1.3, 81), (1.5, .8, 77), (2.5, .8, 76)],
        [(0, .8, 77), (1, .8, 74), (2.5, .8, 72)],
        [(.5, .8, 73), (1.5, .8, 76), (2.5, .7, 69)],
    ]
    major = [
        [(0, 1.3, 74), (1.5, .7, 78), (2.5, .8, 76)],
        [(.5, 1, 73), (2, 1.5, 71)],
        [(0, .8, 71), (1, .8, 74), (2.5, 1.1, 78)],
        [(0, 1.5, 76), (2, .8, 73)],
        [(.5, .8, 76), (1.5, .8, 79), (2.5, 1.1, 78)],
        [(0, 1.3, 78), (1.5, .8, 74), (2.5, .8, 73)],
        [(0, .8, 74), (1, .8, 71), (2.5, .8, 69)],
        [(.5, 1.5, 73), (2.5, .8, 76)],
    ]
    chords = ([[50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60],
               [48, 55, 60, 64], [43, 55, 58, 62], [50, 57, 62, 65],
               [46, 53, 58, 62], [45, 57, 61, 64]] if kind != 'ending' else
              [[50, 57, 62, 66], [47, 54, 59, 62], [43, 55, 59, 62],
               [45, 57, 61, 64], [40, 52, 55, 59], [47, 54, 59, 62],
               [43, 55, 59, 62], [45, 57, 61, 64]])
    lead = track('Oboe · public record' if kind == 'briefing' else
                 'Clarinet · shared river' if kind == 'tactics' else 'Flute · shared river', 0,
                 68 if kind == 'briefing' else 71 if kind == 'tactics' else 73,
                 '主旋律、毎小節末に息継ぎ')
    strings = track('String ensemble · current', 1, 48, '弱奏和声/戦闘は短い分散和音')
    cello = track('Cello · dike foundation', 2, 42, '低音、各小節末に休止')
    horn = track('French horn · council response', 3, 60, '2/4/6/8小節の応答、残り休止')
    wood = track('Clarinet · tributary', 4, 71, '3/7小節だけの対旋律')
    drums = track('Timpani · measured pressure', 5, 47, '戦闘のみ1/3/5/7小節の疎な拍')
    melody = major if kind == 'ending' else minor
    for bar, chord in enumerate(chords):
        at = bar * 4
        for beat, duration, pitch in melody[bar]:
            # Tactics fragments/drops melody an octave, with stronger short attacks.
            note(lead, at + beat, duration * (.65 if kind == 'tactics' else 1),
                 pitch - (12 if kind == 'tactics' else 0), 66 if kind == 'tactics' else 55)
        if kind == 'tactics':
            for step in range(8):
                note(strings, at + step * .5, .32, chord[1 + step % 3], 51 + (step % 2) * 5)
            for beat in (0, 2):
                note(cello, at + beat, 1.2, chord[0], 61)
        else:
            for pitch in chord[1:]:
                note(strings, at + .15, 3.35, pitch, 37 if kind == 'briefing' else 43)
            note(cello, at, 2.8, chord[0], 47)
        if bar % 2 == 1:
            note(horn, at + 1.5, 1.7, chord[2], 45 if kind != 'tactics' else 58)
        if bar in (2, 6):
            note(wood, at + .5, .65, chord[2] + 12, 42)
            note(wood, at + 1.5, 1.2, chord[1] + 12, 40)
        if kind == 'tactics' and bar % 2 == 0:
            note(drums, at, .6, chord[0], 45)
    tracks = [lead, strings, cello, horn, wood] + ([drums] if kind == 'tactics' else [])
    return dict(schema_version=1, tempo_bpm=64 if kind == 'tactics' else 60,
                meter=[4, 4], bars=8, tracks=tracks,
                motif=dict(id='river-record', version=1,
                           pitches=[74, 77, 76], beatPositions=[0, 1.5, 2.5],
                           durations=[1.3, .7, .8], rests='1.3–1.5, 2.2–2.5, 3.3–4 beat',
                           variation=('短縮と1オクターブ下置、刻み弦' if kind == 'tactics' else
                                      '短3度を長3度へ再和声化' if kind == 'ending' else '原形')))


def synth_se(identifier, seconds, seed):
    rng = random.Random(seed)
    values = array.array('d')
    low = 0.
    for i in range(round(seconds * RATE)):
        t = i / RATE
        noise = rng.uniform(-1, 1)
        low = low * .84 + noise * .16
        def tone(freq, decay, onset=0):
            u = t - onset
            return 0 if u < 0 else math.sin(2 * math.pi * freq * u) * math.exp(-u * decay)
        if identifier == 'se-ui':
            v = tone(740, 50) * .7 + tone(1110, 65) * .15
        elif identifier == 'se-move':
            v = noise * math.exp(-t * 70) * .35 + low * math.exp(-t * 28) + tone(150, 35) * .5
        elif identifier == 'se-impact':
            v = noise * math.exp(-t * 48) * .45 + tone(94, 19) * .8 + tone(213, 30) * .3
        elif identifier == 'se-heal':
            v = tone(523.25, 8) * .5 + tone(659.25, 8, .1) * .45 + tone(783.99, 8, .2) * .4
        elif identifier == 'se-record':
            v = noise * math.exp(-t * 45) * .2 + tone(880, 18, .03) * .5 + tone(1174.66, 18, .13) * .35
        elif identifier == 'se-mechanism':
            v = low * math.exp(-t * 6) * .7 + tone(120, 15) * .5 + tone(180, 15, .16) * .3
        elif identifier == 'se-victory':
            v = sum(tone(f, 5, n * .16) * .4 for n, f in enumerate((293.66, 369.99, 440, 587.33)))
        else:
            v = sum(tone(f, 4, n * .18) * .4 for n, f in enumerate((293.66, 261.63, 220)))
        # 0.7ms onset preserves attack; short 15ms tail prevents cut discontinuity.
        v *= min(1, t / .0007) * min(1, max(0, (seconds - t) / .015))
        values.extend((v, v))
    mean = sum(values) / len(values)
    return normalize([v - mean for v in values], .5)


def main():
    if pathlib.Path(sys.executable).resolve() != (ROOT / '.venv/bin/python').resolve():
        raise SystemExit('Use project .venv/bin/python')
    if any(p.name not in ('attempt-r0', 'attempt-r1', 'attempt-r2') for p in OUT.iterdir()) or any(PUBLIC.iterdir()):
        raise SystemExit('Refusing overwrite: v1 output directory is nonempty')
    assert sha(FONT) == FONT_SHA
    spec = importlib.util.spec_from_file_location('local_bgm', SKILL / 'scripts/bgm.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    save(OUT / 'probe.json', helper.probe(types.SimpleNamespace(soundfont=[str(FONT)], out=None)))
    font = FONT.read_bytes()
    def riff_info(data):
        pos = 12
        while pos + 8 <= len(data):
            tag, size = data[pos:pos + 4], struct.unpack_from('<I', data, pos + 4)[0]
            body = data[pos + 8:pos + 8 + size]
            if tag == b'LIST' and body[:4] == b'INFO':
                j = 4
                while j + 8 <= len(body):
                    key, n = body[j:j + 4], struct.unpack_from('<I', body, j + 4)[0]
                    yield key.decode('ascii'), body[j + 8:j + 8 + n].rstrip(b'\0').decode('utf-8', errors='replace')
                    j += 8 + n + n % 2
            pos += 8 + size + size % 2
    info = dict(riff_info(font))
    save(OUT / 'soundfont-info.json', info)
    (OUT / 'soundfont-license.txt').write_text(info.get('ICMT', 'ICMT absent'))
    assert 'License' in info.get('ICMT', '')
    catalog = []
    for kind in ('briefing', 'tactics', 'ending'):
        identifier = 'bgm-' + kind
        cue = score(kind)
        source = OUT / (identifier + '.json')
        save(source, cue)
        midi = OUT / (identifier + '.mid')
        helper.midi(types.SimpleNamespace(spec=str(source), out=str(midi)))
        repeated = json.loads(json.dumps(cue))
        repeated['bars'] = 32
        for t in repeated['tracks']:
            original = list(t['notes'])
            t['notes'] = [dict(n, beat=n['beat'] + loop * 32) for loop in range(4) for n in original]
        repeated_json = OUT / (identifier + '-render4.json')
        repeated_midi = OUT / (identifier + '-render4.mid')
        save(repeated_json, repeated)
        helper.midi(types.SimpleNamespace(spec=str(repeated_json), out=str(repeated_midi)))
        raw = OUT / (identifier + '-render4.wav')
        helper.render(types.SimpleNamespace(midi=str(repeated_midi), soundfont=str(FONT), out=str(raw), rate=RATE))
        data, rate, frames = read_wav(raw)
        cycle = round(32 * 60 / cue['tempo_bpm'] * RATE)
        # Third cycle has two preceding cycles of natural reverb; no tail fade.
        assert frames > cycle * 4
        # Start 250ms into the phrase, after its first transient. Both ends keep
        # identical beat phase; this is a rotation, not a fade/crossfade.
        offset = extract_offset(data, cycle, kind)
        start = cycle * 2 + offset
        loop = normalize(data[start * 2:(start + cycle) * 2], .32)
        master = OUT / (identifier + '-master.wav')
        write_wav(master, loop)
        listen = OUT / (identifier + '-listen3.wav')
        write_wav(listen, loop * 3)
        catalog.append(dict(id=identifier, kind='bgm', source=str(source.relative_to(ROOT)),
                            midi=str(midi.relative_to(ROOT)), master=metrics(master, True),
                            render=dict(cycles=4, extractedCycle=3, sourceFrames=frames,
                                        extractStartFrame=start, phaseRotationSeconds=offset / RATE,
                                        scale='sample peak normalized to 0.32', seed=None),
                            motif=cue['motif'], bpm=cue['tempo_bpm'], meter=[4, 4], bars=8))
    lengths = {'se-ui': .09, 'se-move': .15, 'se-impact': .24, 'se-heal': .65,
               'se-record': .36, 'se-mechanism': .55, 'se-victory': 1.1, 'se-defeat': 1.15}
    for index, (identifier, seconds) in enumerate(lengths.items()):
        seed = 2026101800 + index
        path = OUT / (identifier + '-master.wav')
        write_wav(path, synth_se(identifier, seconds, seed))
        catalog.append(dict(id=identifier, kind='se', master=metrics(path), seed=seed,
                            synthesis='stdlib deterministic sine/noise/envelopes; see script'))
    for item in catalog:
        identifier = item['id']
        target = PUBLIC / (identifier + '.wav')
        master = ROOT / item['master']['path']
        subprocess.run(['afconvert', str(master), str(target), '-f', 'WAVE', '-d', 'LEI16@22050', '-c', '2'], check=True)
        item['path'] = '/audio/v1/' + target.name
        item['delivery'] = metrics(target, item['kind'] == 'bgm')
        # Actually decode the delivery WAV and run loop diagnostic on final PCM.
        decoded, rate, count = read_wav(target)
        assert rate == 22050 and abs(count / rate - item['master']['durationSeconds']) < .001
        if item['kind'] == 'bgm':
            qa = helper.verify(types.SimpleNamespace(wav=str(target), start=0, end=count,
                                                      out=str(OUT / (identifier + '-loop-qa.json'))))
            item['loopQA'] = qa
            listening = OUT / (identifier + '-delivery-listen3.wav')
            write_wav(listening, decoded * 3, rate)
            item['deliveryListeningFile'] = str(listening.relative_to(ROOT))
            item['deliveryListeningFileSha256'] = sha(listening)
        else:
            assert max(abs(v) for v in decoded[:2]) < 327
            assert max(abs(v) for v in decoded[-2:]) < 327
    metadata = dict(schemaVersion=1, version='audio-v1', created='2026-10-18',
                    project='澪を継ぐ者', renderer='FluidSynth 2.6.1 / skill bgm.py',
                    soundfont=dict(name=info.get('INAM'), sha256=FONT_SHA,
                                   source=str(FONT.relative_to(ROOT)),
                                   license='soundfont-license.txt (ICMT embedded License v2.0)',
                                   audioUse='Private/commercial music creation permitted by embedded license; sample provenance caveat retained',
                                   redistributeSoundfont=False),
                    ownership='Original score and synthetic SE generated for this project; font/sample conditions remain separate',
                    numericalVerified=True, listeningVerified=False, gameVerified=False,
                    truePeakLUFS='not measured; ffmpeg/ffprobe unavailable',
                    sourceScriptSha256=sha(pathlib.Path(__file__).resolve()),
                    reproduction='.venv/bin/python scripts/build-game-audio.py (requires both v1 output directories empty; refuses overwrite)',
                    cues=catalog)
    save(OUT / 'metadata.json', metadata)
    print(json.dumps({'cues': len(catalog), 'deliveryBytes': sum(c['delivery']['bytes'] for c in catalog),
                      'loopFlags': {c['id']: c['loopQA']['review_flags'] for c in catalog if c['kind'] == 'bgm'}}, indent=2))


if __name__ == '__main__':
    main()
