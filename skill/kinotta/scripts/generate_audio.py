"""Generate a WAV with Stable Audio Open from an owner-supplied local Diffusers model."""
import argparse
import math
from pathlib import Path

MAX_SECONDS = 47
INFERENCE_STEPS = 100


def generate_stable_audio(prompt, seconds, model, seed):
    """The named provider boundary. All model/runtime calls stay here."""
    import torch
    from diffusers import StableAudioPipeline
    if not torch.cuda.is_available():
        raise RuntimeError('Stable Audio generation requires CUDA for half precision.')
    pipeline = StableAudioPipeline.from_pretrained(
        str(model), torch_dtype=torch.float16, local_files_only=True,
    ).to('cuda')
    generator = torch.Generator(device='cuda').manual_seed(seed)
    with torch.inference_mode():
        result = pipeline(prompt, audio_start_in_s=0.0, audio_end_in_s=seconds,
                          num_inference_steps=INFERENCE_STEPS, generator=generator)
    samples = result.audios[0].T.float().cpu().numpy()
    rate = pipeline.vae.sampling_rate
    return samples[:round(seconds * rate)], rate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--seconds', required=True, type=float)
    parser.add_argument('--model', required=True, type=Path)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if not args.prompt.strip():
        parser.error('prompt must not be empty')
    if not math.isfinite(args.seconds) or not 0 < args.seconds <= MAX_SECONDS:
        parser.error(f'seconds must be finite, greater than 0 and at most {MAX_SECONDS}')
    if not args.model.is_dir():
        parser.error('model directory not found. Supply a local Stable Audio Open Diffusers snapshot; this script does not download weights.')
    try:
        import soundfile as sf
        samples, rate = generate_stable_audio(args.prompt, args.seconds, args.model, args.seed)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(args.output), samples, rate, format='WAV', subtype='FLOAT')
    except Exception as error:
        parser.exit(1, f'Stable Audio generation failed: {error}\n')
    print(f'Created {args.output}')


if __name__ == '__main__':
    main()
