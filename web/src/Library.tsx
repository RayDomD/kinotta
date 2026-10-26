import { useEffect, useRef, useState } from 'react';
import { fetchEffects, fetchSoundEffects, type EffectCatalogueEntry, type SoundEffect } from './api/index.ts';

interface LibraryProps {
  onBack(): void;
  reelTitle?: string;
}

const CATEGORIES: { id: string; name: string }[] = [
  { id: 'words', name: 'Words on screen' },
  { id: 'lists', name: 'Lists and numbers' },
  { id: 'speaker', name: 'Around the speaker' },
  { id: 'screens', name: 'Products and screens' },
  { id: 'looks', name: 'Looks and grade' },
  { id: 'structure', name: 'Whole reels' },
];

const FORM_NAMES: Record<string, string> = {
  talking: 'Talking video',
  interview: 'Interview',
  tutorial: 'Tutorial',
  demo: 'Product demo',
  launch: 'Launch',
  explainer: 'Explainer',
  showreel: 'Showreel',
};

const ALL_FORMS = Object.keys(FORM_NAMES);

export const PREVIEW_HTML: Record<string, string> = {
  'big-word': '<div class="p-big">pin.</div>',
  captions: '<i class="person"></i><div class="p-cap">one <i>pin</i> fixes it</div>',
  'title-card': '<div class="p-title"><b>The pin</b><span>Kinotta · 2026</span></div>',
  'section-tag': '<i class="person"></i><div class="p-tag"><span class="n num">02</span><span class="t">The fix</span></div>',
  'letter-swap': '<div class="p-big" style="animation-duration:2s">flat → lit</div>',
  checklist: '<div class="p-list"><span></span><span></span><span></span></div>',
  'chip-tally': '<i class="person"></i><div class="p-chips"><span>Fast</span><span>Clear</span><span>Pinned</span></div>',
  'number-cut': '<div class="p-num">03</div>',
  chart: '<div class="p-chart"><span></span><span></span><span></span><span></span></div>',
  'text-behind': '<div class="p-behind">FOCUS</div><i class="person"></i>',
  'framed-speaker': '<div class="p-frame"><i class="person"></i></div>',
  'presenter-split': '<div class="still p-split" style="position:absolute;inset:0"><i class="person"></i></div>',
  'floating-cards': '<i class="person"></i><div class="p-cards"><span></span><span></span></div>',
  'activity-feed': '<i class="person" style="left:32%"></i><div class="p-feed"><span></span><span></span><span></span></div>',
  annotate: '<i class="person"></i><div class="p-loop"></div>',
  phone: '<div class="p-phone"></div>',
  prompt: '<div class="p-prompt"><span>pin the headline…</span></div>',
  'before-after': '<div class="p-ba"><span></span><span></span></div>',
  'arc-flow': '<div class="p-arc"></div>',
  diagram: '<div class="p-diag"><span></span><span></span><span></span></div>',
  'shape-morph': '<div class="p-morph"></div>',
  'motif-carry': '<div class="p-title"><b style="border-bottom:2px solid var(--light)">One line</b><span>carries on</span></div>',
  'film-look': '<div class="still p-grain" style="position:absolute;inset:0"><i class="person"></i></div>',
  'live-grade': '<div class="still p-grade" style="position:absolute;inset:0"><i class="person"></i></div>',
  'beat-showreel': '<div class="p-reel"><span></span><span></span><span></span><span></span><span></span></div>',
};

const FAV_STORAGE_KEY = 'kinotta-effect-favourites';

function loadFavourites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (!raw) return new Set(['checklist', 'phone']);
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : ['checklist', 'phone']);
  } catch {
    return new Set(['checklist', 'phone']);
  }
}

