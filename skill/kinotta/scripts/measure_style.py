"""Measure reference videos for a suggested style (docs/plans/2026-10-31-style-from-examples.md).

usage: python3 measure_style.py ref1.mp4 [ref2.mp4 ...] [--transcripts t1.json t2.json ...] [--scene 0.3]

For each reference, from the file alone: its frame (width, height, "9:16"-style shape) and length, its cuts (FFmpeg
scene changes above --scene) with shots per minute and the median shot, and its integrated loudness (LUFS). With a
transcript per reference ({ "words": [{ text, start, end }] }, in the same order), also words per minute and the median
pause between words. Prints JSON: "references" and, for two or more, "summary" (the median of each measure across
references, with the spread, so a rule only one reference supports can be marked as such).

Everything here is measured. What the frames show (caption style, b-roll share, colour) is for the agent to infer from
the contact sheets and to label as inferred. Needs FFmpeg and ffprobe.
"""
import argparse, json, math, re, subprocess, sys

def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', str(path)], capture_output=True, text=True)
    if out.returncode != 0: sys.exit(f'Could not read {path}: {out.stderr.strip()}')
    info = json.loads(out.stdout)
    video = next((s for s in info['streams'] if s.get('codec_type') == 'video'), None)
    if video is None: sys.exit(f'{path} has no picture to measure.')
    return int(video['width']), int(video['height']), float(info['format']['duration']), any(s.get('codec_type') == 'audio' for s in info['streams'])

def shape(width, height):
    g = math.gcd(width, height); w, h = width // g, height // g
    for named, ratio in (('16:9', 16 / 9), ('9:16', 9 / 16), ('1:1', 1), ('4:5', 4 / 5), ('4:3', 4 / 3)):
        if abs(width / height - ratio) < 0.02: return named
    return f'{w}:{h}'

def cuts(path, threshold):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-an', '-vf', f"select='gt(scene,{threshold})',showinfo", '-f', 'null', '-'], capture_output=True, text=True)
    return [round(float(t), 3) for t in re.findall(r'pts_time:([0-9.]+)', out.stderr)]

def loudness(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-vn', '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    found = re.findall(r'I:\s+(-?[0-9.]+) LUFS', out.stderr)
    return float(found[-1]) if found else None

def median(values):
    ordered = sorted(values); n = len(ordered)
    if n == 0: return None
    return ordered[n // 2] if n % 2 else (ordered[n // 2 - 1] + ordered[n // 2]) / 2

def speech(transcript):
    words = json.load(open(transcript, encoding='utf-8'))['words']
    if len(words) < 2: return {}
    spoken = words[-1]['end'] - words[0]['start']
    pauses = [b['start'] - a['end'] for a, b in zip(words, words[1:]) if b['start'] - a['end'] > 0.05]
    return {'wordsPerMinute': round(len(words) / spoken * 60, 1) if spoken > 0 else None, 'medianPause': round(median(pauses), 3) if pauses else 0.0}

def measure(path, threshold, transcript=None):
    width, height, duration, has_audio = probe(path)
    found = cuts(path, threshold)
    bounds = [0.0, *found, duration]
    shots = [b - a for a, b in zip(bounds, bounds[1:]) if b - a > 0]
    result = {'file': str(path), 'width': width, 'height': height, 'shape': shape(width, height), 'duration': round(duration, 3),
              'cuts': found, 'shotsPerMinute': round(len(shots) / duration * 60, 1) if duration else None, 'medianShot': round(median(shots), 2) if shots else None,
              'loudness': loudness(path) if has_audio else None}
    if transcript: result.update(speech(transcript))
    return result

def summary(references):
    keys = ['shotsPerMinute', 'medianShot', 'loudness', 'wordsPerMinute', 'medianPause']
    out = {}
    for key in keys:
        values = [r[key] for r in references if r.get(key) is not None]
        if values: out[key] = {'median': round(median(values), 2), 'min': min(values), 'max': max(values), 'of': len(values)}
    shapes = sorted({r['shape'] for r in references})
    out['shape'] = shapes[0] if len(shapes) == 1 else shapes
    return out

if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    args.add_argument('videos', nargs='+'); args.add_argument('--transcripts', nargs='*', default=[]); args.add_argument('--scene', type=float, default=0.3)
    a = args.parse_args()
    if a.transcripts and len(a.transcripts) != len(a.videos): sys.exit('Give one transcript per reference, in the same order, or none.')
    refs = [measure(v, a.scene, a.transcripts[i] if a.transcripts else None) for i, v in enumerate(a.videos)]
    print(json.dumps({'references': refs, **({'summary': summary(refs)} if len(refs) > 1 else {})}, indent=1))
