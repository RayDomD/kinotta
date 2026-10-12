"""Local music beat grid. Requires librosa 0.11 and FFmpeg, never fetches audio or models.

usage: python beats.py music.wav beats.json [--beats-per-bar 4] [--first-downbeat INDEX]
Downbeats are an accent-based meter estimate unless the first downbeat is supplied.
"""
import argparse, json, pathlib, subprocess, sys

RATE = 22050
HOP = 256
ALIGN_SECONDS = 0.05

def detect(path, beats_per_bar=4, first_downbeat=None):
    try:
        import librosa, numpy as np
    except ImportError:
        raise RuntimeError('Beat detection needs: pip install librosa==0.11.0')
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'], capture_output=True)
    if decoded.returncode:
        raise RuntimeError('FFmpeg could not read the audio: ' + decoded.stderr.decode(errors='replace')[-300:])
    audio = np.frombuffer(decoded.stdout, dtype=np.float32)
    if not len(audio) or np.max(np.abs(audio)) < 1e-7:
        return {'tempo': 0, 'beats': [], 'downbeats': []}
    _, frames = librosa.beat.beat_track(y=audio, sr=RATE, hop_length=HOP, trim=False)
    if len(frames) < 2:
        return {'tempo': 0, 'beats': [], 'downbeats': []}
    # Align the periodic estimate to nearby onset starts, without inventing onsets.
    starts = librosa.onset.onset_detect(y=audio, sr=RATE, hop_length=HOP, backtrack=True, units='time')
    times = librosa.frames_to_time(frames, sr=RATE, hop_length=HOP)
    beats = []
    for time in times:
        near = starts[np.argmin(np.abs(starts - time))] if len(starts) else time
        time = near if abs(near - time) <= ALIGN_SECONDS else time
        time = round(float(time), 6)
        if 0 <= time < len(audio) / RATE and (not beats or time > beats[-1]): beats.append(time)
    tempo = round(float(60 / np.median(np.diff(beats))), 3) if len(beats) > 1 else 0
    strength = []
    for time in beats:
        window = audio[max(0, int((time - ALIGN_SECONDS) * RATE)):min(len(audio), int((time + ALIGN_SECONDS) * RATE))]
        strength.append(float(np.max(np.abs(window))) if len(window) else 0)
    phase = first_downbeat
    if phase is None:
        phase = max(range(min(beats_per_bar, len(beats))), key=lambda offset: float(np.mean(strength[offset::beats_per_bar])))
    return {'tempo': tempo, 'beats': beats, 'downbeats': beats[phase::beats_per_bar]}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('audio', type=pathlib.Path)
    parser.add_argument('output', nargs='?', type=pathlib.Path, help='Omit to print JSON')
    parser.add_argument('--beats-per-bar', type=int, default=4)
    parser.add_argument('--first-downbeat', type=int)
    args = parser.parse_args()
    if not args.audio.is_file(): parser.error('audio file not found')
    if not 1 <= args.beats_per_bar <= 12: parser.error('beats per bar must be 1-12')
    if args.first_downbeat is not None and args.first_downbeat < 0: parser.error('first downbeat must be a nonnegative beat index')
    try:
        grid = detect(args.audio, args.beats_per_bar, args.first_downbeat)
    except (RuntimeError, OSError) as error:
        parser.error(str(error))
    text = json.dumps(grid, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding='utf-8')
    else:
        sys.stdout.write(text)

if __name__ == '__main__': main()
