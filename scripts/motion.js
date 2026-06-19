// 陀螺仪 v5 — 重力基准 + 持续角度轮选 + 完整校准
(function(){
'use strict';

// ===== 工具 =====
var relayUrl='/log', stateUrl='/state';
function log(){
  var a=Array.prototype.slice.call(arguments);
  var m=a.map(function(v){return typeof v==='string'?v:JSON.stringify(v)}).join(' ');
  console.log.apply(console,a);
  try{navigator.sendBeacon(relayUrl,JSON.stringify({msg:m,t:Date.now()}))}catch(e){}
}
function sendState(s){try{navigator.sendBeacon(stateUrl,JSON.stringify(s))}catch(e){}}

// ===== 读取校准数据 =====
var cal = {resting:90, stepDeg:5, neutralMargin:3, gammaL:12, gammaR:12, dropAccel:14};
var calibrated = false;
try{
  var s = JSON.parse(localStorage.getItem('motionCal') || '{}');
  if(s.resting && s.stepDeg) { cal = s; calibrated = true; }
}catch(e){}
log('[motion] 校准:'+(calibrated?' 已校准':' 默认')+' resting='+cal.resting+'° step='+cal.stepDeg+'° margin='+cal.neutralMargin+'° gammaL='+cal.gammaL+'° gammaR='+cal.gammaR+'° drop='+cal.dropAccel+'m/s²');

// ===== 状态 =====
var cursor=-1, options=[], isMulti=false, lastBeta=0, lastGamma=0, confirmed='';

// ===== 题型检测 =====
function getType(){
  try{var q=window.quizQueue&&window.quizQueue[currentIndex];if(q&&q.type)return q.type}catch(e){}
  if(document.querySelector('.tf-buttons'))return'true_false';
  if(document.querySelector('.calc-table'))return'calculation';
  if(document.querySelector('.option'))return'choice';
  return'unknown';
}
function allowed(){var t=getType();return t==='true_false'||t==='choice'||t==='single_choice'||t==='multiple_choice'}

// ===== 选项 =====
function refOpts(){
  var els=document.querySelectorAll('.option');
  options=[];for(var i=0;i<els.length;i++)options.push(els[i]);
  isMulti=!!document.getElementById('btn-confirm-multi');
}
function getDomSelected(){
  try{return [...document.querySelectorAll('.option.selected')].map(function(e){return e.dataset.label||''}).sort().join('')||''}catch(e){return''}
}
function hl(){
  options.forEach(function(e){e.classList.remove('motion-hover')});
  if(cursor>=0&&cursor<options.length)options[cursor].classList.add('motion-hover');
}
function clickC(){
  if(cursor<0||cursor>=options.length){log('[motion] clickC 跳过: cursor='+cursor);return}
  var el=options[cursor];
  var lb=el.dataset.label||'';
  log('[motion] 准备点击 '+lb+' isMulti='+isMulti);
  if(typeof clickOption==='function'){
    log('[motion] 调用 clickOption');
    clickOption(el,!!document.getElementById('btn-confirm-multi'));
  } else {
    log('[motion] 回退 .click()');
    el.click();
  }
  log('[motion] 点击完成 '+lb);
  if(isMulti)confirmed+=lb;else{cursor=-1;hl()}
}
function deselectC(){
  if(cursor<0||cursor>=options.length)return;
  var el=options[cursor];
  var lb=el.dataset.label||'';
  // 只有已选中的才取消，避免重复 toggle
  if(el.classList.contains('selected')){
    if(typeof clickOption==='function')clickOption(el,true);
    else el.click();
    confirmed=confirmed.replace(lb,'');
    log('[motion] 取消 '+lb);
  }
}
function submitMulti(){
  var btn=document.getElementById('btn-confirm-multi');
  if(btn){
    if(typeof confirmMulti==='function')confirmMulti();
    else btn.click();
    log('[motion] 提交 '+confirmed);confirmed='';
  }
}
// ===== 场景 =====
function active(){
  var q=document.getElementById('page-quiz');
  if(!q||q.classList.contains('hidden'))return false;
  var fb=document.getElementById('answer-feedback');
  return!(fb&&fb.classList.contains('show'));
}

// ===== 持续角度轮选（核心改进）=====
function updateCursorFromAngle(beta){
  refOpts();if(!options.length){cursor=-1;return;}
  var delta=cal.resting-beta; // +前倾 -后仰
  var margin=cal.neutralMargin;
  var newC=-1;
  if(delta>margin){
    newC=Math.min(options.length-1, Math.floor((delta-margin)/cal.stepDeg));
  }else if(delta<-margin){
    var steps=Math.floor((-delta-margin)/cal.stepDeg);
    newC=Math.min(options.length-1, Math.max(0, options.length-steps));
  }
  if(newC!==cursor){cursor=newC;hl()}
}

// ===== 传感器 =====
var gammaState='neutral', lastGamma=0, gammaTimer=0;
var GAMMA_COOLDOWN=800;

function handleGamma(gamma){
  if(gammaState==='neutral'){
    if(gamma<-cal.gammaL&&Date.now()-gammaTimer>GAMMA_COOLDOWN){
      gammaState='left';gammaTimer=Date.now();
      var tf=getType()==='true_false';
      if(tf){log('[motion] ←左倾→正确');window.answerTF(true);return}
      if(isMulti){refOpts();log('[motion] ←左倾→取消');deselectC()}
      else{refOpts();log('[motion] ←左倾→确认');clickC()}
      return;
    }
    if(gamma>cal.gammaR&&Date.now()-gammaTimer>GAMMA_COOLDOWN){
      gammaState='right';gammaTimer=Date.now();
      var tf2=getType()==='true_false';
      if(tf2){log('[motion] →右倾→错误');window.answerTF(false);return}
      if(isMulti){refOpts();log('[motion] →右倾→切换');clickC()}
      return;
    }
  }else{
    if(Math.abs(gamma)<5)gammaState='neutral';
  }
}

window.addEventListener('deviceorientation',function(e){
  if(e.beta==null||!motionOn)return;
  if(!active()||!allowed())return;
  var b=e.beta, g=e.gamma||0;
  lastGamma=g;
  if(Math.abs(b-lastBeta)>2){lastBeta=b;log('[motion] β: '+b.toFixed(1))}
  refOpts();
  // gamma 超出阈值时锁定前后轮选，避免确认时光标误动
  if(Math.abs(g)<Math.min(cal.gammaL,cal.gammaR))updateCursorFromAngle(b);
  handleGamma(g);
},{passive:true});

// 下坠检测：用加速度净值的 y 分量（往下晃动时 positive spike）
var dropTimer=0;
window.addEventListener('devicemotion',function(e){
  var acc=e.accelerationIncludingGravity;if(!acc)return;
  if(!active()||!allowed()||!isMulti||!motionOn)return;
  // 检测 y 轴向下加速度峰值（>13 m/s² 且非静止握持）
  var ay=acc.y||0;
  if(ay>cal.dropAccel&&Date.now()-dropTimer>800){
    dropTimer=Date.now();
    log('[motion] ↓下坠→提交');
    submitMulti();
  }
},{passive:true});

// ===== 状态上报 =====
setInterval(function(){
  if(!active())return;
  sendState({type:getType(),cursor:cursor>=0&&cursor<options.length?(options[cursor].dataset.label||''):'-',confirmed:confirmed||'-',beta:lastBeta,gamma:lastGamma,resting:cal.resting,stepDeg:cal.stepDeg,margin:cal.neutralMargin,gammaL:cal.gammaL,gammaR:cal.gammaR,dropAccel:cal.dropAccel,domSelected:getDomSelected(),motionOn:motionOn});
},500);

// ==========================================
// ===== 校准系统 v2 =====
// ==========================================
// CSS
var cs=document.createElement('style');
cs.textContent='.mco{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif}'+
'.mcb{background:#1e1e2e;border-radius:16px;padding:24px 28px;max-width:440px;width:92%;color:#cdd6f4;box-shadow:0 8px 40px #0008}'+
'.mcb h3{margin:0 0 4px;font-size:17px;color:#89b4fa}'+
'.mcb .sub{color:#6c7086;font-size:12px;margin-bottom:12px}'+
'.mcb .stepx{font-size:13px;margin:10px 0;padding:12px;background:#181825;border-radius:10px;border:1px solid #313244}'+
'.mcb .val{font-size:26px;font-weight:700;color:#a6e3a1;margin:4px 0}'+
'.mcb .btn{background:#89b4fa;color:#1e1e2e;border:none;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}'+
'.mcb .btn:disabled{opacity:.4}'+
'.mcb .btn2{background:#313244;color:#cdd6f4;margin-left:6px}'+
'.mcb .ok{color:#a6e3a1}'+
'.mcp{display:flex;gap:6px;justify-content:center;margin:8px 0}'+
'.mcp div{width:44px;height:44px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;border:2px solid #313244;background:#111;color:#585b70;transition:.15s}'+
'.mcp .act{border-color:#89b4fa;background:#1f6feb33;color:#89b4fa}'+
'.mco .warn{color:#f9e2af;font-size:12px;margin:4px 0}'+
'.mct{position:fixed;bottom:70px;right:14px;z-index:999;width:36px;height:36px;border-radius:50%;background:#89b4fa33;border:1px solid #89b4fa;color:#89b4fa;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
'.mct.hidden{display:none}';
document.head.appendChild(cs);

// 读取开关状态
var motionOn=false;
try{motionOn=localStorage.getItem('motionEnabled')==='true'}catch(e){}

// 注入开关到齿轮面板
function injectToggle(){
  var body=document.querySelector('.combo-settings-body');
  if(!body){setTimeout(injectToggle,500);return}
  var row=document.createElement('div');row.className='combo-settings-row';
  row.innerHTML=
    '<label class="toggle-switch"><input type="checkbox" id="motion-toggle"'+(motionOn?' checked':'')+'><span class="toggle-slider"></span></label>'+
    '<span>启用体感作答（仅移动端适配）</span>';
  // 插在提示语前面
  var hint=body.querySelector('.combo-settings-hint');
  if(hint)body.insertBefore(row,hint);
  else body.appendChild(row);
  document.getElementById('motion-toggle').onchange=function(){
    motionOn=this.checked;
    try{localStorage.setItem('motionEnabled',motionOn)}catch(e){}
    if(motionOn)log('[motion] 体感已开启');
    else log('[motion] 体感已关闭');
  };
}
injectToggle();

// 🛠 校准按钮（仅体感开启时显示）
var calBtn=document.createElement('div');
calBtn.className='mct'+(motionOn?'':' hidden');
calBtn.textContent='🛠';
calBtn.title='陀螺仪校准';
calBtn.onclick=function(){if(motionOn)startCal()};
document.body.appendChild(calBtn);

// 监听开关变化控制🛠显隐
document.addEventListener('change',function(e){
  if(e.target&&e.target.id==='motion-toggle'){
    calBtn.classList.toggle('hidden',!e.target.checked);
  }
});

// 校准状态
var step=0, cdata={resting:90,stepDeg:5,neutralMargin:3};
var timer=null, calOverlay=null;
var upBeta=0, upHandler=null;

function startCal(){step=0;if(calOverlay)calOverlay.remove();upBeta=0;upHandler=function(e){if(e.beta!=null)upBeta=e.beta;if(e.gamma!=null)lastGamma=e.gamma};window.addEventListener('deviceorientation',upHandler,{passive:true});showCal()}
function cancelCal(){window.removeEventListener('deviceorientation',upHandler);var e=document.querySelector('.mco');if(e)e.remove()}
window.startCal=startCal;window.cancelCal=cancelCal;

function showCal(){
  if(calOverlay)calOverlay.remove();calOverlay=null;
  if(step>=6){finishCal();return}
  var steps=[
    {id:'upright',label:'立直校准',desc:'把手机垂直竖立（屏幕朝向自己），等待3秒稳定'},
    {id:'resting',label:'舒适握持',desc:'用你最自然的姿势握着手机，点"记录"'},
    {id:'practice',label:'前倾/后仰练习',desc:'向前倾选下一项，向后仰选上一项。满意后点"确认"'},
    {id:'gammaL',label:'左倾确认角度',desc:'向左倾到你觉得"该确认了"的位置，点"记录"'},
    {id:'gammaR',label:'右倾切换角度',desc:'向右倾到你觉得"该切换了"的位置，点"记录"'},
    {id:'drop',label:'下坠提交力度',desc:'把手机往下沉一下（提交的力度），点"开始检测"'},
  ];
  var s=steps[step];
  var o=document.createElement('div');o.className='mco';calOverlay=o;
  var h='<div class="mcb"><h3>🛠 校准 '+(step+1)+'/'+steps.length+'</h3><div class="sub">'+s.desc+'</div><div class="stepx">';
  if(s.id==='upright'){
    h+='<div class="val" id="calV">等待...</div><div class="warn" id="calW">请将手机垂直竖起</div>';
  }else if(s.id==='resting'){
    h+='<div class="val" id="calV">--</div>';
  }else if(s.id==='practice'){
    h+='<div id="calP" class="mcp"></div><div class="val" id="calV">--°</div>'+
       '<div style="margin-top:6px;font-size:12px;color:#6c7086">灵敏度: <input type="range" id="sensSlider" min="1" max="100" value="50" style="width:100px;vertical-align:middle"> <span id="sensLabel">50%</span>（步进 <span id="stepLabel">5.0°</span>）</div>';
  }else if(s.id==='gammaL'||s.id==='gammaR'){
    var label = s.id==='gammaL' ? '← 左倾' : '→ 右倾';
    h+='<div class="val" id="calV">0°</div><div class="warn" id="calW">'+label+'</div>';
  }else if(s.id==='drop'){
    h+='<div class="val" id="calV">等待动作...</div>';
  }
  h+='</div><div style="text-align:right">';
  if(s.id==='upright') h+='<button class="btn" id="calB" disabled>等待竖直...</button>';
  else if(s.id==='practice'||s.id==='drop') h+='<button class="btn" id="calB">确认，不错</button>';
  else if(s.id==='gammaL'||s.id==='gammaR') h+='<button class="btn" id="calB">记录</button>';
  else h+='<button class="btn" id="calB">记录</button>';
  h+='<button class="btn btn2" onclick="cancelCal()">取消</button></div></div>';
  o.innerHTML=h;document.body.appendChild(o);

  if(s.id==='upright'){
      var stableCount=0, stableTarget=30;
      var uprightTimer=setInterval(function(){
        if(!document.getElementById('calV')){clearInterval(uprightTimer);return}
        var b=upBeta;
        var el=document.getElementById('calV');
        var w=document.getElementById('calW');
        var btn=document.getElementById('calB');
        if(!el||!w||!btn)return;
        el.textContent=b.toFixed(1)+'°';
        if(b>80&&b<100){
          stableCount++;
          w.textContent='⏳ 请保持竖直 '+(stableCount/10).toFixed(1)+'/'+(stableTarget/10)+'秒';
          if(stableCount>=stableTarget){
            w.textContent='✅ 已稳定 3 秒！';
            btn.disabled=false;
            btn.textContent='通过 →';
          }
        }else{
          stableCount=0;
          w.textContent='请将手机垂直竖起（当前 '+(b||0).toFixed(1)+'°）';
          btn.disabled=true;
          btn.textContent='等待竖直...';
        }
      },100);
      document.getElementById('calB').onclick=function(){
        clearInterval(uprightTimer);step++;showCal();
      };
    }
    else if(s.id==='resting'){
     var restTimer=setInterval(function(){
       if(!document.getElementById('calV')){clearInterval(restTimer);return}
       var el=document.getElementById('calV');
       if(el)el.textContent=(upBeta||lastBeta||90).toFixed(1)+'°';
     },200);
     document.getElementById('calB').onclick=function(){
        clearInterval(restTimer);
        cdata.resting=Math.round(upBeta||lastBeta||90);
        step++;showCal();
      };
    }
  else if(s.id==='practice'){
    var pEl=document.getElementById('calP');
    for(var i=0;i<4;i++){var d=document.createElement('div');d.textContent=String.fromCharCode(65+i);d.id='cp'+i;pEl.appendChild(d)}
    // 灵敏度滑块 → 步进角度
    var slider=document.getElementById('sensSlider');
    var sensLbl=document.getElementById('sensLabel');
    var stepLbl=document.getElementById('stepLabel');
    function calcStep(pct){
      return 5*(1+(pct-50)*2/100);
    }
    function updateSens(){
      var p=parseInt(slider.value);
      sensLbl.textContent=p+'%';
      cdata.stepDeg=Math.round(calcStep(p)*10)/10;
      stepLbl.textContent=cdata.stepDeg.toFixed(1)+'°';
    }
    slider.oninput=updateSens;
    updateSens();
    var practiceTimer=setInterval(function(){
      if(!document.getElementById('calV')){clearInterval(practiceTimer);return}
      var b=upBeta||cdata.resting;
      var delta=cdata.resting-b;
      var margin=cdata.neutralMargin;
      var cur=-1;
      if(delta>margin)cur=Math.min(3,Math.floor((delta-margin)/cdata.stepDeg));
      else if(delta<-margin){var st=Math.floor((-delta-margin)/cdata.stepDeg);cur=Math.min(3,Math.max(0,4-st))}
      for(var j=0;j<4;j++){var e=document.getElementById('cp'+j);if(e)e.className=(j===cur?'act':'')}
      var dir=delta>margin?'前倾 '+delta.toFixed(1)+'°':delta<-margin?'后仰 '+(-delta).toFixed(1)+'°':'回正中';
      var v=document.getElementById('calV');if(v)v.textContent=dir;
    },100);
    document.getElementById('calB').onclick=function(){clearInterval(practiceTimer);step++;showCal()};
  }
  else if(s.id==='gammaL'||s.id==='gammaR'){
    var gammaKey = s.id==='gammaL' ? 'gammaL' : 'gammaR';
    var gammaValTimer=setInterval(function(){
      if(!document.getElementById('calV')){clearInterval(gammaValTimer);return}
      var el=document.getElementById('calV');
      var w=document.getElementById('calW');
      if(el)el.textContent=(lastGamma||0).toFixed(1)+'°';
      if(w)w.textContent=(lastGamma<0?'← 左倾 ':'→ 右倾 ')+Math.abs(lastGamma||0).toFixed(1)+'°';
    },100);
    document.getElementById('calB').onclick=function(){
      clearInterval(gammaValTimer);
      cdata[gammaKey]=Math.round(Math.abs(lastGamma||12));
      if(cdata[gammaKey]<3)cdata[gammaKey]=12;
      step++;showCal();
    };
  }
  else if(s.id==='drop'){
    var dropCollecting=false, dropPeak=0, dropTimerId=null;
    var dropAccHandler=function(e){
      if(!dropCollecting)return;
      var a=e.accelerationIncludingGravity;if(!a)return;
      var ay=Math.abs(a.y||0);
      if(ay>dropPeak)dropPeak=ay;
      var el=document.getElementById('calV');
      if(el)el.textContent=Math.round(ay)+' m/s²';
    };
    window.addEventListener('devicemotion',dropAccHandler,{passive:true});
    document.getElementById('calB').onclick=function(){
      dropCollecting=true;dropPeak=0;
      document.getElementById('calB').disabled=true;
      document.getElementById('calB').textContent='检测中...';
      document.getElementById('calV').textContent='请做下坠动作...';
      timer=setTimeout(function(){
        dropCollecting=false;clearTimeout(timer);
        window.removeEventListener('devicemotion',dropAccHandler);
        if(dropPeak<5)dropPeak=14;
        cdata.dropAccel=Math.round(dropPeak);
        document.getElementById('calV').textContent=cdata.dropAccel+' m/s²';
        document.getElementById('calB').disabled=false;
        document.getElementById('calB').textContent='下一步 →';
        document.getElementById('calB').onclick=function(){step++;showCal()};
      },3000);
    };
  }
}

function finishCal(){
  if(timer)clearTimeout(timer);
  window.removeEventListener('deviceorientation',upHandler);
  localStorage.setItem('motionCal',JSON.stringify(cdata));
  log('[motion] 校准完成');
  var o=document.createElement('div');o.className='mco';
  o.innerHTML='<div class="mcb"><h3>✅ 校准完成</h3><div class="ok">'+
    '回正: '+cdata.resting+'°<br>步进: '+cdata.stepDeg+'°<br>死区: '+cdata.neutralMargin+'°<br>'+
    '左倾: '+cdata.gammaL+'° | 右倾: '+cdata.gammaR+'°<br>下坠: '+cdata.dropAccel+' m/s²</div>'+
    '<div style="text-align:right;margin-top:14px"><button class="btn" onclick="this.closest(\'.mco\').remove();location.reload()">确定并刷新</button></div></div>';
  document.body.appendChild(o);
}

log('[motion-v5] '+(calibrated?'已校准':'未校准')+' 体感='+(motionOn?'开':'关'));
})();
