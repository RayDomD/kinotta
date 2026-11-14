import { useEffect, useRef } from 'react';
import type { EffectCatalogueEntry } from './api/index.ts';
import { CATEGORIES, PREVIEW_HTML } from './Library.tsx';

/** A card counts as on screen once this share of it is inside the dialog's scroll area. */
const VISIBLE_RATIO = 0.1;

function GalleryCard({ effect, chosen, toggle }: { effect: EffectCatalogueEntry; chosen: boolean; toggle(): void }) {
  const card = useRef<HTMLButtonElement>(null);
  // 25 moving previews are heavy, so a card's preview only plays while the card is on screen.
  useEffect(() => {
    const node = card.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { node.setAttribute('data-visible', ''); return; }
    const watcher = new IntersectionObserver(([entry]) => { if (entry!.isIntersecting) node.setAttribute('data-visible', ''); else node.removeAttribute('data-visible'); }, { threshold: VISIBLE_RATIO });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);
  return <button ref={card} type="button" className="fx-gallery-card" data-gallery-effect={effect.id} aria-pressed={chosen} onClick={toggle}>
    <div className="still" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PREVIEW_HTML[effect.id] ?? '' }} />
    <strong>{effect.name}</strong>
    <span>{effect.instant ? 'Instant · free' : 'Needs the agent'}</span>
    <small>{effect.needs}</small>
    <em className="fx-gallery-state">{chosen ? 'In the box · click to remove' : 'Click to add to the box'}</em>
  </button>;
}

/** Every catalogue effect by category. Clicking a card adds it to the Effects box or takes it out. Closes on Escape. */
export function EffectsGallery({ open, effects, chosen, toggle, onClose }: { open: boolean; effects: EffectCatalogueEntry[]; chosen: string[]; toggle(id: string): void; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current!; if (open && !node.open) node.showModal(); if (!open && node.open) node.close(); }, [open]);
  return <dialog ref={dialog} className="editor-settings fx-gallery" aria-labelledby="fx-gallery-title" onCancel={onClose} onClose={onClose}>
    {open && <>
      <header><h2 id="fx-gallery-title">Browse effects</h2><button type="button" className="rv-tool" aria-label="Close effects" onClick={onClose}>Close · Esc</button></header>
      <p className="meta fx-gallery-note">Click an effect to add it to your Effects box, and again to remove it. <span className="num">{chosen.length}</span> in the box.</p>
      {CATEGORIES.map((category) => {
        const inCategory = effects.filter((effect) => effect.category === category.id);
        if (inCategory.length === 0) return null;
        return <section key={category.id} aria-labelledby={`fx-gallery-${category.id}`}>
          <h3 id={`fx-gallery-${category.id}`}>{category.name}</h3>
          <div className="fx-gallery-grid">{inCategory.map((effect) => <GalleryCard key={effect.id} effect={effect} chosen={chosen.includes(effect.id)} toggle={() => toggle(effect.id)} />)}</div>
        </section>;
      })}
    </>}
  </dialog>;
}