function saveFavourites(favs: Set<string>): void {
  try {
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify([...favs]));
  } catch {
    // localStorage might be unavailable
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function Library(props: LibraryProps) {
  const { onBack, reelTitle = 'The pin' } = props;
  const [tab, setTab] = useState<'effects' | 'looks' | 'camera' | 'transitions' | 'sounds'>('effects');
  const [effects, setEffects] = useState<EffectCatalogueEntry[]>([]);
  const [sounds, setSounds] = useState<SoundEffect[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [form, setForm] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [sel, setSel] = useState<string>('checklist');
  const [favs, setFavs] = useState<Set<string>>(loadFavourites);
  const [copied, setCopied] = useState<boolean>(false);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchEffects()
      .then((data) => {
        setEffects(data);
        if (data.length > 0 && !data.some((e) => e.id === sel)) {
          setSel(data[0]!.id);
        }
      })
      .catch((err) => console.error('Failed to load effects catalogue:', err));

    fetchSoundEffects()
      .then((data) => setSounds(data))
      .catch((err) => console.error('Failed to load sound effects:', err));
  }, []);

  const toggleFav = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavourites(next);
      return next;
    });
  };

  const playSound = (id: string) => {
    if (playingSound === id && audioRef.current) {
      audioRef.current.pause();
      setPlayingSound(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(`/sound-effects/${encodeURIComponent(id)}`);
    audioRef.current = audio;
    audio.onended = () => setPlayingSound(null);
    audio.onerror = () => setPlayingSound(null);
    audio.play().catch(() => setPlayingSound(null));
    setPlayingSound(id);
  };

  const fitsForm = (f: EffectCatalogueEntry) => form === 'all' || f.forms.includes(form);

  const matchesSearch = (f: EffectCatalogueEntry) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.needs.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q)
    );
  };

  const visibleEffects = effects.filter((f) => {
    if (showFavsOnly && !favs.has(f.id)) return false;
    if (cat && f.category !== cat) return false;
    return matchesSearch(f);
  });

  const selectedEffect = effects.find((f) => f.id === sel) ?? effects[0];

  const copyRequest = async () => {
    if (!selectedEffect) return;
    const text = selectedEffect.ask ?? `Use ${selectedEffect.name}.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // fallback
    }
  };

  return (
    <div className="library-page">
      <header className="library-top">
        <div className="library-brand">
          <svg width="18" height="18" viewBox="0 0 28 28" aria-hidden="true">
            <path d="M14 3l9.5 5.5v11L14 25 4.5 19.5v-11z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M4.5 8.5L14 14l9.5-5.5M14 14v11" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".6" />
          </svg>
          KINOTTA
        </div>
        <div className="library-crumb">
          {reelTitle} · <b>Library</b>
        </div>
        <nav className="library-tabs" aria-label="Library">
          <button type="button" className={`library-tab ${tab === 'effects' ? 'on' : ''}`} onClick={() => setTab('effects')}>
            Effects<span className="num">{pad(effects.length || 25)}</span>
          </button>
          <button type="button" className={`library-tab ${tab === 'looks' ? 'on' : ''}`} onClick={() => setTab('looks')}>
            Looks<span className="num">04</span>
          </button>
          <button type="button" className={`library-tab ${tab === 'camera' ? 'on' : ''}`} onClick={() => setTab('camera')}>
            Camera moves<span className="num">08</span>
          </button>
          <button type="button" className={`library-tab ${tab === 'transitions' ? 'on' : ''}`} onClick={() => setTab('transitions')}>
            Transitions<span className="num">06</span>
          </button>
          <button type="button" className={`library-tab ${tab === 'sounds' ? 'on' : ''}`} onClick={() => setTab('sounds')}>
            Sounds<span className="num">{pad(sounds.length || 17)}</span>
          </button>
        </nav>
        <button type="button" className="library-back" onClick={onBack}>
          Back to editor
        </button>
      </header>

      {tab === 'effects' ? (
        <div className="library-shell">
          <aside className="library-rail">
            <p className="library-label">Categories</p>
            <div className="library-cats">
              <button
                type="button"
                className={`library-cat ${cat === null && !showFavsOnly ? 'on' : ''}`}
                onClick={() => {
                  setCat(null);
                  setShowFavsOnly(false);
                }}
              >
                All <span className="num">{pad(effects.filter(fitsForm).length)}</span>
              </button>
              {CATEGORIES.map((c) => {
                const count = effects.filter((f) => f.category === c.id && fitsForm(f)).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`library-cat ${cat === c.id && !showFavsOnly ? 'on' : ''}`}
                    onClick={() => {
                      setCat(c.id);
                      setShowFavsOnly(false);
                    }}
                  >
                    {c.name} <span className="num">{pad(count)}</span>
                  </button>
                );
              })}
            </div>
            <hr className="library-hr" />
            <button
              type="button"
              className={`library-cat ${showFavsOnly ? 'on' : ''}`}
              onClick={() => setShowFavsOnly((prev) => !prev)}
            >
              ♥ Favourites <span className="num">{pad(favs.size)}</span>
            </button>
          </aside>

          <main className="library-main">
            <div className="library-head">
              <div>
                <h1>Effects</h1>
                <p className="library-sub">Every effect plays on a sample shot. Copy its request into a note to ask for it in this reel.</p>
              </div>
              <input
                className="library-search"
                type="search"
                placeholder="Search effects"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search effects"
              />
            </div>

            <div className="library-forms" role="group" aria-label="Works with">
              <span className="library-muted" style={{ alignSelf: 'center', marginRight: '4px' }}>Works with</span>
              <button
                type="button"
                className={`library-form ${form === 'all' ? 'on' : ''}`}
                onClick={() => setForm('all')}
              >
                Everything
              </button>
              {ALL_FORMS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`library-form ${form === k ? 'on' : ''}`}
                  onClick={() => setForm(k)}
                >
                  {FORM_NAMES[k]}
                </button>
              ))}
            </div>

            <div className="library-sections">
              {CATEGORIES.filter((c) => !cat || cat === c.id).map((c) => {
                const list = visibleEffects.filter((f) => f.category === c.id);
                if (list.length === 0) return null;
                const sorted = [...list].sort((a, b) => Number(fitsForm(b)) - Number(fitsForm(a)));
                return (
                  <section key={c.id}>
                    <h2>
                      {c.name} <span className="num">{pad(sorted.filter(fitsForm).length)}</span>
                    </h2>
                    <div className="library-grid">
                      {sorted.map((f) => {
                        const isFav = favs.has(f.id);
                        const isDim = !fitsForm(f);
                        const isSel = f.id === sel;
                        const previewHtml = PREVIEW_HTML[f.id] ?? '';
                        return (
                          <button
                            key={f.id}
                            type="button"
                            className={`library-fx ${isSel ? 'sel' : ''} ${isDim ? 'dim' : ''}`}
                            onClick={() => setSel(f.id)}
                          >
                            <span
                              className={`library-fav ${isFav ? 'on' : ''}`}
                              onClick={(e) => toggleFav(f.id, e)}
                              title={isFav ? 'Remove from favourites' : 'Add to favourites'}
                            >
                              {isFav ? '♥' : '♡'}
                            </span>
                            <div className="still" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            <div className="library-meta">
                              <b>{f.name}</b>
                              <p>{f.description}</p>
                              <div className="library-tags">
                                <span className={`library-tag ${f.instant ? 'library-tag-free' : 'library-tag-agent'}`}>
                                  {f.instant ? 'Instant · free' : 'Agent'}
                                </span>
                                {f.forms.length === ALL_FORMS.length ? (
                                  <span className="library-tag">Any reel</span>
                                ) : (
                                  <span className="library-tag">
                                    {f.forms.map((x) => FORM_NAMES[x] ?? x).slice(0, 2).join(', ')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </main>

          <aside className="library-side">
            {selectedEffect && (
              <div className="library-detail">
                <div className="still" dangerouslySetInnerHTML={{ __html: PREVIEW_HTML[selectedEffect.id] ?? '' }} />
                <h3>{selectedEffect.name}</h3>
                <p className="desc">{selectedEffect.description}</p>
                <dl className="library-kv">
                  <dt>Needs</dt>
                  <dd>{selectedEffect.needs}</dd>
                  <dt>Works with</dt>
                  <dd>{selectedEffect.forms.map((x) => FORM_NAMES[x] ?? x).join(', ')}</dd>
                  <dt>Kind</dt>
                  <dd>
                    {selectedEffect.instant
                      ? `Instant · free (${selectedEffect.instantFrom})`
                      : 'Needs the agent'}
                  </dd>
                  <dt>Template</dt>
                  <dd><code>{selectedEffect.id}</code></dd>
                </dl>
                <div className="library-ask">
                  <p className="library-label">Ask for it</p>
                  &ldquo;{selectedEffect.ask ?? `Use ${selectedEffect.name}.`}&rdquo;
                </div>
                <div className="library-row" style={{ marginTop: '14px' }}>
                  <button
                    type="button"
                    className={`library-quiet ${copied ? 'done' : ''}`}
                    onClick={copyRequest}
                  >
                    {copied ? 'Copied' : 'Copy request'}
                  </button>
                </div>
                <p className="library-muted" style={{ marginTop: '8px' }}>
                  Paste the request into a note; the agent places the effect on the right words.
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : tab === 'sounds' ? (
        <div className="library-sounds-view">
          <div className="library-sounds-head">
            <h1>Sound effects</h1>
            <p className="library-sub">17 bundled sound effects ready for your reels. Pop, whoosh, click, and riser.</p>
          </div>
          <div className="library-sounds-grid">
            {sounds.map((sound) => {
              const isPlaying = playingSound === sound.id;
              return (
                <div key={sound.id} className="library-sound-card">
                  <div className="library-sound-info">
                    <div className="library-sound-title-row">
                      <b>{sound.name}</b>
                      <span className="library-sound-dur num">{sound.duration}s</span>
                    </div>
                    <p className="library-sound-desc">{sound.description}</p>
                  </div>
                  <button
                    type="button"
                    className={`library-sound-play ${isPlaying ? 'playing' : ''}`}
                    onClick={() => playSound(sound.id)}
                    aria-label={isPlaying ? `Stop ${sound.name}` : `Play ${sound.name}`}
                  >
                    {isPlaying ? '⏹ Stop' : '▶ Play'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="library-placeholder-view">
          <div className="library-sounds-head">
            <h1>{tab === 'looks' ? 'Looks' : tab === 'camera' ? 'Camera moves' : 'Transitions'}</h1>
            <p className="library-sub">Built-in presets and styles available for direction and shot adjustments.</p>
          </div>
          <div className="library-placeholder-grid">
            <p className="library-muted">Selected catalogue tab: {tab}. Full library items are active in Effects and Sounds tabs.</p>
          </div>
        </div>
      )}
    </div>
  );
}
