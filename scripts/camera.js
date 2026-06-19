// 摄像头 v5 — @mediapipe/tasks-vision 手势答题
(function(){
'use strict';

var statusEl=null;
function setStatus(msg){
  console.log('[cam] '+msg);
  if(!statusEl){
    statusEl=document.createElement('div');
    statusEl.style.cssText='position:fixed;bottom:80px;right:14px;z-index:9999;background:#1e1e2eee;border:1px solid #89b4fa;border-radius:8px;padding:6px 12px;font-size:12px;color:#cdd6f4;font-family:sans-serif;pointer-events:none';
    document.body.appendChild(statusEl);
  }
  statusEl.textContent=msg;
}

var enabled=false; try{enabled=localStorage.getItem('cameraEnabled')==='true'}catch(e){}

function injectToggle(){
  var b=document.querySelector('.combo-settings-body');
  if(!b){setTimeout(injectToggle,500);return}
  var r=document.createElement('div');r.className='combo-settings-row';
  r.innerHTML='<label class="toggle-switch"><input type="checkbox" id="camera-toggle"'+(enabled?' checked':'')+'><span class="toggle-slider"></span></label><span>启用摄像头手势</span>';
  var h=b.querySelector('.combo-settings-hint');
  if(h)b.insertBefore(r,h);else b.appendChild(r);
  // 使用提示
  var note=document.createElement('div');
  note.style.cssText='font-size:11px;color:#a6adc8;padding:2px 0 4px;line-height:1.4';
  note.textContent='摄像头手势仅适合本地使用（需开启 node server.js）';
  if(h)b.insertBefore(note,h);else b.appendChild(note);
  document.getElementById('camera-toggle').onchange=function(){
    enabled=this.checked;
    try{localStorage.setItem('cameraEnabled',enabled)}catch(e){}
    enabled?startCam():stopCam();
  };
}
injectToggle();

// ===== 手势状态 =====
var stream=null, videoEl=null, canvas=null, skelCanvas=null, gestTimer=null;
var handLandmarker=null;
var ACTION_CD=350; // 操作冷却

// 状态追踪
var prevDir=0;    // 0=无指向, 1=朝上, -1=朝下
var dirHold=0;    // 指向持续帧数
var scrollAcc=0;  // 滚动累积器
var cursor=-1;    // 当前高亮选项
var wasPalm=false;// 上一帧是否五指张开
var palmTime=0;   // 五指张开的时刻
var tfSide='';    // 'L'或'R'
var tfStart=0;    // 掌方向保持起始时间
var fistCD=0;     // 拳头提交冷却
var fiveTapCD=0;  // 五指点击冷却
var palmXs=[];    // 掌心X历史（判断静止）

async function initVideo(){
  stream=await navigator.mediaDevices.getUserMedia({video:{width:320,height:240,facingMode:'user'}});
  videoEl=document.createElement('video');
  videoEl.srcObject=stream;
  videoEl.setAttribute('autoplay','');videoEl.muted=true;
  videoEl.style.display='none';
  document.body.appendChild(videoEl);
  videoEl.play().catch(function(){});
  canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;
  // 骨架显示画布
  skelCanvas=document.createElement('canvas');
  skelCanvas.width=160;skelCanvas.height=120;
  skelCanvas.style.cssText='position:fixed;bottom:180px;right:14px;z-index:999;width:160px;border-radius:10px;background:#ffffff';
  document.body.appendChild(skelCanvas);
  setStatus('摄像头就绪');
  
  await new Promise(function(r){videoEl.onloadeddata=r});
  setStatus('加载 MediaPipe...');
  
  try{
    var mod=await import('/assets/lib/vision_bundle.mjs');
    var resolver=await mod.FilesetResolver.forVisionTasks('assets/wasm/');
    setStatus('加载模型...');
    handLandmarker=await mod.HandLandmarker.createFromOptions(resolver,{
      baseOptions:{
        modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate:'GPU'
      },
      runningMode:'VIDEO',
      numHands:1,
      minHandDetectionConfidence:.6,
      minTrackingConfidence:.5
    });
    setStatus('就绪');
    gestTimer=setInterval(processFrame,150);
  }catch(e){
    setStatus('加载失败: '+e.message);
    console.error('[cam]',e);
  }
}

// ===== 手指检测 =====
function countFingers(lm){
  var tips=[4,8,12,16,20],c=0;
  var d4=Math.hypot(lm[4].x-lm[0].x,lm[4].y-lm[0].y);
  var d3=Math.hypot(lm[3].x-lm[0].x,lm[3].y-lm[0].y);
  if(d4>d3*1.15)c++;
  for(var i=1;i<5;i++){var t=lm[tips[i]],p=lm[tips[i]-2];if(t.y<p.y-0.02)c++}
  return c;
}

function pointingDir(lm){
  // 中指(12)相对于手腕(0)的纵向位置判断指向
  // y向下增加，手指朝上则tip.y<wrist.y，朝下则tip.y>wrist.y
  var midY=lm[12].y,wristY=lm[0].y;
  if(midY<wristY-0.08)return 1;  // 指尖在上=指上
  if(midY>wristY+0.08)return -1; // 指尖在下=指下
  return 0;
}

function isThumbUp(lm){
  return lm[4].y<lm[2].y-0.05 && lm[4].x<lm[3].x+0.02;
}
function isPointing(lm){
  // 只有一根手指伸出来，且不是拇指 = 食指指向
  var n=countFingers(lm);
  if(n!==1)return false;
  var thumbOut=Math.hypot(lm[4].x-lm[0].x,lm[4].y-lm[0].y)>Math.hypot(lm[3].x-lm[0].x,lm[3].y-lm[0].y)*1.15;
  return !thumbOut;
}

function isWave(lm){
  if(!isWave.h)isWave.h=[];
  isWave.h.push(lm[9].x);
  if(isWave.h.length>12)isWave.h.shift();
  if(isWave.h.length<12)return false;
  var r=Math.max.apply(null,isWave.h)-Math.min.apply(null,isWave.h);
  return r>0.18;
}

// ===== 骨架绘制 =====
var HAND_CONNS=[
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];
function drawSkeleton(ctx,lm){
  var w=skelCanvas.width,h=skelCanvas.height;
  // 骨架线
  ctx.strokeStyle='#333';ctx.lineWidth=2;
  HAND_CONNS.forEach(function(c){
    var a=lm[c[0]],b=lm[c[1]];
    ctx.beginPath();ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);ctx.stroke();
  });
  // 关节点
  ctx.fillStyle='#e74c3c';
  lm.forEach(function(p){
    ctx.beginPath();ctx.arc(p.x*w,p.y*h,3,0,Math.PI*2);ctx.fill();
  });
}

// ===== 手势主逻辑 =====
function processFrame(){
  if(!videoEl||!videoEl.videoWidth||!handLandmarker)return;
  canvas.getContext('2d').drawImage(videoEl,0,0,160,120);
  
  // 先清空骨架画布（白色背景）
  var sk=skelCanvas.getContext('2d');
  sk.fillStyle='#fff';sk.fillRect(0,0,160,120);
  
  try{
    var res=handLandmarker.detectForVideo(canvas,performance.now());
    if(fistCD>0)fistCD--;
    if(!res.landmarks||!res.landmarks.length){
      cursor=-1;prevDir=0;
      setStatus('无手势');
      return;
    }
    
    var lm=res.landmarks[0];
    var n=countFingers(lm);
    
    // 画骨架
    drawSkeleton(sk,lm);
    
    // 如果已答题并等待下一题，跳过手势处理
    if(typeof answered!=='undefined'&&answered){
      setStatus('已提交');
      document.querySelectorAll('.camera-hover').forEach(function(e){e.classList.remove('camera-hover')});
      wasPalm=false;cursor=-1;return;
    }
    
    var point=isPointing(lm);
    var thumb=isThumbUp(lm);
    var wave=isWave(lm) && n>=3; // 至少3根手指才算摆手
    var isMulti=!!document.getElementById('btn-confirm-multi');
    var isTF=!!document.querySelector('.tf-buttons');
    var opts=document.querySelectorAll('.option');
    var now=Date.now();
    
    // === 判断题 ==
    if(isTF){
      if(n>=4&&!wave){
        // 以指尖朝向定方向：中指(12)相对中指根(9)
        var dir=lm[12].x-lm[9].x;
        var side=dir<-0.05?'L':dir>0.05?'R':tfSide;
        if(side){tfSide=side;setStatus((side==='L'?'←正确':'错误→')+' 握拳确认')}
      }else if(n===0&&tfSide){
        window.answerTF(tfSide==='L');
        setStatus('拳→'+(tfSide==='L'?'正确':'错误')+'✓');
        tfSide='';palmTime=0;wasPalm=false;
      }
      return;
    }
    
    if(!opts.length){setStatus('无选项');return}
    
    // === 1~4指→A~D 定位 ===
    if(n>=1&&n<=4&&n<=opts.length){
      document.querySelectorAll('.camera-hover').forEach(function(e){e.classList.remove('camera-hover')});
      opts[n-1].classList.add('camera-hover');
      cursor=n-1;
      setStatus(String.fromCharCode(64+n)+' '+(thumb?'赞':''));
    }
    
    // === 五指检测 ===
    if(fiveTapCD>0)fiveTapCD--;
    // 掌心X历史（判断静止）
    if(n===5||wave){palmXs.push(lm[9].x);if(palmXs.length>10)palmXs.shift()}
    else palmXs=[];
    var still=palmXs.length>=8&&(Math.max.apply(null,palmXs)-Math.min.apply(null,palmXs))<0.04;
    
    if(n===5&&!wasPalm){
      wasPalm=true;palmTime=now;
      if(!isMulti)setStatus('五指张开');
    }
    // 多选：五指静止→切换选项
    if(n===5&&isMulti&&still&&!wave&&fiveTapCD<=0){
      fiveTapCD=15;
      if(cursor>=0&&cursor<opts.length){
        if(typeof clickOption==='function')clickOption(opts[cursor],true);
        setStatus('五指→'+(opts[cursor].dataset.label||''));
      }
    }
    
    // 直拳提交（带冷却）
    if(n===0&&!wasPalm&&fistCD<=0){
      fistCD=30;
      if(isMulti){
        if(typeof confirmMulti==='function')confirmMulti();
        else{var btn=document.getElementById('btn-confirm-multi');if(btn)btn.click()}
        setStatus('拳→提交✓');
      }else{
        if(cursor>=0&&cursor<opts.length&&typeof clickOption==='function'){
          clickOption(opts[cursor],false);
          setStatus('拳→'+(opts[cursor].dataset.label||'')+'✓');
        }
      }
      return;
    }
    // 五指→拳过渡提交
    if(n===0&&wasPalm&&now-palmTime<2000){
      wasPalm=false;
      if(isMulti){
        if(typeof confirmMulti==='function')confirmMulti();
        else{var btn=document.getElementById('btn-confirm-multi');if(btn)btn.click()}
        setStatus('拳→提交✓');
      }else{
        if(cursor>=0&&cursor<opts.length&&typeof clickOption==='function'){
          clickOption(opts[cursor],false);
          setStatus('拳→'+(opts[cursor].dataset.label||'')+'✓');
        }
      }
      cursor=-1;palmTime=0;return;
    }
    if(n!==5)wasPalm=false;
    
    // === 多选操作 ===
    if(isMulti){
      // 摆手→取消所有
      if(wave){
        var sel=document.querySelectorAll('.option.selected');
        sel.forEach(function(e){
          if(typeof clickOption==='function')clickOption(e,true);
        });
        setStatus('👋→清空');
      }
    }
    
    // 无操作时显示状态
    if(!wave&&!isTF)setStatus(n+'指'+(n===5&&still?' ●':'')+(cursor>=0?opts[cursor].dataset.label:''));
    
  }catch(e){/* 忽略单帧错误 */}
}

function startCam(){
  setStatus('启动...');
  // 重置状态
  cursor=-1;prevDir=0;dirHold=0;scrollAcc=0;wasPalm=false;palmTime=0;tfSide='';tfStart=0;fistCD=0;fiveTapCD=0;palmXs=[];
  initVideo().catch(function(e){setStatus('失败: '+e.message)});
}
function stopCam(){
  if(gestTimer){clearInterval(gestTimer);gestTimer=null}
  if(stream){stream.getTracks().forEach(function(t){t.stop()});stream=null}
  if(videoEl){videoEl.remove();videoEl=null}
  if(skelCanvas){skelCanvas.remove();skelCanvas=null}
  canvas=null;handLandmarker=null;
  document.querySelectorAll('.camera-hover').forEach(function(e){e.classList.remove('camera-hover')});
  setStatus('已关闭');
}

if(enabled)setTimeout(startCam,2000);
document.addEventListener('visibilitychange',function(){
  if(document.hidden&&enabled)stopCam();
  else if(!document.hidden&&enabled&&!stream)startCam();
});

setStatus('v5'+(enabled?' (启用)':''));
// 默认关闭时不显示任何状态
if(!enabled&&statusEl){statusEl.style.display='none'}
})();