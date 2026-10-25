#!/usr/bin/env python3
"""Dependency-free MIDI export, engine discovery, and diagnostic PCM loop QA."""
import argparse
import array
import hashlib
import json
import math
import pathlib
import shutil
import struct
import subprocess
import sys
import wave

PPQ = 480
ASSETS = pathlib.Path(__file__).resolve().parent.parent / 'assets'


def soundfont_path(explicit=None):
    if explicit:
        selected = pathlib.Path(explicit).resolve()
        if not selected.is_file() or selected.suffix.lower() != '.sf2':
            raise ValueError('provide an existing .sf2 via --soundfont')
        return selected
    if not ASSETS.is_dir():
        return None
    fonts = sorted(p for p in ASSETS.iterdir()
                   if p.is_file() and p.suffix.lower() == '.sf2')
    if len(fonts) == 1:
        return fonts[0]
    if len(fonts) > 1:
        raise ValueError('multiple .sf2 files in assets; select one with --soundfont')
    return None


def save_json(path, data):
    pathlib.Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def number(value, label, minimum, maximum, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label}: expected number')
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(f'{label}: out of range [{minimum}, {maximum}]')
    if integer and value != int(value):
        raise ValueError(f'{label}: expected integer')
    return int(value) if integer else value


def vlq(value):
    if not 0 <= value <= 0x0fffffff:
        raise ValueError('MIDI delta exceeds VLQ range')
    data = [value & 127]
    while value >> 7:
        value >>= 7
        data.insert(0, (value & 127) | 128)
    return bytes(data)


def chunk(events, end):
    events.sort(key=lambda event: (event[0], event[1]))
    data, last = bytearray(), 0
    for tick, _, message in events:
        data.extend(vlq(tick - last))
        data.extend(message)
        last = tick
    data.extend(vlq(end - last))
    data.extend(b'\xff\x2f\x00')
    return b'MTrk' + struct.pack('>I', len(data)) + data


def midi(args):
    spec = json.loads(pathlib.Path(args.spec).read_text())
    if spec.get('schema_version') != 1:
        raise ValueError('schema_version must be 1')
    bpm = number(spec['tempo_bpm'], 'tempo_bpm', 20, 400)
    numerator, denominator = spec['meter']
    numerator = number(numerator, 'meter numerator', 1, 255, True)
    denominator = number(denominator, 'meter denominator', 1, 128, True)
    if denominator & (denominator - 1):
        raise ValueError('meter denominator must be a power of two')
    bars = number(spec['bars'], 'bars', 1, 10000, True)
    beats = bars * numerator * 4 / denominator
    end = round(beats * PPQ)
    tempo = round(60000000 / bpm)
    conductor = chunk([
        (0, 0, b'\xff\x51\x03' + tempo.to_bytes(3, 'big')),
        (0, 1, b'\xff\x58\x04' + bytes([numerator, denominator.bit_length()-1, 24, 8]))
    ], end)
    tracks, used_channels = [conductor], set()
    if not spec['tracks'] or len(spec['tracks']) > 16:
        raise ValueError('expected 1..16 musical tracks')
    for track in spec['tracks']:
        channel = number(track['channel'], 'channel', 0, 15, True)
        if channel in used_channels:
            raise ValueError('one track per channel required by this helper')
        used_channels.add(channel)
        program = number(track['program'], 'program', 0, 127, True)
        name = track['name'].encode('utf-8')
        events = [(0, -2, b'\xff\x03' + vlq(len(name)) + name),
                  (0, -1, bytes([0xc0 | channel, program]))]
        active = {}
        for note in track['notes']:
            beat = number(note['beat'], 'beat', 0, beats)
            duration = number(note['duration'], 'duration', 1 / PPQ, beats)
            pitch = number(note['pitch'], 'pitch', 0, 127, True)
            velocity = number(note['velocity'], 'velocity', 1, 127, True)
            start, stop = round(beat * PPQ), round((beat + duration) * PPQ)
            if stop > end or stop <= start:
                raise ValueError('note must have positive length and fit within bars')
            for prior_start, prior_stop in active.get(pitch, []):
                if start < prior_stop and stop > prior_start:
                    raise ValueError('overlapping same-pitch notes on one channel')
            active.setdefault(pitch, []).append((start, stop))
            events += [(start, 1, bytes([0x90 | channel, pitch, velocity])),
                       (stop, 0, bytes([0x80 | channel, pitch, 0]))]
        tracks.append(chunk(events, end))
    pathlib.Path(args.out).write_bytes(
        b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks), PPQ) + b''.join(tracks))
    return {'path': args.out, 'bars': bars, 'seconds_without_tail': beats * tempo / 1000000,
            'status': 'midi-ready', 'audio_generated': False}


def probe(args):
    found = {name: shutil.which(name) for name in
             ('python3', 'ffmpeg', 'ffprobe', 'fluidsynth', 'timidity')}
    paths = [pathlib.Path(p).resolve() for p in args.soundfont]
    if not paths:
        bundled = soundfont_path()
        if bundled:
            paths.append(bundled)
    fonts = [{'path': str(p), 'exists': p.is_file()} for p in paths]
    result = {'executables': found, 'soundfonts': fonts,
              'scope': 'PATH and explicit soundfonts or the single .sf2 in skill assets',
              'renderer_tested': False, 'music_service': 'not inspected by this local helper'}
    if args.out:
        save_json(args.out, result)
    return result


