// transportation.js — QR 多端同步：grasp/ha/hh 紧凑格式
(function(){
'use strict';

// ===== 配置 =====
var CHUNK_SIZE = 1600;
var FRAME_MS  = 2000;
var MAX_RETRY = 30;

// ===== 题库索引 =====
function srcNameToId(name){
  if(typeof QUIZ_SOURCES==='undefined')return 0;
  for(var i=0;i<QUIZ_SOURCES.length;i++){if(QUIZ_SOURCES[i].name===name)return i}
  return 0;
}
function srcIdToName(id){
  if(typeof QUIZ_SOURCES==='undefined'||!QUIZ_SOURCES[id])return 'unknown';
  return QUIZ_SOURCES[id].name;
}

// ===== 发送打包 =====
function safeJSON(key,def){try{var v=localStorage.getItem(key);return v?JSON.parse(v):def}catch(e){return def}}
function collectSyncData(){
  // 尝试直接从内存 infiniteMap 刷新 localStorage
  try{
    var imap = typeof window.__getInfiniteMapForSync === 'function' ? window.__getInfiniteMapForSync() : null;
    if(imap&&Object.keys(imap).length>0){
      var hasData=false;for(var _k in imap){if(imap[_k]&&imap[_k].correctCount>0){hasData=true;break}}
      if(hasData){
        localStorage.setItem('infiniteProgress',JSON.stringify(imap));
      }
    }
    // 不论 infiniteMap 是否有数据，都同步保存 stats
    var st=typeof window.__getStatsForSync==='function'?window.__getStatsForSync():{};
    var ta=st.totalAnswered||0;
    // 如果内存里没有（没进过模式），从 localStorage 读累计答题目
    if(!ta){
      var taLS=localStorage.getItem('_totalAnswered');
      if(taLS)ta=parseInt(taLS,10)||0;
    }
    localStorage.setItem('infiniteStats',JSON.stringify({
      totalAnswered:ta,correctCount:st.correctCount||0
    }));
  }catch(e){}
  // 兜底：如果 infiniteProgress 全零，从 quizAnalysis 补
   try{
     var qaData=localStorage.getItem('quizAnalysis');
     console.log('[sync] quizAnalysis exists:', !!qaData, 'size:', qaData?qaData.length:0);
     if(qaData){
       var qaParsed=JSON.parse(qaData);
       var qa=qaParsed.byQuestion;
       console.log('[sync] byQuestion keys:', qa?Object.keys(qa).length:0);
        if(qa){
          var sampleKey=Object.keys(qa)[0];
          var sampleVal=qa[sampleKey];
          console.log('[sync] qa sample:', sampleKey, 'countCorrect:', sampleVal?sampleVal.countCorrect:'N/A');
          var prog2=safeJSON('infiniteProgress',{});
         console.log('[sync] infiniteProgress keys before:', Object.keys(prog2).length);
          console.log('[sync] prog2 has sampleKey:', !!prog2[sampleKey], 'correctCount:', prog2[sampleKey]?prog2[sampleKey].correctCount:'N/A');
          var added=0;
         for(var qk2 in qa){
           var cc=qa[qk2].countCorrect||0;
           if(cc>0&&(!prog2[qk2]||prog2[qk2].correctCount===0)){
             prog2[qk2]={correctCount:Math.min(cc,3)};added++;
           }
         }
         console.log('[sync] added from quizAnalysis:', added);
         if(added>0){
           localStorage.setItem('infiniteProgress',JSON.stringify(prog2));
           console.log('[sync] saved infiniteProgress with', Object.keys(prog2).length, 'entries');
         }
       }
     }
   }catch(e){console.log('[sync] quizAnalysis fallback error:',e)}
  var parts=[];

  // g: 掌握进度 (grasp)
  // 每位 0-5：0=已掌握(≥3次) 1=对1次 2=对2次 3=错1次 4=错2次 5=错≥3次
  // 每题库独立: g0=xxxx&g1=xxxx
  try{
    var prog=safeJSON('infiniteProgress',{});
    // wrongBooks 结构: {bookId:{temp:{qKey:qObj},long:{qKey:qObj},notes:{qKey:note}}}
    // 统计每题出现在多少错题本中
    var wrongCount={};
    try{
      var wb=safeJSON('wrongBooks',{});
      for(var wbid in wb){
        if(!wb.hasOwnProperty(wbid))continue;
        var book=wb[wbid];
        if(book.temp)for(var tk in book.temp){if(book.temp.hasOwnProperty(tk))wrongCount[tk]=(wrongCount[tk]||0)+1}
        if(book.long)for(var lk in book.long){if(book.long.hasOwnProperty(lk))wrongCount[lk]=(wrongCount[lk]||0)+1}
      }
    }catch(e){};var wrong=wrongCount;
    // 按源分组
    var bySrc={};
    for(var k in prog){
      if(!prog.hasOwnProperty(k))continue;
      var p=k.indexOf('::');
      var sid=srcNameToId(k.slice(0,p));
      var qidx=parseInt(k.slice(p+2),10);
      if(!bySrc[sid])bySrc[sid]={};
      bySrc[sid][qidx]={c:prog[k].correctCount||0,w:0};
    }
    // 合并错题数据
    for(var wk in wrong){
      if(!wrong.hasOwnProperty(wk))continue;
      var p2=wk.indexOf('::');
      var sid2=srcNameToId(wk.slice(0,p2));
      var qidx2=parseInt(wk.slice(p2+2),10);
      if(!bySrc[sid2])bySrc[sid2]={};
      if(!bySrc[sid2][qidx2])bySrc[sid2][qidx2]={c:0,w:wrong[wk]||0};
      else bySrc[sid2][qidx2].w=wrong[wk]||0;
    }
    // 生成 grasp 字符串（RLE 压缩）
    for(var sid3 in bySrc){
      if(!bySrc.hasOwnProperty(sid3))continue;
      var qs=bySrc[sid3];
      var maxIdx=0;
      for(var qk in qs)if(parseInt(qk,10)>maxIdx)maxIdx=parseInt(qk,10);
      var arr=[];
      // 9=未答, 0=已掌握(≥3次), 1=对1次, 2=对2次, 3=错1, 4=错2, 5=错≥3
      for(var i=1;i<=maxIdx;i++){
        if(qs[i]){
          var c=qs[i].c,w2=qs[i].w;
          if(c>=3)arr.push(0);
          else if(w2>=3)arr.push(5);
          else if(w2===2)arr.push(4);
          else if(w2===1)arr.push(3);
          else if(c===2)arr.push(2);
          else if(c===1)arr.push(1);
          else arr.push(9);  // c=0,w=0 → 未答
        }else{
          arr.push(9);
        }
      }
      // RLE 编码：连续相同 ≥5 用 %N_D，短连续直接拼文字（减少 % 数量）
      var rle=[],prev=-1,run=0,lit='';
      function flushLit(){
        if(lit){rle.push(lit);lit=''}
      }
      for(var di=0;di<arr.length;di++){
        var cur=arr[di];
        if(cur===prev){run++;continue}
        if(run>=5){flushLit();rle.push(run+'_'+prev)}
        else{lit+=(''+prev).repeat(run)}
        prev=cur;run=1;
      }
      if(run>=5){flushLit();rle.push(run+'_'+prev)}
      else{lit+=(''+prev).repeat(run)}
      flushLit();
      parts.push('g'+sid3+'='+rle.join('%'));
    }
  }catch(e){}

  // p: 无限模式累计答题数（不管对错）
  try{
    var pStats=safeJSON('infiniteStats',{});
    if(pStats.totalAnswered>0)parts.push('p='+pStats.totalAnswered);
  }catch(e){}

  // ha: 成就位 (honor achievement) — 13位
  // GOOD|Perfect|Awesome|Unbelievable|Fabulous|Marvelous|Legendary|Unstoppable|Godlike|Transcendent|Omnipotent|完成无限|完成限时
  try{
    var rec=safeJSON('honorRecords',[]);
    var best=0;
    rec.forEach(function(r){if(r.streak>best)best=r.streak});
    var ha='';
    var milestones=[3,10,20,30,40,50,80,110,140,170,200];
    milestones.forEach(function(m){ha+=best>=m?'1':'0'});
    ha+=rec.some(function(r){return r.label==='完成无限模式'||r.label==='无限模式'})?'1':'0';
    ha+=rec.some(function(r){return r.label==='完成限时模式'||r.label==='限时模式'})?'1':'0';
    parts.push('ha='+ha);
  }catch(e){}

  // hh: 荣誉历史 (honor history) — YEAR=MMDD:streak,MMDD:streak|YEAR=...
  try{
    var rec2=safeJSON('honorRecords',[]);
    if(rec2.length){
      var hhByYear={};
      rec2.slice(0,30).forEach(function(r){
        var d=r.time?new Date(r.time):new Date();
        var yr=d.getFullYear();
        var mm=('0'+(d.getMonth()+1)).slice(-2);
        var dd=('0'+d.getDate()).slice(-2);
        if(!hhByYear[yr])hhByYear[yr]=[];
        hhByYear[yr].push(mm+':'+(r.streak||0));
      });
      var hhParts=[];
      for(var yr2 in hhByYear)hhParts.push(yr2+'='+hhByYear[yr2].join(','));
      parts.push('hh='+hhParts.join('|'));
    }
  }catch(e){}

  // db: 仪表盘 (dashboard) — [maxStreak,goodN,perfectN,...,omnipotentN]
  try{
    var db=typeof window.getDashboard==='function'?window.getDashboard():null;
    if(db&&db.length>=12)parts.push('db='+db.join(','));
  }catch(e){}

  // t: 任务 (tasks) — tepa,tppd,tmpd,tce
  try{
    var ts=typeof window.getTasks==='function'?window.getTasks():null;
    if(ts)parts.push('t='+(ts.tepa||0)+','+(ts.tppd||0)+','+(ts.tmpd||0)+','+(ts.tce||0));
  }catch(e){}

  // s: 开关掩码 — 7位（bit 5=无限主观题, bit 6=挑战主观题）
  var s=0;
  if(localStorage.getItem('comboEffectsEnabled')!=='false')s|=64;
  if(localStorage.getItem('comboSoundEnabled')!=='false')s|=32;
  if(localStorage.getItem('motionEnabled')==='true')s|=16;
  if(localStorage.getItem('motionCal')!==null)s|=8;
  if(localStorage.getItem('cameraEnabled')==='true')s|=4;
  if(localStorage.getItem('infiniteIncludeSubjective')==='true')s|=2;
  if(localStorage.getItem('challengeIncludeSubjective')==='true')s|=1;
  parts.push('s='+s.toString(2).padStart(7,'0'));

  // src: 题库源
  try{
    var src=localStorage.getItem('sourceSelection');
    if(src)parts.push('src='+srcNameToId(src));
  }catch(e){}

  // st: 答题统计（优先内存，其次 _syncStats）
  var stC,stW,stT;
  try{stC=typeof correctCount!=='undefined'?correctCount:undefined;stT=typeof totalAnswered!=='undefined'?totalAnswered:undefined}catch(e){}
  if(typeof stC!=='number'||isNaN(stC)){
    var ss=safeJSON('_syncStats',{});
    stC=ss.c||0;stW=ss.w||0;stT=ss.t||0;
  }
  stW=stW||0;stC=stC||0;stT=stT||0;
  if(stT>0)parts.push('st='+stC+','+stW+','+stT);

  return parts.join('&');
}

// ===== 分片 =====
function makeFrames(dataStr){
  var total=Math.max(Math.ceil(dataStr.length/CHUNK_SIZE),1);
  var frames=[];
  for(var i=0;i<total;i++){
    frames.push(i+'/'+total+'|'+dataStr.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE));
  }
  return frames;
}

// ===== QR 生成 =====
function drawQR(canvas,text){
  var qrLib=typeof qrcode!=='undefined'?qrcode:(typeof QRCode!=='undefined'?QRCode:null);
  if(qrLib){
    try{
      var qr=qrLib(0,'L');
      qr.addData(text);
      qr.make();
      var mod=qr.getModuleCount();
      var size=Math.min(canvas.width,canvas.height);
      var margin=Math.round(size*0.01);
      var area=size-margin*2;
      var cell=Math.floor(area/mod);
      var totalModules=cell*mod;
      var offX=Math.round((canvas.width-totalModules)/2);
      var offY=Math.round((canvas.height-totalModules)/2);
      var ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#008314ff';
      for(var r=0;r<mod;r++)for(var c=0;c<mod;c++)if(qr.isDark(r,c))ctx.fillRect(offX+c*cell,offY+r*cell,cell,cell);
      return;
    }catch(e){console.log('[QR]',e)}
  }
  // fallback: 显示纯文本
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#000';ctx.font='10px monospace';
  var lines=text.split('&');
  lines.forEach(function(l,i){ctx.fillText(l.length>45?l.slice(0,42)+'...':l,8,14+i*14)});
}

// ===== 发送端 =====
var sendTimer=null,frames=[],frameIdx=0,sendCountdown=0,sendCanvas=null;
function startSend(){
  if(sendTimer)stopSend();
  var data=collectSyncData();
  frames=makeFrames(data);
  sendCountdown=0;
  if(!frames.length){setStatus('无数据可同步');return}
  sendCanvas=document.getElementById('sync-qr-canvas');
  if(!sendCanvas){
    sendCanvas=document.createElement('canvas');
    sendCanvas.id='sync-qr-canvas';
    var c=document.getElementById('sync-qr-area');
    if(!c)return;
    var w=c.clientWidth||400;
    sendCanvas.width=w;sendCanvas.height=w;
    c.appendChild(sendCanvas);
  }
  setStatus('发送中: '+frames.length+'帧, 数据量:'+data.length+'B');
  var hint=document.getElementById('sync-hint');
  if(hint){hint.textContent='📡 二维码 '+FRAME_MS/1000+'s 切换 · 请用另一台设备扫码';hint.classList.add('sending')}
  var btn=document.querySelector('#sync-send-pane .btn-primary');
  if(btn){btn.disabled=true;btn.textContent='发送中...'}
  setTimeout(function(){showFrame();sendTimer=setInterval(nextFrame,FRAME_MS)},1000);
}
function showFrame(){
  if(!frames.length||!sendCanvas)return;
  drawQR(sendCanvas,frames[frameIdx]);
  sendCountdown=Math.round(FRAME_MS/1000);
  setStatus('发送中: '+(frameIdx+1)+'/'+frames.length+' · 下一帧 '+sendCountdown+'s');
}
function nextFrame(){
  frameIdx=(frameIdx+1)%frames.length;showFrame();
  var t=setInterval(function(){sendCountdown--;if(sendCountdown<=0){clearInterval(t);return}
    setStatus('发送中: '+(frameIdx+1)+'/'+frames.length+' · 下一帧 '+sendCountdown+'s')},1000);
}
function stopSend(){
  if(sendTimer){clearInterval(sendTimer);sendTimer=null}
  var btn=document.querySelector('#sync-send-pane .btn-primary');
  if(btn){btn.disabled=false;btn.textContent='开始发送'}
  var hint=document.getElementById('sync-hint');
  if(hint){hint.textContent='请使用另一台设备扫码完成数据同步';hint.classList.remove('sending')}
}

// ===== 接收端 =====
var scanCollect={},scanRetry=0,scanTimer=null,lastScanData='',_scanCanvas=null;
function startScan(){
  stopScan();scanCollect={};scanRetry=0;lastScanData='';
  if(!_scanCanvas)_scanCanvas=document.createElement('canvas');
  setStatus('🔍 请求摄像头...');
  if(typeof navigator==='undefined'||!navigator.mediaDevices){setStatus('❌ 不支持的设备');return}
  var area=document.getElementById('sync-scanner-area');
  if(!area){setStatus('❌ 无扫描区域');return}
  area.innerHTML='';
  var v=document.createElement('video');
  v.id='sync-scanner-video';v.setAttribute('autoplay','');v.setAttribute('playsinline','');v.setAttribute('muted','');
  v.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:4px;transform:scaleX(-1)';
  area.appendChild(v);
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:640,height:480}})
    .then(function(s){v.srcObject=s;v.play();setStatus('🔍 扫描中...');
      if(typeof jsQR==='undefined'&&!window._jsqrLoading){window._jsqrLoading=true;loadJSQR()}
      scanTimer=setInterval(function(){scanFrame(v)},300)})
    .catch(function(e){setStatus('❌ 摄像头:'+e.message)});
}
function scanFrame(v){
  if(v.readyState<2)return;
  var cvs=_scanCanvas;cvs.width=v.videoWidth||320;cvs.height=v.videoHeight||240;
  var ctx=cvs.getContext('2d');ctx.drawImage(v,0,0);
  if(typeof jsQR!=='undefined'){
    try{
      var code=jsQR(ctx.getImageData(0,0,cvs.width,cvs.height).data,cvs.width,cvs.height);
      if(code&&code.data!==lastScanData){lastScanData=code.data;setStatus('📡 收到数据');processFrame(code.data)}
    }catch(e){}
  }else{
    setStatus('⏳ 加载解码库...');
    if(!window._jsqrLoading){window._jsqrLoading=true;loadJSQR()}
  }
}
function processFrame(data){
  var bar=data.indexOf('|');if(bar<0)return;
  var meta=data.slice(0,bar),payload=data.slice(bar+1);
  var mp=meta.split('/');if(mp.length!==2)return;
  var idx=parseInt(mp[0],10),total=parseInt(mp[1],10);
  if(isNaN(idx)||isNaN(total))return;
  scanCollect[idx]=payload;
  var have=Object.keys(scanCollect).length;
  setStatus('📥 '+have+'/'+total+' 帧');
  if(have>=total){
    var all='';
    for(var i=0;i<total;i++){if(scanCollect[i]!==undefined)all+=scanCollect[i];else{scanRetry++;if(scanRetry>MAX_RETRY){setStatus('❌ 超时');stopScan()}return}}
    try{applyData(all);setStatus('✅ 同步成功!');stopScan();setTimeout(function(){location.reload()},2000)}
    catch(e){setStatus('❌ '+e.message);stopScan()}
  }
}
function applyData(s){
  var obj={};s.split('&').forEach(function(p){var e=p.indexOf('=');if(e<0)return;obj[p.slice(0,e)]=p.slice(e+1)});

  // g: grasp 进度还原
  for(var k in obj){
    if(k[0]!=='g'||k.length<2)continue;
    var sid=parseInt(k.slice(1),10);
    if(isNaN(sid))continue;
    var srcName=srcIdToName(sid);
    if(srcName==='unknown')continue;
    var str=obj[k];
    // 解析 % 分隔 + _N_D RLE
    var digits=[];
    str.split('%').forEach(function(tok){
      var us=tok.indexOf('_');
      if(us>0){
        var n=parseInt(tok.slice(0,us),10),d=tok.slice(us+1);
        if(!isNaN(n))for(var ri=0;ri<n;ri++)digits.push(d);
      }else{
        for(var ti=0;ti<tok.length;ti++)digits.push(tok[ti]);
      }
    });
    var prog={},wrongEntries={};
     // 第1题对应数组下标0，即 i=0 → 题号1
     for(var di=0;di<digits.length;di++){
       var ch=digits[di];
       if(ch<'0'||ch>'9')continue;
       var qk=srcName+'::'+(di+1);  // 题号从1开始
       var v=parseInt(ch,10);
       // 9=未答(跳过), 0=已掌握(≥3次), 1=对1次, 2=对2次
       if(v===9)continue;
        if(v===0)prog[qk]={correctCount:3};
        else if(v===1)prog[qk]={correctCount:1};
        else if(v===2)prog[qk]={correctCount:2};
       // 3=错1, 4=错2, 5=错≥3
       if(v>=3)wrongEntries[qk]=(wrongEntries[qk]||0)+1;
    }
    try{localStorage.setItem('infiniteProgress',JSON.stringify(prog))}catch(e){}
    // 从 g 编码重建 infiniteSession（dots / wrongStreak）
    try{
      var ses={};
      for(var si=0;si<digits.length;si++){
        var sv=digits[si];
        if(sv<'0'||sv>'9')continue;
        var sqk=srcName+'::'+(si+1);
        var siv=parseInt(sv,10);
        if(siv===9)continue;
        if(siv===0)ses[sqk]={dots:3,wrongStreak:0};
        else if(siv===1)ses[sqk]={dots:1,wrongStreak:0};
        else if(siv===2)ses[sqk]={dots:2,wrongStreak:0};
        else if(siv===3)ses[sqk]={dots:0,wrongStreak:1};
        else if(siv===4)ses[sqk]={dots:0,wrongStreak:2};
        else if(siv>=5)ses[sqk]={dots:0,wrongStreak:3};
      }
      localStorage.setItem('infiniteSession',JSON.stringify(ses));
    }catch(e){}
    // 写回 wrongBooks（保留已有结构，追加标记错误题目）
    if(Object.keys(wrongEntries).length){
      try{
        var wb=safeJSON('wrongBooks',{});
        var defId=null;
        for(var wid in wb){defId=wid;break}
        if(!defId)defId='default';
        if(!wb[defId])wb[defId]={name:'默认错题本',temp:{},long:{},notes:{}};
        for(var qk2 in wrongEntries){
          var cnt=wrongEntries[qk2];
          if(cnt>=3)wb[defId].long[qk2]=true;
          else wb[defId].temp[qk2]=true;
        }
        localStorage.setItem('wrongBooks',JSON.stringify(wb));
      }catch(e){}
    }
  }

  // ha: 成就 — 无需写入 localStorage，由 hh 重建
  // hh: 荣誉历史 — YEAR=MMDD:streak,MMDD:streak|YEAR=...
  if(obj.hh){
    var hs=[];
    obj.hh.split('|').forEach(function(yrBlock){
      var eq=yrBlock.indexOf('=');
      var year=eq>0?parseInt(yrBlock.slice(0,eq),10):new Date().getFullYear();
      var entries=yrBlock.slice(eq+1);
      entries.split(',').forEach(function(e){
        var col=e.indexOf(':');
        if(col<0)return;
        var md=e.slice(0,col),streak=parseInt(e.slice(col+1),10);
        if(md.length!==4||isNaN(streak))return;
        var d=new Date(year,parseInt(md.slice(0,2),10)-1,parseInt(md.slice(2),10));
        hs.push({time:d.toLocaleString(),streak:streak});
      });
    });
    try{localStorage.setItem('honorRecords',JSON.stringify(hs))}catch(e){}
  }

  // db: 仪表盘
  if(obj.db){
    try{
      var dbArr=obj.db.split(',').map(function(x){return parseInt(x,10)||0});
      if(dbArr.length>=12)localStorage.setItem('honorDashboard',JSON.stringify(dbArr));
    }catch(e){}
  }

  // t: 任务
  if(obj.t){
    try{
      var tp=obj.t.split(',');
      if(tp.length>=4){
        localStorage.setItem('honorTasks',JSON.stringify({
          date:new Date().getFullYear()+'-'+('0'+(new Date().getMonth()+1)).slice(-2)+'-'+('0'+new Date().getDate()).slice(-2),
          tepa:parseInt(tp[0],10)||0,
          tppd:parseInt(tp[1],10)||0,
          tmpd:parseInt(tp[2],10)||0,
          tce:parseInt(tp[3],10)||0
        }));
      }
    }catch(e){}
  }

  // s: 开关（支持 6 位旧格式和 7 位新格式）
  if(obj.s&&obj.s.length>=6){
    var b=obj.s;
    try{localStorage.setItem('comboEffectsEnabled',b[0]==='1'?'true':'false')}catch(e){}
    try{localStorage.setItem('comboSoundEnabled',b[1]==='1'?'true':'false')}catch(e){}
    try{localStorage.setItem('motionEnabled',b[2]==='1'?'true':'false')}catch(e){}
    try{localStorage.setItem('cameraEnabled',b[4]==='1'?'true':'false')}catch(e){}
    if(b.length>=7){
      // 7 位新格式：bit5=无限主观题, bit6=挑战主观题
      try{localStorage.setItem('infiniteIncludeSubjective',b[5]==='1'?'true':'false')}catch(e){}
      try{localStorage.setItem('challengeIncludeSubjective',b[6]==='1'?'true':'false')}catch(e){}
    }else{
      // 6 位旧格式：bit5=两者共用
      try{localStorage.setItem('infiniteIncludeSubjective',b[5]==='1'?'true':'false')}catch(e){}
      try{localStorage.setItem('challengeIncludeSubjective',b[5]==='1'?'true':'false')}catch(e){}
    }
  }

  if(obj.src){
    var sidV=parseInt(obj.src,10);
    var sel={};
    for(var si=0;si<QUIZ_SOURCES.length;si++)sel[QUIZ_SOURCES[si].name]=(si===sidV);
    try{localStorage.setItem('sourceSelection',JSON.stringify(sel))}catch(e){}
  }
  if(obj.st){
    var sp=obj.st.split(',');
    if(sp.length===3){try{localStorage.setItem('_correctCount',sp[0]);localStorage.setItem('_wrongCount',sp[1]);localStorage.setItem('_totalAnswered',sp[2])}catch(e){}}
  }
}

