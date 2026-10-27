import { useEffect, useMemo, useState } from 'react';
import {
  fetchBrandFonts,
  fetchReels,
  fetchReelStyle,
  fetchStyles,
  saveDefaultStyle,
  saveStyle,
  startReel,
  startStyledBrief,
} from './api/_internal/client.ts';
import type { BrandFonts, ReelSummary, Style, VideoEntry } from './api/_internal/client.ts';
import { FORMS, FRAMES, LOOKS, agentTold, formById, frameOf, lookById, musicChoice, styleLook } from '../../server/core/model.ts';
import type { Frame, MusicChoice } from '../../server/core/model.ts';
import { useAgentConfirmation, VideoCard } from './SimpleMake.tsx';
import { DropCard, FONT_FILE, MUSIC_FILE, OwnFontPanel, OwnMusicPanel, takeFont, takeMusic } from './DirectionOwnFiles.tsx';
import type { OwnFont, OwnMusic } from './DirectionOwnFiles.tsx';
import { formatClock } from './timecode.ts';

export interface DirectionProps {
  video: VideoEntry;
  title: string;
  onBack(): void;
  onStarted(slug: string): void;
}

const STEPS = ['What', 'Style', 'Fonts and music', 'Extras', 'Check'] as const;
type Step = 1 | 2 | 3 | 4 | 5;
type Setting = 'broll' | 'captions' | 'pace';
const DIALS: { key: Setting; name: string; values: { value: string; label: string; hint: string }[] }[] = [
  { key: 'broll', name: 'B-roll', values: [
    { value: 'light', label: 'Light', hint: 'A few cutaways on the key moments.' },
    { value: 'medium', label: 'Medium', hint: 'About a third of the video covered.' },
    { value: 'heavy', label: 'Heavy', hint: 'Graphics on most lines.' },
  ] },
  { key: 'captions', name: 'Captions', values: [
    { value: 'off', label: 'Off', hint: 'No captions.' },
    { value: 'phrases', label: 'Phrase', hint: 'The phrase, with the spoken word lit.' },
    { value: 'word-by-word', label: 'Word by word', hint: 'Each word as it is said.' },
  ] },
  { key: 'pace', name: 'Pace', values: [
    { value: 'calm', label: 'Calm', hint: 'Shots hold; nothing hurries.' },
    { value: 'normal', label: 'Normal', hint: 'A cutaway every few seconds.' },
    { value: 'fast', label: 'Fast', hint: 'Quick cutaways, rapid cuts.' },
  ] },
];
/** Fonts offered beside the brand's, named in plain words. The agent is told the family by name. */
const OTHER_FONTS = [
  { id: 'fraunces', words: 'Fraunces', description: 'A warm serif. Editorial.', face: 'Georgia, serif' },
  { id: 'space-grotesk', words: 'Space Grotesk', description: 'A sharp sans. Technical.', face: "'Segoe UI', sans-serif" },
];
const MUSIC: { id: Exclude<MusicChoice, 'file'>; label: string; description: string; mark: string }[] = [
  { id: 'kinotta', label: 'Kinotta picks', description: 'A score made to fit the cut.', mark: '≋' },
  { id: 'none', label: 'No music', description: 'Only the sound in your video.', mark: '∅' },
];
const EFFECT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Your own font as the style records it, so the agent finds the file: `Brand Sans (fonts/BrandSans.woff2)`. */
const OWN_FONT = /^(.*) \((fonts\/[^)]+)\)$/;
const ownFontName = (font: OwnFont): string => `${font.family} (${font.path})`;
const slugify = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** A look's still: a small drawing of what the style does to a frame, in the editor's own neutral marks. */
function LookStill({ look }: { look: string | undefined }) {
  return <span className={`dx-still dx-still-${look ?? 'saved'}`} aria-hidden="true"><i /><b /></span>;
}