def render(args):
    font = soundfont_path(args.soundfont)
    if font is None:
        raise ValueError('place a .sf2 in skill assets or provide --soundfont')
    engine = shutil.which('fluidsynth')
    if not engine:
        raise ValueError('FluidSynth unavailable; MIDI preserved, no audio rendered')
    source, out = map(lambda p: pathlib.Path(p).resolve(), (args.midi, args.out))
    if not font.is_file() or font.suffix.lower() != '.sf2':
        raise ValueError('provide an existing .sf2; license must be checked separately')
    if not source.is_file():
        raise ValueError('MIDI input missing')
    if out.suffix.lower() != '.wav' or out.exists() or out in (font, source):
        raise ValueError('output must be a new .wav path')
    rate = number(args.rate, 'rate', 8000, 192000, True)
    subprocess.run([engine, '-ni', '-r', str(rate), '-T', 'wav', '-O', 's16',
                    '-F', str(out), str(font), str(source)], check=True, timeout=300)
    with wave.open(str(out), 'rb') as audio:
        info = {'sample_rate': audio.getframerate(), 'channels': audio.getnchannels(),
                'frames': audio.getnframes()}
        if info['frames'] == 0:
            raise ValueError('renderer produced empty audio')
    return {'path': str(out), 'status': 'rendered', 'wav': info,
            'soundfont_path': str(font),
            'soundfont_sha256': hashlib.sha256(font.read_bytes()).hexdigest(),
            'listening_verified': False, 'license_verified': False}


def decode(raw, width):
    if width == 3:
        return [int.from_bytes(raw[i:i+3], 'little', signed=True) / 8388608
                for i in range(0, len(raw), 3)]
    values = array.array('h' if width == 2 else 'i')
    values.frombytes(raw)
    if sys.byteorder != 'little':
        values.byteswap()
    scale = 2 ** (width * 8 - 1)
    return [x / scale for x in values]


def verify(args):
    path = pathlib.Path(args.wav)
    with wave.open(str(path), 'rb') as audio:
        channels, width, rate, frames = (audio.getnchannels(), audio.getsampwidth(),
                                        audio.getframerate(), audio.getnframes())
        if audio.getcomptype() != 'NONE' or width not in (2, 3, 4) or channels not in (1, 2):
            raise ValueError('expected PCM integer 16/24/32-bit mono/stereo WAV')
        start, end = args.start, frames if args.end is None else args.end
        if not 0 <= start < end <= frames or end - start < 3:
            raise ValueError('invalid loop range; end is exclusive, need at least 3 frames')
        audio.setpos(start)
        count, peak, clips = 0, 0.0, 0
        sums = [0.0] * channels
        scale = 2 ** (width * 8 - 1)
        remaining = end - start
        while remaining:
            block_frames = min(65536, remaining)
            block = decode(audio.readframes(block_frames), width)
            if len(block) != block_frames * channels:
                raise ValueError('truncated WAV data')
            for index, value in enumerate(block):
                peak = max(peak, abs(value))
                clips += int(value <= -1 or value >= (scale-1)/scale)
                sums[index % channels] += value
            count += block_frames
            remaining -= block_frames
        window = min(round(rate * 0.02), count)
        audio.setpos(start)
        head = decode(audio.readframes(window), width)
        audio.setpos(end - window)
        tail = decode(audio.readframes(window), width)
    per_channel = []
    flags = []
    for channel in range(channels):
        h, t = head[channel::channels], tail[channel::channels]
        jump = h[0] - t[-1]
        # Compare the new join slope to both adjacent within-file slopes.
        slope_error = max(abs(jump - (t[-1]-t[-2])), abs((h[1]-h[0])-jump))
        rms_h = math.sqrt(sum(x*x for x in h) / len(h))
        rms_t = math.sqrt(sum(x*x for x in t) / len(t))
        ratio = 20 * math.log10(max(rms_h, 1e-12) / max(rms_t, 1e-12))
        dc = sums[channel] / count
        per_channel.append({'channel': channel, 'boundary_jump': jump,
                            'boundary_slope_error': slope_error, 'dc': dc,
                            'head_rms': rms_h, 'tail_rms': rms_t, 'rms_delta_db': ratio})
        if abs(jump) > 0.02:
            flags.append(f'channel {channel}: boundary jump')
        if abs(dc) > 0.005:
            flags.append(f'channel {channel}: DC offset')
        if abs(ratio) > 6:
            flags.append(f'channel {channel}: boundary energy change')
    if clips:
        flags.append('samples reach PCM rail')
    result = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'sample_rate': rate, 'channels': channels, 'loop_start_sample': start,
              'loop_end_sample': end, 'loop_seconds': count / rate, 'sample_peak': peak,
              'rail_samples': clips, 'channel_metrics': per_channel, 'review_flags': flags,
              'automatic_result': 'review-required' if flags else 'no-numerical-flags',
              'listening_verified': False, 'game_verified': False,
              'true_peak_lufs': 'not measured', 'seamless_verified': False}
    save_json(args.out, result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('probe')
    p.add_argument('--soundfont', action='append', default=[])
    p.add_argument('--out')
    p.set_defaults(run=probe)
    p = sub.add_parser('midi')
    p.add_argument('spec')
    p.add_argument('--out', required=True)
    p.set_defaults(run=midi)
    p = sub.add_parser('render')
    p.add_argument('midi')
    p.add_argument('--soundfont', help='override the SoundFont in skill assets')
    p.add_argument('--out', required=True)
    p.add_argument('--rate', type=int, default=44100)
    p.set_defaults(run=render)
    p = sub.add_parser('verify')
    p.add_argument('wav')
    p.add_argument('--start', type=int, default=0)
    p.add_argument('--end', type=int)
    p.add_argument('--out', required=True)
    p.set_defaults(run=verify)
    args = parser.parse_args()
    try:
        result = args.run(args)
    except (ValueError, KeyError, TypeError, OSError, wave.Error,
            subprocess.SubprocessError) as error:
        parser.exit(2, f'Error: {error}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