function stopScan(){
  if(scanTimer){clearInterval(scanTimer);scanTimer=null}
  var v=document.getElementById('sync-scanner-video');
  if(v&&v.srcObject){v.srcObject.getTracks().forEach(function(t){t.stop()});v.srcObject=null}
}

// ===== QR 库加载 =====
var LIB_BASE='assets/lib/';
function loadScript(s,fail){var e=document.createElement('script');e.src=s;e.onload=function(){setStatus('库:'+s.split('/').pop())};e.onerror=fail||function(){};document.head.appendChild(e)}
function loadJSQR(){loadScript(LIB_BASE+'jsqr.min.js',function(){setStatus('本地失败，尝试 CDN...');loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js')})}
function loadQRCodeLib(){if(typeof qrcode!=='undefined'||typeof QRCode!=='undefined')return;loadScript(LIB_BASE+'qrcodegen.min.js',function(){loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js')})}

// ===== UI =====
function setStatus(msg){
  var el=document.getElementById('sync-status');
  if(!el)return;el.textContent=msg;el.classList.remove('sync-ok','sync-err');
  if(msg.indexOf('✅')>=0)el.classList.add('sync-ok');else if(msg.indexOf('❌')>=0)el.classList.add('sync-err');
}

window.startSyncSend=function(){loadQRCodeLib();setTimeout(startSend,300)};
window.startSyncScan=function(){startScan()};
window.stopSync=function(){stopSend();stopScan();setStatus('已停止')};
window.toggleSyncPanel=function(){
  var el=document.getElementById('sync-panel');
  if(!el)return;el.classList.toggle('hidden');
  if(el.classList.contains('hidden')){stopSend();stopScan();setStatus('')}
};
window.switchSyncTab=function(tab,btn){
  document.querySelectorAll('.sync-tab').forEach(function(t){t.classList.remove('active')});
  btn.classList.add('active');
  document.getElementById('sync-send-pane').classList.toggle('hidden',tab!=='send');
  document.getElementById('sync-scan-pane').classList.toggle('hidden',tab!=='scan');
  stopSend();stopScan();setStatus('就绪');
};

setTimeout(loadQRCodeLib,1000);

// ===== 导出/导入 =====
var _lastSyncData='';
window.toggleSyncExport=function(){
  var body=document.getElementById('sync-export-body');
  var arrow=document.getElementById('sync-export-arrow');
  if(!body||!arrow)return;
  var show=body.style.display!=='block';
  body.style.display=show?'block':'none';
  arrow.textContent=show?'▼':'▶';
  if(show){
    var data=_lastSyncData||collectSyncData();
    document.getElementById('sync-export-text').value=data;
  }
};
window.copySyncData=function(){
  var ta=document.getElementById('sync-export-text');
  if(!ta)return;
  ta.select();try{document.execCommand('copy')}catch(e){navigator.clipboard.writeText(ta.value).catch(function(){})}
  setStatus('✅ 已复制到剪贴板');
};
window.downloadSyncData=function(){
  var ta=document.getElementById('sync-export-text');
  if(!ta||!ta.value)return;
  var blob=new Blob([ta.value],{type:'text/plain'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='superquestioner-sync-'+new Date().toISOString().slice(0,10)+'.txt';
  a.click();URL.revokeObjectURL(a.href);
  setStatus('✅ 已下载');
};
window.toggleSyncImport=function(){
  var body=document.getElementById('sync-import-body');
  var arrow=document.getElementById('sync-import-arrow');
  if(!body||!arrow)return;
  var show=body.style.display!=='block';
  body.style.display=show?'block':'none';
  arrow.textContent=show?'▼':'▶';
};
window.importSyncData=function(){
  var ta=document.getElementById('sync-import-text');
  if(!ta||!ta.value.trim()){setStatus('❌ 无数据');return}
  try{applyData(ta.value.trim());setStatus('✅ 导入成功!');setTimeout(function(){location.reload()},2000)}
  catch(e){setStatus('❌ 导入失败:'+e.message)}
};
window.importSyncFile=function(input){
  if(!input.files||!input.files[0])return;
  var reader=new FileReader();
  reader.onload=function(e){
    var ta=document.getElementById('sync-import-text');
    if(ta)ta.value=e.target.result;
  };
  reader.readAsText(input.files[0]);
  input.value='';
};

// 在 startSend 末尾记录数据
var _origStartSend=window.startSyncSend;
window.startSyncSend=function(){
  _lastSyncData=collectSyncData();
  var area=document.getElementById('sync-export-area');
  if(area)area.style.display='';
  _origStartSend();
};
console.log('[transportation] 就绪');
})();
