"""Generate a WAV voiceover with Kokoro using owner-supplied local model files."""
import argparse
import math
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--text', required=True)
    parser.add_argument('--voice', required=True)
    parser.add_argument('--model', required=True, type=Path)
    parser.add_argument('--voices', required=True, type=Path)
    parser.add_argument('--language', default='en-us')
    parser.add_argument('--speed', type=float, default=1.0)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if not args.text.strip():
        parser.error('text must not be empty')
    if not args.voice.strip():
        parser.error('voice must not be empty')
    if not math.isfinite(args.speed) or args.speed <= 0:
        parser.error('speed must be finite and positive')
    for label, path in [('model', args.model), ('voices', args.voices)]:
        if not path.is_file():
            parser.error(f'{label} file not found: {path}. Supply local Kokoro files; this script does not download weights.')
    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
    except ImportError as error:
        parser.exit(1, f'Kokoro voiceover needs pip install kokoro-onnx soundfile: {error}\n')
    try:
        kokoro = Kokoro(str(args.model), str(args.voices))
        samples, rate = kokoro.create(args.text, voice=args.voice, speed=args.speed, lang=args.language)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(args.output), samples, rate, format='WAV', subtype='FLOAT')
    except Exception as error:
        parser.exit(1, f'Kokoro voiceover failed: {error}\n')
    print(f'Created {args.output}')


if __name__ == '__main__':
    main()
