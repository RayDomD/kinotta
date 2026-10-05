// NODE_PATH=motion/node_modules node render.js dist/clip.html out/clip.(mp4|mov) [fps, e.g. 30000/1001 | 25 | 60] [flags]
// 4 subframes per frame across a 180° shutter, blended with ffmpeg tmix. Alpha clips -> ProRes 4444 .mov
// Flags, all optional: --scale <n> (deviceScaleFactor: the page is scaled, not re-laid out), --frames <from>:<to> (end
// exclusive), --crf <n> (H.264, default 14), --no-blur (one sample per frame), --codec h264|prores (default: ProRes for
// an alpha page), --progress (JSON lines on stdout: {width,height,fps,frames} first, then {frame,frames} per frame).
const {chromium}=require('playwright');const {spawn}=require('child_process');const path=require('path');
(async()=>{
 const pos=[],opt={};for(let i=2;i<process.argv.length;i++){const a=process.argv[i];if(a==='--no-blur'||a==='--progress')opt[a.slice(2)]=true;else if(a.startsWith('--'))opt[a.slice(2)]=process.argv[++i];else pos.push(a);}
 const [html,out,fpsArg]=pos; const FPS=!fpsArg?30000/1001:(fpsArg.includes('/')?fpsArg.split('/')[0]/fpsArg.split('/')[1]:+fpsArg);
 const scale=opt.scale?+opt.scale:1, say=o=>opt.progress&&console.log(JSON.stringify(o));
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:1920,height:1080},...(opt.scale?{deviceScaleFactor:scale}:{})});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+path.resolve(html)+'?render');await p.evaluate(()=>document.fonts.ready);
 // A page without a #stage is drawn at the viewport's size.
 const info=await p.evaluate(()=>{const s=document.getElementById('stage');return {T:window.DURATION,W:s?s.offsetWidth:innerWidth,H:s?s.offsetHeight:innerHeight,alpha:document.documentElement.classList.contains('alpha')};});
 await p.setViewportSize({width:info.W,height:info.H});
 const N=Math.round(info.T*FPS), K=opt['no-blur']?1:4, sub=1/(FPS*2*K);
 const [f0,f1]=opt.frames?opt.frames.split(':').map(Number):[0,N], last=Math.min(f1,N), count=Math.max(0,last-f0);
 const fr=(fpsArg&&fpsArg.includes('/'))?[fpsArg,`${fpsArg.split('/')[0]*K}/${fpsArg.split('/')[1]}`]:(FPS===30000/1001?['30000/1001',`${30000*K}/1001`]:[String(FPS),String(FPS*K)]);
 const vf=K===1?`format=gbrap,setpts=N/(${fr[0]})/TB`:`format=gbrap,tmix=frames=4:weights='1 1 1 1',select='eq(mod(n\\,4)\\,3)',setpts=N/(${fr[0]})/TB`;
 const prores=opt.codec?opt.codec==='prores':info.alpha;
 const enc=prores?['-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-vendor','apl0']:['-c:v','libx264','-crf',opt.crf||'14','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart'];
 const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate',fr[1],'-c:v','png','-i','-','-vf',vf,'-r',fr[0],...enc,out]);
 ff.stderr.on('data',d=>process.stderr.write(d));
 say({width:Math.round(info.W*scale),height:Math.round(info.H*scale),fps:FPS,frames:count});
 for(let f=f0;f<last;f++){for(let k=0;k<K;k++){const t=Math.max(0,f/FPS+(k-(K-1)/2)*sub);await p.evaluate(t=>seek(t),t);
   const buf=await p.screenshot({type:'png',omitBackground:info.alpha});
   if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));}
   say({frame:f-f0+1,frames:count});}
 ff.stdin.end();const code=await new Promise(r=>ff.on('close',r));await b.close();
 if(code)process.exitCode=code;
 console.log('rendered',out,count,'frames',errs.length?'ERR '+errs[0]:'');
})();
