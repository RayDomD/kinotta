import type { Plan } from './edit-model.ts';
import type { Shot } from './types.ts';

const START = '<!-- kinotta-pinned-effects -->';
const END = '<!-- /kinotta-pinned-effects -->';
/** Embed the actual local template output in captures and previews, including exact seek and revision identity. */
export function pinnedEffectPage(html: string, plan: Plan, shots: readonly Shot[]): string {
  const begin = html.indexOf(START), end = html.indexOf(END);
  if (begin >= 0 && end >= begin) html = html.slice(0, begin) + html.slice(end + END.length);
  const effects = Object.values(plan.pinComments ?? {}).flatMap((comment) => {
    if (!comment?.instant || !comment.effectHtml || comment.pin.kind !== 'frame') return [];
    const pin = comment.pin;
    const shot = shots.find((shot) => pin.shotName ? shot.name === pin.shotName : shot.number === pin.shot);
    if (!shot || pin.alternate && shot.revision !== pin.alternate) return [];
    return [{ id: comment.id, page: comment.effectHtml, at: shot.start, duration: shot.duration, x: pin.x, y: pin.y }];
  });
  if (!effects.length) return html;
  const data = JSON.stringify(effects).replace(/</g, '\\u003c');
  const block = START + `<script data-pinned-effect>
(function(){
const effects=${data};
const layers=effects.map(effect=>{
 const frame=document.createElement('iframe');frame.dataset.pinnedEffect=effect.id;frame.title='Pinned effect';
 frame.style.cssText='position:absolute;border:0;width:1920px;height:1080px;pointer-events:none;visibility:hidden;left:'+((effect.x-.5)*1920)+'px;top:'+((effect.y-.5)*1080)+'px';
 const ready=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=effect.page;
 (document.querySelector('#stage')||document.body).appendChild(frame);return {effect,frame,ready};
});
const seek=window.seek;
window.seek=async function(t){const base=seek.call(window,t);await Promise.all(layers.map(async({effect,frame,ready})=>{const active=t>=effect.at&&t<effect.at+effect.duration;frame.style.visibility=active?'visible':'hidden';if(active){await ready;if(typeof frame.contentWindow.seek==='function')await frame.contentWindow.seek(t-effect.at);}}));await base;};
})();</script>` + END;
  return html.replace('</body>', () => block + '</body>');
}
