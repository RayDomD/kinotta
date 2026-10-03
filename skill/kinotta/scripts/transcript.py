"""A reel's transcript.json from an SRT or VTT, or from the video's audio with faster-whisper.
usage: python3 transcript.py captions.srt|captions.vtt reels/<slug>/transcript.json
       python3 transcript.py --audio video.mp4 reels/<slug>/transcript.json      (needs: pip install faster-whisper)
Writes { "words": [ { "text", "start", "end" } ] } in seconds. From captions, each cue's words are spread across
its time by their length, so word times are estimates (about 0.2s); from audio they are the model's own."""
import json, re, sys, pathlib

def stamp(x):
    h, m, s = (['0'] + x.strip().replace(',', '.').split(':'))[-3:]
    return int(h) * 3600 + int(m) * 60 + float(s)

def from_captions(path):
    words = []
    for block in re.split(r'\n\s*\n', open(path, encoding='utf-8-sig').read().replace('\r\n', '\n').strip()):
        lines = block.strip().split('\n')
        timing = next((i for i, l in enumerate(lines) if '-->' in l), None)
        if timing is None: continue
        a, b = [stamp(x.split()[0]) for x in lines[timing].split('-->')]
        text = re.sub(r'<[^>]+>', '', ' '.join(lines[timing + 1:])).split()
        n = sum(len(w) + 1 for w in text); c = 0
        for w in text:
            words.append({'text': w, 'start': round(a + (b - a) * c / n, 3), 'end': round(a + (b - a) * (c + len(w)) / n, 3)})
            c += len(w) + 1
    return words

def from_audio(video):
    from faster_whisper import WhisperModel
    segments, _ = WhisperModel('small').transcribe(video, word_timestamps=True)
    return [{'text': w.word.strip(), 'start': round(w.start, 3), 'end': round(w.end, 3)} for s in segments for w in s.words if w.word.strip()]

if __name__ == '__main__':
    words = from_audio(sys.argv[2]) if sys.argv[1] == '--audio' else from_captions(sys.argv[1])
    out = pathlib.Path(sys.argv[-1]); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({'words': words}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(words)} words -> {out}')
