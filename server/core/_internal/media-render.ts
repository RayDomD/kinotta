import { resolve } from 'node:path';
import { audioExpression } from './media-audio.ts';
import { mediaTimeline, trackGain } from './media-model.ts';
import type { MediaPlan, MediaSource, SourcePlacement } from './media-model.ts';
import { KinottaError } from './errors.ts';

const RATE = 48000;
/**
 * Mono plays at full level on both sides, as the browser preview's Web Audio up-mix plays it. FFmpeg's own mono to stereo
 * conversion lowers it by 3 dB, which made a mono source render quieter than it previewed. Stereo passes unchanged.
 */
const UPMIX = 'pan=stereo|FL=FL+FC|FR=FR+FC';
/** A placement with sound, on reel time. */
type TimedPlacement = SourcePlacement & { at: number; duration: number };

/** Whether a placement adds sound to the mix: an insert's own sound starts muted (AM22), and Mute is saved (AM29). */
function isAudible(p: TimedPlacement, source: MediaSource, media: MediaPlan): boolean {
  return source.kind !== 'image' && source.audio !== false && !p.mute && trackGain(media, p) > 0 && (p.role !== 'insert' || p.mute === false);
}

/** One placement's sound on reel time, labelled `[a<input>]`: its range, loop, envelope and start, as preview plays it. */
function placementSound(p: TimedPlacement, input: number, media: MediaPlan): string {
  const loop = p.loop ? `,aloop=loop=-1:size=${Math.round((p.out - p.in) * RATE)}` : '';
  const envelope = `(${audioExpression(p, p.duration)})*${trackGain(media, p)}`;
  return `[${input}:a]${UPMIX},aresample=${RATE},aformat=channel_layouts=stereo,atrim=start=${p.in}:end=${p.out},asetpts=PTS-STARTPTS${loop},atrim=duration=${p.duration},aeval=exprs='val(0)*(${envelope})|val(1)*(${envelope})':channel_layout=stereo,adelay=${Math.round(p.at * RATE)}S:all=1[a${input}]`;
}

/** The whole-reel mix, labelled `[a]`: summed without normalizing or limiting (AM38), cut at the reel end (AM41). */
function mixSounds(sounds: string[], duration: number): string {
  return `${sounds.join('')}amix=inputs=${sounds.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${duration},aformat=channel_layouts=stereo[a]`;
}

/**
 * The same mix as `mediaRenderArgs`, sound only, with one peak printed per `window` seconds, for finding overload. Null
 * when nothing in the reel makes a sound.
 */
export function mediaMixArgs(media: MediaPlan, planDir: string, duration: number, window: number): string[] | null {
  const timeline = mediaTimeline(media, duration);
  const args = ['-v', 'error'];
  const graph: string[] = [];
  const sounds: string[] = [];
  for (const p of timeline.placements) {
    if (p.role === 'gap' || p.duration <= 0 || p.attachmentBroken) continue;
    const source = media.sources.find((s) => s.id === p.source)!;
    if (!isAudible(p, source, media)) continue;
    const input = sounds.length;
    args.push('-i', resolve(planDir, source.path));
    graph.push(placementSound(p, input, media));
    sounds.push(`[a${input}]`);
  }
  if (!sounds.length) return null;
  graph.push(mixSounds(sounds, timeline.duration));
  graph.push(`[a]asetnsamples=n=${Math.max(1, Math.round(window * RATE))}:p=0,astats=metadata=1:reset=1,ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file=-[out]`);
  return [...args, '-filter_complex', graph.join(';'), '-map', '[out]', '-f', 'null', '-'];
}

/** One whole-reel composition after the authored graphics' frames have been rendered. */
export function mediaRenderArgs(media: MediaPlan, planDir: string, overlay: string, out: string, duration: number, width: number, height: number, fps: string, crf: number): { args: string[]; sound: boolean } {
  const timeline = mediaTimeline(media, duration);
  if (timeline.placements.some((p) => p.attachmentBroken)) throw new KinottaError('invalid', 'Repair broken footage attachments before rendering.');
  const args = ['-loglevel', 'error', '-y', '-i', overlay];
  const graph = [`color=c=black:s=${width}x${height}:r=${fps}:d=${timeline.duration}[base]`];
  const sounds: string[] = [];
  let picture = 'base';
  let input = 1;
  for (const p of timeline.placements) {
    if (p.role === 'gap' || p.duration <= 0) continue;
    const source = media.sources.find((s) => s.id === p.source)!;
    const visible = p.role !== 'audio' && source.kind !== 'audio';
    const audible = isAudible(p, source, media);
    if (!visible && !audible) continue;
    if (source.kind === 'image') args.push('-loop', '1', '-framerate', fps);
    args.push('-i', resolve(planDir, source.path));
    if (visible) {
      const trim = source.kind === 'image' ? `trim=duration=${p.duration}` : `trim=start=${p.in}:end=${p.out}`;
      const x = p.framing?.x ?? 0.5;
      const y = p.framing?.y ?? 0.5;
      const framing = p.framing?.mode === 'fit'
        ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)*${x}:(oh-ih)*${y}`
        : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-ow)*${x}:(ih-oh)*${y}`;
      graph.push(`[${input}:v]${trim},setpts=PTS-STARTPTS,fps=${fps},${framing},setsar=1,format=rgba,setpts=PTS+${p.at}/TB[v${input}]`);
      graph.push(`[${picture}][v${input}]overlay=eof_action=pass:repeatlast=0:enable='gte(t,${p.at})*lt(t,${p.at + p.duration})'[p${input}]`);
      picture = `p${input}`;
    }
    if (audible) {
      graph.push(placementSound(p, input, media));
      sounds.push(`[a${input}]`);
    }
    input++;
  }
  graph.push(`[0:v]scale=${width}:${height},format=rgba[graphics]`);
  graph.push(`[${picture}][graphics]overlay=eof_action=pass:repeatlast=0,format=yuv420p[v]`);
  if (sounds.length) graph.push(mixSounds(sounds, timeline.duration));
  args.push('-filter_complex', graph.join(';'), '-map', '[v]');
  if (sounds.length) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
  args.push('-c:v', 'libx264', '-crf', String(crf), '-t', String(timeline.duration), '-movflags', '+faststart', out);
  return { args, sound: sounds.length > 0 };
}