function Choice({ on, onClick, children, className = '' }: { on: boolean; onClick(): void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`dx-card ${on ? 'on' : ''} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * Direct: five short steps that record the reel's style before the first build. Every choice lands in one style
 * record; Check shows it beside the exact lines the agent will be given, and Build sends that style with the reel.
 */
export function Direction({ video, title, onBack, onStarted }: DirectionProps) {
  const confirmation = useAgentConfirmation();
  const [step, setStep] = useState<Step>(1);
  const [styles, setStyles] = useState<Style[]>([]);
  const [reels, setReels] = useState<ReelSummary[]>([]);
  const [brand, setBrand] = useState<BrandFonts | null>(null);
  // The style the choices start from: a built-in, a saved style, or another reel's copy.
  const [base, setBase] = useState<Style | null>(null);
  const [basePicked, setBasePicked] = useState(false);
  const [fromReel, setFromReel] = useState<string | null>(null);
  const [form, setForm] = useState('decide');
  const [about, setAbout] = useState('');
  const [mine, setMine] = useState<Partial<Record<Setting, string>>>({});
  const [font, setFont] = useState<string>('brand');
  const [music, setMusic] = useState<MusicChoice>('kinotta');
  const [ownFont, setOwnFont] = useState<OwnFont | null>(null);
  const [ownMusic, setOwnMusic] = useState<OwnMusic | null>(null);
  const [copying, setCopying] = useState<'font' | 'music' | null>(null);
  const [dropProblem, setDropProblem] = useState('');
  const [effects, setEffects] = useState<string[]>([]);
  const [effectDraft, setEffectDraft] = useState('');
  const [shots, setShots] = useState('');
  const [rulesOff, setRulesOff] = useState<string[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveScope, setSaveScope] = useState<'user' | 'project'>('user');
  const [saveDefault, setSaveDefault] = useState(true);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchStyles().then((listing) => {
      setStyles(listing.styles);
      const usual = listing.styles.find((style) => style.id === listing.defaultId) ?? null;
      setBase((current) => current ?? usual);
      if (usual?.form && formById(usual.form)) setForm(usual.form);
      if (usual) takeExtras(usual);
    }, (err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the styles.'));
    void fetchReels().then((listing) => setReels(listing.reels), () => setReels([]));
    void fetchBrandFonts().then(setBrand, () => setBrand(null));
  }, []);

  const formDef = formById(form)!;
  const footage = formDef.footage !== false;
  const detected = frameOf(video.width, video.height);
  const frame: Frame | undefined = footage ? detected : 'landscape';
  const lookId = base ? styleLook(base) : undefined;

  /** A form fills the style until you pick one, and a footage look never stays on a code-built form. */
  const pickForm = (id: string) => {
    const next = formById(id)!;
    setForm(id);
    const nextFootage = next.footage !== false;
    const current = lookById(lookId);
    const mismatch = current !== undefined && current.footage !== nextFootage;
    if (!basePicked || mismatch) {
      const builtin = styles.find((style) => style.scope === 'builtin' && style.id === next.look);
      if (builtin) { setBase(builtin); setFromReel(null); }
    }
  };
  /** A style brings its fonts, music, effects and shots; settings you changed stay yours. */
  const takeExtras = (style: Style) => {
    const own = OWN_FONT.exec(style.fonts?.words ?? '') ?? OWN_FONT.exec(style.fonts?.numbers ?? '');
    if (own) {
      const words = OWN_FONT.test(style.fonts?.words ?? '');
      const numbers = OWN_FONT.test(style.fonts?.numbers ?? '');
      setOwnFont({ family: own[1]!, path: own[2]!, use: words && numbers ? 'both' : words ? 'words' : 'numbers' });
      setFont('own');
    } else setFont(OTHER_FONTS.find((f) => f.words === style.fonts?.words)?.id ?? 'brand');
    const choice = musicChoice(style);
    setMusic(choice);
    if (choice === 'file') setOwnMusic({ path: style.music!.file!, name: style.music!.file!.split('/').pop()!, fit: style.music!.fit ?? 'beat', duck: style.music!.duck ?? true });
    setEffects(style.effects);
    setShots(style.shots ?? '');
  };
  const pickBase = (style: Style, reel: string | null = null) => {
    setBase(style);
    setBasePicked(true);
    setFromReel(reel);
    setRulesOff([]);
    takeExtras(style);
  };

  const settings = { ...(base?.settings ?? {}), ...mine } as Style['settings'];
  const fontPick = OTHER_FONTS.find((f) => f.id === font);
  const style: Style | null = base && {
    ...base,
    form,
    ...(lookId ? { look: lookId } : {}),
    settings: footage ? settings : {},
    yours: footage ? [...new Set([...base.yours.filter((key) => !(key in mine)), ...Object.keys(mine)])] : [],
    fonts: font === 'own' && ownFont
      ? { words: ownFont.use === 'numbers' ? brand?.words ?? 'Geist' : ownFontName(ownFont), numbers: ownFont.use === 'words' ? brand?.numbers ?? 'Geist Mono' : ownFontName(ownFont) }
      : fontPick ? { words: fontPick.words, numbers: brand?.numbers ?? 'Geist Mono' } : undefined,
    music: music === 'none' ? {} : music === 'file' && ownMusic ? { file: ownMusic.path, fit: ownMusic.fit, duck: ownMusic.duck } : undefined,
    effects,
    ...(shots.trim() ? { shots: shots.trim() } : { shots: undefined }),
    rules: base.rules.filter((rule) => !rulesOff.includes(rule)),
  };
  // JSON drops the undefined keys, so the style that is sent matches what Check shows.
  const sendable = (input: Style): Style => JSON.parse(JSON.stringify(input)) as Style;
  const told = useMemo(
    () => (style ? agentTold(sendable(style), footage ? { about, frame, frameFound: detected !== undefined } : {}) : []),
    [JSON.stringify(style), about, frame, footage],
  );

  const aboutNeeded = !footage && !about.trim();
  const canBuild = style !== null && !aboutNeeded && !busy;

  const build = () => {
    if (!style || !canBuild) return;
    setBusy(true);
    setError('');
    void confirmation.confirm().then(async (confirmed) => {
      if (!confirmed) { setBusy(false); return; }
      const chosen = sendable(style);
      const started = footage
        ? startReel({ made: 'direct', agentConfirmed: true, video: video.path, title, deadAir: 'normal', ...(about.trim() ? { notes: about.trim() } : {}), style: chosen })
        : startStyledBrief({ made: 'direct', title, brief: about.trim(), style: chosen }).then(async (reel) => {
            // As with any brief: the request is on the clipboard when the browser allows it, and on the reel's page anyway.
            await navigator.clipboard.writeText(reel.request).catch(() => undefined);
            return reel;
          });
      const { slug } = await started;
      onStarted(slug);
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not start the reel. Try again.');
      setBusy(false);
    });
  };

  const saveAsMine = () => {
    if (!style || !saveName.trim()) return;
    let id = slugify(saveName) || 'my-style';
    if (LOOKS.some((look) => look.id === id)) id = `${id}-mine`;
    const { basedOn: _basedOn, ...rest } = sendable(style);
    // Saved with every rule: a switch turns a rule off for this reel only.
    const record: Style = { ...rest, id, name: saveName.trim(), scope: saveScope, basedOn: lookId ?? base!.id, rules: base!.rules };
    setSaved('');
    void saveStyle(saveScope, record)
      .then((stored) => (saveDefault ? saveDefaultStyle(stored.id) : stored))
      .then((stored) => {
        setStyles((list) => [...list.filter((s) => !(s.id === stored.id && s.scope === stored.scope)), stored]);
        setSaved(`Saved as ${stored.name}${saveScope === 'user' ? ' for you' : ' with this project'}${saveDefault ? '; Auto now uses it' : ''}.`);
      }, (err: unknown) => setSaved(err instanceof Error ? err.message : 'Could not save the style.'));
  };

  const addEffect = () => {
    const id = effectDraft.trim().toLowerCase();
    if (!EFFECT_ID.test(id)) return;
    setEffects((list) => (list.includes(id) ? list : [...list, id]));
    setEffectDraft('');
  };

  const looks = LOOKS.filter((look) => look.footage === footage);
  // A saved style built on a footage look is offered only for footage, and the other way round.
  const saved_ = styles.filter((s) => s.scope !== 'builtin' && (lookById(styleLook(s))?.footage ?? footage) === footage);
  const otherReels = reels.filter((reel) => reel.newestVersion !== null || reel.brief);
  const brandWords = brand?.words ?? 'Geist';
  const brandNumbers = brand?.numbers ?? 'Geist Mono';
  const fontName = font === 'own' && ownFont ? ownFont.family : fontPick ? fontPick.words : `${brand?.source === 'brand' ? 'Brand' : 'Built-in'} fonts`;
  const musicName = music === 'file' && ownMusic ? ownMusic.name : MUSIC.find((m) => m.id === music)?.label ?? 'Kinotta picks';
  const fontLine = font === 'own' && ownFont
    ? ownFont.use === 'words' ? `${ownFont.family} for words, ${brandNumbers} for numbers` : ownFont.use === 'numbers' ? `${brandWords} for words, ${ownFont.family} for numbers` : `${ownFont.family} for words and numbers`
    : `${fontPick ? fontPick.words : brandWords} for words, ${brandNumbers} for numbers`;

  /** Files dropped anywhere on Direction go to the row their type belongs to. */
  const takeFile = (file: File) => {
    setDropProblem('');
    const kind = FONT_FILE.test(file.name) ? 'font' : MUSIC_FILE.test(file.name) ? 'music' : null;
    if (!kind) { setDropProblem(`${file.name} is not a font or a music file.`); return; }
    setStep(3);
    setCopying(kind);
    const done = kind === 'font'
      ? takeFont(file).then((taken) => { setOwnFont(taken); setFont('own'); })
      : takeMusic(file).then((taken) => { setOwnMusic(taken); setMusic('file'); });
    done.catch((err: unknown) => setDropProblem(err instanceof Error ? err.message : 'Could not copy that file.')).finally(() => setCopying(null));
  };
  const changed = Object.keys(mine).length;

  const chips: [Step, string, boolean][] = [
    [1, formDef.label, form !== 'decide'],
    [2, base?.name ?? 'Style', basePicked || changed > 0],
    [3, fontName, font !== 'brand'],
    [3, musicName, music !== 'kinotta'],
    [4, effects.length ? `${effects.length} effect${effects.length === 1 ? '' : 's'}` : 'No effects', effects.length > 0],
  ];

  const nav = (
    <div className="dx-nav">
      <button type="button" className="dx-quiet" onClick={() => (step === 1 ? onBack() : setStep((step - 1) as Step))}>
        ← {step === 1 ? 'Back to Make' : 'Back'}
      </button>
      <span className="dx-grow" />
      {step < 5 && (
        <button type="button" className="dx-quiet" disabled={!canBuild} onClick={build}>Build now with these</button>
      )}
      {step < 5
        ? <button type="button" className="btn dx-next" onClick={() => setStep((step + 1) as Step)}>Next: {STEPS[step as 1 | 2 | 3 | 4].toLowerCase()} <span aria-hidden="true">→</span></button>
        : <button type="button" className="btn dx-next" disabled={!canBuild} onClick={build}>{busy ? 'Starting…' : <>Build the first cut <span aria-hidden="true">→</span></>}</button>}
    </div>
  );

  return (
    <main
      className="dx-wiz"
      aria-label="Direction"
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDrop={(event) => { const file = event.dataTransfer.files[0]; if (file) { event.preventDefault(); takeFile(file); } }}
    >
      <p className="dx-eyebrow">Direction · step <span className="dx-num">{step}</span> of <span className="dx-num">5</span></p>
      <ol className="dx-stepper" aria-label="Direction steps">
        {STEPS.map((name, i) => {
          const n = (i + 1) as Step;
          return (
            <li key={name}>
              <button type="button" className={n < step ? 'done' : ''} aria-current={n === step ? 'step' : undefined} onClick={() => setStep(n)}>
                <span className="dx-num">{String(n).padStart(2, '0')}</span> {name}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="dx-sofar" aria-label="So far">
        <span>So far</span>
        {chips.map(([n, label, yours], i) => (
          <button key={i} type="button" className={yours ? 'mine' : ''} onClick={() => setStep(n)}>{label}</button>
        ))}
      </div>

      {step === 1 && (
        <section className="dx-step" aria-labelledby="dx-h1">
          <h1 id="dx-h1">What are you making?</h1>
          <p className="dx-lede">This picks a starting style for you. Nothing here is required, and you can change it all later.</p>
          <div className="dx-forms" role="radiogroup" aria-label="What you are making">
            {FORMS.map((f) => (
              <Choice key={f.id} on={form === f.id} onClick={() => pickForm(f.id)} className="dx-form">
                <b>{f.label}</b>
                <span>{f.description}</span>
                <small>{f.footage === true ? 'Your video' : f.footage === false ? 'No footage' : 'Either'}</small>
              </Choice>
            ))}
          </div>
          {footage
            ? <VideoCard video={video} action={<button type="button" className="dx-quiet" onClick={onBack}>Change video</button>} />
            : <p className="dx-note">A {formDef.label.toLowerCase()} is built from graphics, so your video is left out of it.</p>}
          <label className="dx-field">
            <span className="dx-field-head">What&rsquo;s it about?<em className={aboutNeeded ? 'need' : ''}>{footage ? 'Optional with a video' : 'Needed: there is no footage'}</em></span>
            <textarea
              rows={3}
              maxLength={4000}
              value={about}
              placeholder={footage ? 'e.g. A weekend hike. The point is the long way home is the good part.' : 'e.g. Our new app in three steps; end on the tagline.'}
              onChange={(event) => setAbout(event.target.value)}
            />
          </label>
          <div className="dx-row">
            <span className="dx-row-name">Frame</span>
            <span className="dx-seg" role="group" aria-label="Frame">
              {FRAMES.map((f) => <span key={f.id} className={frame === f.id ? 'on' : ''} aria-current={frame === f.id ? 'true' : undefined}>{f.label}</span>)}
            </span>
            <span className="dx-row-hint">
              {footage
                ? detected ? `Found in your video (${video.width} × ${video.height}).` : 'Not found in your video; it keeps its own shape.'
                : 'Code-built reels are landscape for now.'}
            </span>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="dx-step" aria-labelledby="dx-h2">
          <h1 id="dx-h2">Pick a {footage ? 'style' : 'look'}</h1>
          <p className="dx-lede">{footage ? 'How the edit treats you and the words; your video stays the picture.' : 'How the graphics move and sit in depth.'}</p>
          <div className="dx-looks" role="radiogroup" aria-label={footage ? 'Style' : 'Look'}>
            {looks.map((look) => {
              const builtin = styles.find((s) => s.scope === 'builtin' && s.id === look.id);
              return builtin && (
                <Choice key={look.id} on={!fromReel && base?.id === look.id && base.scope === 'builtin'} onClick={() => pickBase(builtin)}>
                  <LookStill look={look.id} />
                  <b>{look.label}</b>
                  <span>{look.description}</span>
                </Choice>
              );
            })}
            {saved_.map((s) => (
              <Choice key={`${s.scope}/${s.id}`} on={!fromReel && base?.id === s.id && base.scope === s.scope} onClick={() => pickBase(s)}>
                <LookStill look={styleLook(s)} />
                <b>{s.name}</b>
                <span>{s.scope === 'user' ? 'Yours' : 'This project\'s'}{lookById(styleLook(s)) ? `, from ${lookById(styleLook(s))!.label}` : ''}{s.rules.length ? ` · ${s.rules.length} rule${s.rules.length === 1 ? '' : 's'}` : ''}</span>
              </Choice>
            ))}
          </div>
          <label className="dx-field dx-from-reel">
            <span className="dx-field-head">Start from another reel<em>A copy: changing this reel never changes that one</em></span>
            <select
              value={fromReel ?? ''}
              onChange={(event) => {
                const slug = event.target.value;
                if (!slug) return;
                void fetchReelStyle(slug).then((copy) => {
                  if (copy) pickBase({ ...copy, name: `From ${reels.find((r) => r.slug === slug)?.title ?? slug}` }, slug);
                  else setError('That reel has no style of its own yet.');
                }, (err: unknown) => setError(err instanceof Error ? err.message : 'Could not read that reel\'s style.'));
              }}
            >
              <option value="">Choose a reel</option>
              {otherReels.map((reel) => <option key={reel.slug} value={reel.slug}>{reel.title}</option>)}
            </select>
          </label>
          <details className="dx-tune">
            <summary><span>Fine-tune the details</span><em>{footage ? changed ? `${changed} changed by you` : 'Filled in by the style' : 'Nothing to tune for a code-built look'}</em></summary>
            {footage && DIALS.map((dial) => {
              const value = settings[dial.key];
              const yours = dial.key in mine;
              return (
                <div className="dx-row" key={dial.key}>
                  <span className="dx-row-name">{dial.name}</span>
                  <span className="dx-seg" role="group" aria-label={dial.name}>
                    {dial.values.map((v) => (
                      <button key={v.value} type="button" aria-pressed={value === v.value} className={`${value === v.value ? 'on' : ''} ${yours && value === v.value ? 'mine' : ''}`}
                        onClick={() => setMine((m) => ({ ...m, [dial.key]: v.value }))}>{v.label}</button>
                    ))}
                  </span>
                  <span className="dx-row-hint">
                    {dial.values.find((v) => v.value === value)?.hint ?? 'Kinotta decides.'}
                    {yours && <> <i className="dx-yours">· yours</i> <button type="button" className="dx-quiet dx-reset" onClick={() => setMine(({ [dial.key]: _gone, ...rest }) => rest)}>Use the style&rsquo;s</button></>}
                  </span>
                </div>
              );
            })}
          </details>
        </section>
      )}

      {step === 3 && (
        <section className="dx-step" aria-labelledby="dx-h3">
          <h1 id="dx-h3">Fonts and music</h1>
          <p className="dx-lede">Use ours, or drop your own files anywhere on this page.</p>
          <div className="dx-block-head"><h2>Fonts</h2><span>The fonts for all words on screen</span></div>
          <div className="dx-picks" role="radiogroup" aria-label="Fonts">
            <Choice on={font === 'brand'} onClick={() => setFont('brand')}>
              <span className="dx-aa">Aa <span className="dx-num">03</span></span>
              <b>{brand?.source === 'brand' ? 'Your brand fonts' : 'Kinotta\'s fonts'}</b>
              <span>{brandWords} for words, {brandNumbers} for numbers. {brand?.source === 'brand' ? <em className="dx-from">from your brand</em> : 'Your project has no brand file yet.'}</span>
            </Choice>
            {OTHER_FONTS.map((f) => (
              <Choice key={f.id} on={font === f.id} onClick={() => setFont(f.id)}>
                <span className="dx-aa" style={{ fontFamily: f.face }}>Aa</span>
                <b>{f.words}</b>
                <span>{f.description}</span>
              </Choice>
            ))}
            {ownFont
              ? <Choice on={font === 'own'} onClick={() => setFont('own')}>
                  <span className="dx-aa" style={ownFont.face ? { fontFamily: `"${ownFont.face}"` } : undefined}>Aa</span>
                  <b>{ownFont.family}</b>
                  <span>Your font</span>
                </Choice>
              : <DropCard label="Drop your own font" accept=".ttf,.otf,.woff,.woff2" hint=".ttf .otf .woff .woff2" busy={copying === 'font'} onFile={takeFile} />}
          </div>
          {ownFont && font === 'own' && (
            <OwnFontPanel font={ownFont} brandWords={brandWords} brandNumbers={brandNumbers} onUse={(use) => setOwnFont({ ...ownFont, use })} onRemove={() => { setOwnFont(null); setFont('brand'); }} />
          )}
          <div className="dx-block-head"><h2>Music</h2><span>{footage ? 'Lowered under your voice unless you say otherwise' : 'The reel is cut to it'}</span></div>
          <div className="dx-picks" role="radiogroup" aria-label="Music">
            {MUSIC.map((m) => (
              <Choice key={m.id} on={music === m.id} onClick={() => setMusic(m.id)}>
                <span className="dx-mark" aria-hidden="true">{m.mark}</span>
                <b>{m.label}</b>
                <span>{m.description}</span>
              </Choice>
            ))}
            {ownMusic
              ? <Choice on={music === 'file'} onClick={() => setMusic('file')}>
                  <span className="dx-mark" aria-hidden="true">♪</span>
                  <b>{ownMusic.name}</b>
                  <span>Your music</span>
                </Choice>
              : <DropCard label="Drop your own music" accept=".mp3,.wav,.m4a,.ogg,.aac,.flac" hint=".mp3 .wav .m4a .ogg" busy={copying === 'music'} onFile={takeFile} />}
          </div>
          {ownMusic && music === 'file' && (
            <OwnMusicPanel music={ownMusic} footage={footage} onChange={setOwnMusic} onRemove={() => { setOwnMusic(null); setMusic('kinotta'); }} />
          )}
          {dropProblem && <p className="dx-need" role="alert">{dropProblem}</p>}
        </section>
      )}

      {step === 4 && (
        <section className="dx-step" aria-labelledby="dx-h4">
          <h1 id="dx-h4">Anything specific?</h1>
          <p className="dx-lede">Optional. Name effects to try and the shots you want. The agent picks the rest.</p>
          <div className="dx-block-head"><h2>Effects to try</h2><span>By effect id, for example <code>checklist</code> or <code>big-word</code></span></div>
          <form className="dx-effect-add" onSubmit={(event) => { event.preventDefault(); addEffect(); }}>
            <input aria-label="Effect id" value={effectDraft} placeholder="effect-id" onChange={(event) => setEffectDraft(event.target.value)} />
            <button type="submit" className="dx-quiet" disabled={!EFFECT_ID.test(effectDraft.trim().toLowerCase())}>+ Add</button>
          </form>
          {effects.length > 0
            ? <ul className="dx-effects" aria-label="Effects to try">
                {effects.map((id) => (
                  <li key={id}><code>{id}</code><button type="button" className="dx-quiet" aria-label={`Remove ${id}`} onClick={() => setEffects((list) => list.filter((e) => e !== id))}>×</button></li>
                ))}
              </ul>
            : <p className="dx-note">None yet: the agent picks.</p>}
          <label className="dx-field">
            <span className="dx-field-head">Shots and details you want<em>Name moments, shots or things to avoid</em></span>
            <textarea rows={4} maxLength={4000} value={shots} placeholder={footage ? 'e.g. open on the summit shot; cut the part where I fumble the map; no stock footage' : 'e.g. open on the logo as the hero; a before-and-after; end on the tagline'} onChange={(event) => setShots(event.target.value)} />
          </label>
        </section>
      )}

      {step === 5 && style && (
        <section className="dx-step" aria-labelledby="dx-h5">
          <h1 id="dx-h5">Check and build</h1>
          <p className="dx-lede">Your choices on the left, exactly what the agent gets on the right.</p>
          <div className="dx-check">
            <div className="dx-recap" aria-label="Your choices">
              <Recap step={1} label="Making" title={formDef.label} sub={footage ? <>{video.name} · <span className="dx-num">{formatClock(video.duration)}</span></> : 'No footage'} onChange={setStep} visual={<span className="dx-mark" aria-hidden="true">{footage ? '▶' : '⬡'}</span>} />
              <Recap step={1} label="Frame" title={FRAMES.find((f) => f.id === frame)?.label ?? 'As filmed'} sub={footage && detected ? 'Found in your video' : footage ? 'Kept as filmed' : 'Code-built'} onChange={setStep} visual={<span className={`dx-video-shape ${frame ?? 'landscape'}`} />} />
              <Recap step={2} label={footage ? 'Style' : 'Look'} title={base?.name ?? ''} sub={changed ? `${changed} setting${changed === 1 ? '' : 's'} changed by you` : fromReel ? 'A copy of that reel\'s style' : 'Settings as the style sets them'} onChange={setStep} visual={<LookStill look={lookId} />} />
              <Recap step={3} label="Fonts" title={font === 'own' && ownFont ? ownFont.family : fontPick ? fontPick.words : brand?.source === 'brand' ? 'Your brand fonts' : 'Kinotta\'s fonts'} sub={fontLine} onChange={setStep} visual={<span className="dx-aa" style={font === 'own' && ownFont?.face ? { fontFamily: `"${ownFont.face}"` } : fontPick ? { fontFamily: fontPick.face } : undefined}>Aa</span>} />
              <Recap step={3} label="Music" title={musicName} sub={music === 'file' && ownMusic ? `${ownMusic.fit === 'beat' ? 'Cut on its beat' : 'Plays under the cut'}${footage ? ownMusic.duck ? ', lowered under your voice' : ', at full level' : ''}` : MUSIC.find((m) => m.id === music)?.description} onChange={setStep} visual={<span className="dx-mark" aria-hidden="true">{music === 'file' ? '♪' : MUSIC.find((m) => m.id === music)?.mark}</span>} />
              <Recap step={4} label="Effects" title={effects.length ? effects.join(', ') : 'The agent picks'} sub={effects.length ? 'The agent places them on the right words' : 'None named'} onChange={setStep} visual={<span className="dx-mark" aria-hidden="true">✦</span>} />
              <Recap step={4} label="Shots you want" title={shots.trim() ? shots.trim() : 'None named'} onChange={setStep} visual={<span className="dx-mark" aria-hidden="true">▤</span>} />
              <Recap step={1} label="About" title={about.trim() || (footage ? 'From the video' : 'Needed: there is no footage')} onChange={setStep} visual={<span className="dx-mark" aria-hidden="true">❝</span>} />
            </div>
            <div className="dx-told">
              <h2>What the agent is told</h2>
              <ul>{told.map((line) => <li key={line}>{line}</li>)}</ul>
              {base && base.rules.length > 0 && (
                <div className="dx-rules">
                  <h3>Rules in this style</h3>
                  {base.rules.map((rule) => {
                    const on = !rulesOff.includes(rule);
                    return (
                      <div className="dx-rule" key={rule}>
                        <span>&ldquo;{rule}&rdquo;</span>
                        <button type="button" role="switch" aria-checked={on} aria-label={`Use "${rule}" on this reel`} className={`dx-switch ${on ? 'on' : ''}`}
                          onClick={() => setRulesOff((off) => (on ? [...off, rule] : off.filter((r) => r !== rule)))}>
                          <span aria-hidden="true">{on ? '● on' : '○ off'}</span>
                        </button>
                      </div>
                    );
                  })}
                  <p className="dx-note">Off turns a rule off for this reel only.</p>
                </div>
              )}
            </div>
          </div>
          {aboutNeeded && <p className="dx-need" role="alert">Say what it&rsquo;s about in step 1: there is no footage to build from.</p>}
          <form className="dx-save" aria-label="Save as my style" onSubmit={(event) => { event.preventDefault(); saveAsMine(); }}>
            <h2>Save as my style</h2>
            <label className="dx-field">
              <span className="dx-field-head">Name</span>
              <input value={saveName} placeholder="e.g. Weekend vlogs" onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <fieldset className="dx-seg" aria-label="Save it">
              <label className={saveScope === 'user' ? 'on' : ''}><input type="radio" name="dx-scope" checked={saveScope === 'user'} onChange={() => setSaveScope('user')} /> For you</label>
              <label className={saveScope === 'project' ? 'on' : ''}><input type="radio" name="dx-scope" checked={saveScope === 'project'} onChange={() => setSaveScope('project')} /> For this project</label>
            </fieldset>
            <label className="dx-check-line"><input type="checkbox" checked={saveDefault} onChange={(event) => setSaveDefault(event.target.checked)} /> Use it for new reels (Auto)</label>
            <button type="submit" className="dx-quiet dx-save-go" disabled={!saveName.trim()}>Save style</button>
            <span className="dx-note" role="status">{saved}</span>
          </form>
        </section>
      )}

      {nav}
      {error && <p className="dx-need" role="alert">{error}</p>}
      {confirmation.dialog}
    </main>
  );
}

function Recap({ step, label, title, sub, visual, onChange }: { step: Step; label: string; title: React.ReactNode; sub?: React.ReactNode; visual: React.ReactNode; onChange(step: Step): void }) {
  return (
    <div className="dx-rc">
      <div className="dx-rc-vis">{visual}</div>
      <div className="dx-rc-text">
        <span className="dx-rc-label">{label}</span>
        <b>{title}</b>
        {sub && <span className="dx-rc-sub">{sub}</span>}
      </div>
      <button type="button" className="dx-change" aria-label={`Change ${label.toLowerCase()}`} onClick={() => onChange(step)}>Change</button>
    </div>
  );
}
