'use strict';
// Adaptadores KZ nativos: comparten timeline, recursos locales y desmontaje explícito.
(() => {
 const track=document.getElementById('scrub-track'),video=document.getElementById('scrub-video'),canvas=document.getElementById('scrub-canvas'),poster=document.getElementById('poster'),range=document.getElementById('position'),output=document.getElementById('position-text'),controls=document.getElementById('scrub-controls'),status=document.getElementById('media-status'),modes=document.getElementById('modos');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:650px)').matches,variant=mobile?'mobile':'desktop',width=mobile?480:720,height=mobile?360:540;
 const limit=mobile?6:8,maxPending=2,cache=new Map(),inflight=new Map();
 const ctx=canvas.getContext('2d',{alpha:false});canvas.width=1;canvas.height=1;
 const metrics={mode:'static',variant,progress:0,drawnFrame:null,cacheFrames:0,peakCacheFrames:0,cacheBytes:0,peakDecodedBytes:0,inflight:0,peakInflight:0,loads:0,aborts:0,seekSamples:[],frameSamples:[],readyMs:null,error:null};
 let mode='static',visible=false,epoch=0,raf=0,target=0,started=0,ready=false,seekStart=0,seekGoal=0,seekTimer=0,loadTimer=0,failures=0;
 const base=`assets/${variant}/`,clamp=x=>Math.max(0,Math.min(1,x));
 const lowEnd=navigator.connection?.saveData||Number(navigator.deviceMemory||8)<=2||Number(navigator.hardwareConcurrency||8)<=2;
 function memory(){metrics.cacheFrames=cache.size;metrics.cacheBytes=cache.size*width*height*4;metrics.peakCacheFrames=Math.max(metrics.peakCacheFrames,cache.size);metrics.peakDecodedBytes=Math.max(metrics.peakDecodedBytes,(cache.size+inflight.size)*width*height*4);metrics.inflight=inflight.size;metrics.peakInflight=Math.max(metrics.peakInflight,inflight.size);}
 function reset(){epoch++;ready=false;clearTimeout(seekTimer);clearTimeout(loadTimer);seekTimer=0;loadTimer=0;seekStart=0;cancelAnimationFrame(raf);raf=0;for(const ctrl of inflight.values())ctrl.abort();inflight.clear();for(const bitmap of cache.values())bitmap.close();cache.clear();memory();canvas.width=1;canvas.height=1;video.pause();video.removeAttribute('src');video.load();video.hidden=true;canvas.hidden=true;poster.hidden=false;metrics.drawnFrame=null;}
 function staticMode(message){mode='static';metrics.mode=mode;reset();track.classList.remove('is-active');controls.hidden=true;status.textContent=message||'Vista estática: sin vídeo ni secuencia. Puedes elegir un reproductor.';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode==='static')));}
 function fail(message){metrics.error=message;staticMode('No se pudo cargar la animación. La imagen y la información siguen disponibles.');}
 function sample(list,value){list.push(value);if(list.length>240)list.shift();}
 function request(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render()});}
 function read(){const rect=track.getBoundingClientRect(),distance=Math.max(1,track.offsetHeight-document.querySelector('.scrub-stage').offsetHeight);target=clamp(-rect.top/distance);metrics.progress=target;range.value=String(Math.round(target*100));output.textContent=range.value+'%';if(mode!=='static'&&visible)request();}
 function reveal(){poster.hidden=true;status.textContent=mode==='canvas'?'Canvas WebP activo. Usa el scroll o el control de posición.':`${mode.toUpperCase()} activo. Usa el scroll o el control de posición.`;if(metrics.readyMs===null)metrics.readyMs=performance.now()-started;}
 function evict(needed){while(cache.size>=limit&&!cache.has(needed)){let candidate=null,distance=-1;for(const key of cache.keys()){if(key===metrics.drawnFrame)continue;const d=Math.abs(key-needed);if(d>distance){distance=d;candidate=key;}}if(candidate===null)break;cache.get(candidate).close();cache.delete(candidate);}}
 function loadFrame(index){if(index<0||index>=48||cache.has(index)||inflight.has(index)||inflight.size>=maxPending)return;
 const ctrl=new AbortController(),version=epoch,begin=performance.now();inflight.set(index,ctrl);memory();
 fetch(base+`frames/frame-${String(index).padStart(3,'0')}.webp`,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw new Error('Fotograma no disponible');return r.blob()}).then(blob=>createImageBitmap(blob)).then(bitmap=>{
 if(version!==epoch||mode!=='canvas'||ctrl.signal.aborted||inflight.get(index)!==ctrl){bitmap.close();return;}
 inflight.delete(index);evict(index);cache.set(index,bitmap);metrics.loads++;sample(metrics.frameSamples,performance.now()-begin);memory();request();
 }).catch(error=>{if(version!==epoch)return;if(inflight.get(index)===ctrl)inflight.delete(index);memory();if(error.name==='AbortError'){metrics.aborts++;request();return;}if(++failures>=3)fail('Fallo repetido de fotogramas');else{status.textContent='Reintentando un fotograma; se conserva la imagen anterior.';request();}});
 }
 function renderCanvas(){const desired=Math.round(target*47);for(const [index,ctrl] of inflight){if(Math.abs(index-desired)>2){ctrl.abort();inflight.delete(index);metrics.aborts++;}}
 if(cache.has(desired)){ctx.drawImage(cache.get(desired),0,0,width,height);metrics.drawnFrame=desired;canvas.hidden=false;reveal();}
 else if(cache.size){const nearest=[...cache.keys()].sort((a,b)=>Math.abs(a-desired)-Math.abs(b-desired))[0];ctx.drawImage(cache.get(nearest),0,0,width,height);canvas.hidden=false;}
 loadFrame(desired);if(inflight.size<maxPending){loadFrame(desired+1);loadFrame(desired-1);}memory();
 }
 function seek(){if(!ready||!Number.isFinite(video.duration)||video.seeking||!visible)return;
 const value=Math.min(video.duration-.04,Math.max(0,target*(video.duration-.04)));
 if(Math.abs(video.currentTime-value)<.025)return;seekStart=performance.now();seekGoal=value;video.currentTime=value;clearTimeout(seekTimer);seekTimer=setTimeout(()=>fail('El decodificador no respondió en 4 segundos'),4000);
 }
 function render(){if(mode==='static'||reduce.matches||!visible||document.hidden)return;if(mode==='canvas')renderCanvas();else seek();}
 function start(){if(mode==='static'||reduce.matches||!visible)return;started=performance.now();
 if(mode==='canvas'){if(canvas.width!==width){canvas.width=width;canvas.height=height;}request();return;}
 if(video.hasAttribute('src')){request();return;}
 const supported=video.canPlayType(mode==='mp4'?'video/mp4; codecs="avc1.64001f"':'video/webm; codecs="vp9"');if(!supported){fail('Códec no compatible');return;}
 video.src=base+'diagnostico.'+mode;video.preload='auto';video.load();loadTimer=setTimeout(()=>fail('La carga de vídeo superó 8 segundos'),8000);
 }
 function select(next){if(reduce.matches){staticMode('Movimiento reducido: vista estática y todos los servicios disponibles.');return;}if(next==='static'){staticMode();return;}
 reset();mode=next;metrics.mode=mode;metrics.error=null;metrics.readyMs=null;metrics.seekSamples=[];metrics.frameSamples=[];failures=0;started=performance.now();track.classList.add('is-active');controls.hidden=false;status.textContent='Preparando '+next.toUpperCase()+'; la descarga comienza al acercarte a la escena.';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));read();start();
 }
 modes.hidden=false;document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.mode)));
 video.addEventListener('loadeddata',()=>{if(mode==='mp4'||mode==='webm'){clearTimeout(loadTimer);loadTimer=0;ready=true;video.hidden=false;reveal();request();}});
 video.addEventListener('seeked',()=>{clearTimeout(seekTimer);seekTimer=0;if(seekStart){sample(metrics.seekSamples,performance.now()-seekStart);seekStart=0;}metrics.drawnFrame=Math.round(video.currentTime*24);request();});
 video.addEventListener('error',()=>{if(mode!=='static'&&video.hasAttribute('src'))fail('No se pudo decodificar el vídeo');});
 range.addEventListener('input',()=>{const stage=document.querySelector('.scrub-stage'),top=track.getBoundingClientRect().top+scrollY;scrollTo({top:top+(track.offsetHeight-stage.offsetHeight)*Number(range.value)/100,behavior:'instant'});read();});
 addEventListener('scroll',read,{passive:true});addEventListener('resize',read,{passive:true});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){read();start();}else if(mode!=='static')reset();}, {rootMargin:'200px 0px'});observer.observe(track);
 reduce.addEventListener('change',()=>{if(reduce.matches){staticMode('Movimiento reducido: vista estática y todos los servicios disponibles.');document.querySelectorAll('[data-mode]:not([data-mode="static"])').forEach(b=>b.disabled=true);}else document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;video.pause();}else request();});
 addEventListener('pagehide',()=>{reset();observer.disconnect();},{once:true});
 if(reduce.matches){staticMode('Movimiento reducido: vista estática y todos los servicios disponibles.');document.querySelectorAll('[data-mode]:not([data-mode="static"])').forEach(b=>b.disabled=true);}else if(lowEnd)staticMode('Ahorro de datos o equipo limitado: imagen estática. La animación es opcional.');
 // Diagnóstico de lectura: no contiene credenciales ni controla servicios remotos.
 window.KZDiagnostic=Object.freeze({snapshot:()=>({...metrics,seekSamples:[...metrics.seekSamples],frameSamples:[...metrics.frameSamples],selectedTime:video.currentTime,seekGoal,limits:{cacheFrames:limit,inflight:maxPending,decodedBytes:(limit+maxPending)*width*height*4,canvasBytes:width*height*4},lowEnd:!!lowEnd})});
})();
