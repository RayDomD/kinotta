"""Which words the speaker stresses, for captions.emphasis (docs/plans/2026-10-31-stressed-word-captions.md).

usage: python3 stress.py <video-or-audio> <transcript.json> [--placement ID] [--max 2] [--min-score 3]

Reads the words ({ "words": [{ text, start, end }] }, source seconds) and the audio, groups the words into the same
caption phrases the builder draws (build.py `phrases`), and scores each word against the others in its phrase: how
much louder it is (dB over the phrase's median) plus how much longer than the phrase's median word, in the same units.
Prints JSON: "emphasis" (at most --max words a phrase scoring at least --min-score, ready for the plan's
captions.emphasis) and "words" (every word's measure, for a look before using it). Needs FFmpeg and numpy. A
suggestion, not a decision: read it against the meaning, and say in the hand-over which words were set apart.
"""
import argparse, json, math, pathlib, subprocess, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / 'engine'))
from build import phrases  # noqa: E402  the caption phrases the page will show

RATE = 16000
MIN_LETTERS = 3        # "a", "is", "to" are never the stressed word of a phrase
# Nor are these: said louder or longer, they are still not what a caption sets apart.
FUNCTION_WORDS = set('the and for you are but not was with that this from have has its our your they them then than '
    'just also into onto what when which who will would can could should there their here been were she his her him'.split())
LENGTH_WEIGHT = 6.0    # a word twice the phrase's median length scores like one 6 dB louder

def samples(path):
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', str(RATE), '-f', 's16le', '-'], capture_output=True)
    if raw.returncode != 0: sys.exit(f'Could not read the audio of {path}: {raw.stderr.decode(errors="replace").strip()}')
    return np.frombuffer(raw.stdout, dtype=np.int16).astype(np.float32) / 32768.0

def loudness(audio, start, end):
    import numpy as np
    part = audio[max(0, int(start * RATE)):max(0, int(end * RATE))]
    if part.size == 0: return -120.0
    return 20 * math.log10(max(float(np.sqrt(np.mean(part * part))), 1e-6))

def letters(text):
    return sum(ch.isalnum() for ch in text)

def candidate(text):
    bare = ''.join(ch for ch in text.lower() if ch.isalnum() or ch == "'")
    return letters(text) >= MIN_LETTERS and bare not in FUNCTION_WORDS

def median(values):
    ordered = sorted(values); n = len(ordered)
    return 0.0 if n == 0 else (ordered[n // 2] if n % 2 else (ordered[n // 2 - 1] + ordered[n // 2]) / 2)

def measure(audio, words, most=2, min_score=3.0, placement=None):
    timed = [{**w, 'at': w['start']} for w in words]
    measured, emphasis = [], []
    for phrase in phrases(timed):
        ws = phrase['words']
        dbs = [loudness(audio, w['start'], w['end']) for w in ws]
        lengths = [max(w['end'] - w['start'], 0.01) for w in ws]
        mid_db, mid_len = median(dbs), median(lengths)
        scored = []
        for w, db, length in zip(ws, dbs, lengths):
            score = (db - mid_db) + LENGTH_WEIGHT * math.log2(length / mid_len)
            entry = {'text': w['text'], 'at': w['start'], 'db': round(db, 2), 'score': round(score, 2) + 0.0}
            measured.append(entry)
            if len(ws) >= 3 and candidate(w['text']) and score >= min_score: scored.append(entry)
        for entry in sorted(scored, key=lambda e: -e['score'])[:most]:
            emphasis.append({'at': entry['at'], **({'placement': placement} if placement else {})})
    return {'emphasis': sorted(emphasis, key=lambda e: e['at']), 'words': measured}

if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    args.add_argument('media'); args.add_argument('transcript')
    args.add_argument('--placement'); args.add_argument('--max', type=int, default=2); args.add_argument('--min-score', type=float, default=3.0)
    a = args.parse_args()
    words = json.load(open(a.transcript, encoding='utf-8'))['words']
    print(json.dumps(measure(samples(a.media), words, a.max, a.min_score, a.placement), indent=1))
