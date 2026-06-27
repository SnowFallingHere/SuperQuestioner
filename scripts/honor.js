// 荣誉系统 — 连击里程碑记录 + SVG 徽章 + 仪表盘 + 任务
(function(){
'use strict';

// ===== SVG 徽章（不变） =====
var SVG_ICONS = {
  3:'<circle cx="24" cy="24" r="20" fill="#cdd6f4" stroke="#585b70" stroke-width="2"/><text x="24" y="28" text-anchor="middle" font-size="18" font-weight="700" fill="#585b70">✓</text>',
  10:'<path d="M24 6L8 16v12l16 10 16-10V16z" fill="#89b4fa" stroke="#1e66f5" stroke-width="1.5"/><text x="24" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">10</text>',
  20:'<path d="M24 4C18 4 12 10 10 16c-2 6 0 14 14 20 14-6 16-14 14-20C36 10 30 4 24 4z" fill="#f9e2af" stroke="#f5c211" stroke-width="1.5"/><path d="M24 16l-3 6 6-2-3 8" stroke="#f5c211" stroke-width="2" fill="none" stroke-linecap="round"/><text x="28" y="22" font-size="8" fill="#f5c211" font-weight="700">!</text>',
  30:'<path d="M30 4L12 28h10l-4 16 18-24H26z" fill="#cba6f7" stroke="#8839ef" stroke-width="1.5"/>',
  40:'<path d="M12 30l4-14 8-8 8 8 4 14-12 6z" fill="#f5c211" stroke="#d4a200" stroke-width="1.5"/><text x="24" y="22" text-anchor="middle" font-size="9" fill="#7a5c00" font-weight="700">👑</text>',
  50:'<path d="M24 6l5 10 11 2-8 7 2 11-10-5-10 5 2-11-8-7 11-2z" fill="#a6e3a1" stroke="#40a02b" stroke-width="1.5"/><text x="24" y="18" text-anchor="middle" font-size="8" fill="#40a02b" font-weight="700">◆</text>',
  80:'<path d="M8 32Q16 8 24 24Q32 8 40 32Q32 20 24 32Q16 20 8 32" fill="#89dceb" stroke="#04a5e5" stroke-width="1.5"/>',
  110:'<path d="M14 6l-4 16h8l-4 16m12-32l4 16h-8l4 16" stroke="#f38ba8" stroke-width="3" fill="none" stroke-linecap="round"/>',
  140:'<ellipse cx="24" cy="14" rx="16" ry="6" fill="#f5c211" opacity=".6"/><circle cx="24" cy="24" r="12" fill="#cba6f7" stroke="#8839ef" stroke-width="1.5"/><text x="24" y="28" text-anchor="middle" font-size="12" fill="#8839ef" font-weight="700">✦</text>',
  170:'<circle cx="24" cy="24" r="18" fill="none" stroke="#89b4fa" stroke-width="1" opacity=".5"/><circle cx="24" cy="24" r="12" fill="none" stroke="#89b4fa" stroke-width="1.5"/><circle cx="24" cy="24" r="5" fill="#89b4fa"/><circle cx="12" cy="12" r="2" fill="#89b4fa" opacity=".3"/><circle cx="36" cy="14" r="1.5" fill="#89b4fa" opacity=".4"/><circle cx="34" cy="34" r="2" fill="#89b4fa" opacity=".2"/>',
  200:'<path d="M12 12c0-4 4-8 8-8s8 4 8 8c0 8-8 12-8 12s-8-4-8-12m16-4c0-4 4-8 8-8s8 4 8 8c0 8-8 12-8 12s-8-4-8-12" stroke="#f5c211" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
};

var MILESTONES = [
  {v:3, label:'GOOD', desc:'连续答对 3 题'},
  {v:10,label:'Perfect!', desc:'连续答对 10 题'},
  {v:20,label:'Awesome!', desc:'连续答对 20 题'},
  {v:30,label:'Unbelievable!', desc:'连续答对 30 题'},
  {v:40,label:'Fabulous!', desc:'连续答对 40 题'},
  {v:50,label:'Marvelous!', desc:'连续答对 50 题'},
  {v:80,label:'Legendary!', desc:'连续答对 80 题'},
  {v:110,label:'Unstoppable!', desc:'连续答对 110 题'},
  {v:140,label:'Godlike!', desc:'连续答对 140 题'},
  {v:170,label:'Transcendent!', desc:'连续答对 170 题'},
  {v:200,label:'Omnipotent!', desc:'连续答对 200 题'}
];
var STREAK_LABEL = {}; MILESTONES.forEach(function(m){STREAK_LABEL[m.v]=m.label});

function getLabel(s){
  var lbl='';
  MILESTONES.forEach(function(m){if(s>=m.v)lbl=m.label});
  return lbl;
}

// ===== 数据管理 =====
var HONOR_KEY='honorRecords';
function loadRecords(){try{return JSON.parse(localStorage.getItem(HONOR_KEY)||'[]')}catch(e){return[]}}
function saveRecords(r){try{localStorage.setItem(HONOR_KEY,JSON.stringify(r))}catch(e){}}

// ===== 仪表盘：里程碑获得次数 =====
var DASH_KEY='honorDashboard';
function loadDashboard(){
  try{return JSON.parse(localStorage.getItem(DASH_KEY)||'[]')}catch(e){return[]}
}
function saveDashboard(d){
  try{
    // 格式: [maxStreak, count3, count10, count20, count30, count40, count50, count80, count110, count140, count170, count200]
    localStorage.setItem(DASH_KEY,JSON.stringify(d));
  }catch(e){}
}
function initDashboard(){
  var d=loadDashboard();
  // 如果不存在则初始化：maxStreak=0, 各里程碑0
  if(!d.length||d.length<12){
    d=[0,0,0,0,0,0,0,0,0,0,0,0];
    saveDashboard(d);
  }
  return d;
}
function getMilestoneIdx(v){
  var idxMap={3:1,10:2,20:3,30:4,40:5,50:6,80:7,110:8,140:9,170:10,200:11};
  return idxMap[v]!==undefined?idxMap[v]:-1;
}
function updateDashboard(streakValue){
  if(typeof streakValue!=='number')return;
  var d=initDashboard();
  if(streakValue>d[0])d[0]=streakValue; // 更新最高
  // 更新对应里程碑计数
  var idx=getMilestoneIdx(streakValue);
  if(idx>=0&&idx<d.length)d[idx]=(d[idx]||0)+1;
  saveDashboard(d);
}
window.getDashboard=function(){return initDashboard()};

// ===== 任务系统 =====
var TASK_KEY='honorTasks';
function loadTasks(){
  try{
    var raw=JSON.parse(localStorage.getItem(TASK_KEY)||'{}');
    // 检查日期是否变更
    var today=dateStr();
    if(raw.date!==today){
      raw.tepa=0;raw.tppd=0;raw.tmpd=0;raw.date=today;
      localStorage.setItem(TASK_KEY,JSON.stringify(raw));
    }
    return raw;
  }catch(e){return{date:dateStr(),tepa:0,tppd:0,tmpd:0,tce:0}}
}
function saveTasks(t){try{localStorage.setItem(TASK_KEY,JSON.stringify(t))}catch(e){}}
function dateStr(){
  var d=new Date();
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
function initTasks(){
  var t=loadTasks();
  // tce: 连续天数的特殊处理，不因日重置清零
  return t;
}
// 计算连续天数
function calcConsecutiveDays(){
  try{
    var rec=loadRecords();
    if(!rec.length)return 0;
    var days=new Set();
    rec.forEach(function(r){
      try{
        var d=new Date(r.time);
        days.add(d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2));
      }catch(e){}
    });
    var sorted=Array.from(days).sort();
    if(!sorted.length)return 0;
    // 从今天开始往前数连续天数
    var today=dateStr();
    var count=0;
    for(var i=sorted.length-1;i>=0;i--){
      var expected=dateOffset(today,-count);
      if(sorted[i]===expected){count++;continue}
      else if(sorted[i]<expected)break; // 不连续
    }
    return count;
  }catch(e){return 0}
}
function dateOffset(base,offset){
  var d=new Date(base);
  d.setDate(d.getDate()+offset);
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}

// ===== 外部触发接口 =====

// 答题一次（记录日任务 & 连续天数）
window.recordDailyExercise=function(){
  var t=initTasks();
  t.tepa=1;
  // 更新连续天数
  var days=calcConsecutiveDays();
  t.tce=days;
  saveTasks(t);
};

// 完成闯关
window.recordDailyPass=function(){
  var t=initTasks();
  t.tppd=1;
  saveTasks(t);
};

// 获得连击里程碑（同时更新仪表盘）
window.recordMilestone=function(streakValue){
  var t=initTasks();
  t.tmpd=1;
  saveTasks(t);
  updateDashboard(streakValue);
};

// 获取任务状态
window.getTasks=function(){
  var t=initTasks();
  var days=calcConsecutiveDays();
  t.tce=days;
  return t;
};

// ===== 记录荣誉（兼容旧接口，增加仪表盘） =====
window.recordHonor=function(streakValue){
  if(typeof streakValue!=='number'||streakValue<3)return;
  var lbl=getLabel(streakValue);
  var entry={time:new Date().toLocaleString(),streak:streakValue,label:lbl+' +'+streakValue};
  var rec=loadRecords();
  rec.unshift(entry);
  if(rec.length>200)rec=rec.slice(0,200);
  saveRecords(rec);
  // 更新仪表盘
  updateDashboard(streakValue);
  // 记录里程碑任务
  var t=initTasks();
  t.tmpd=1;
  saveTasks(t);
};

// ===== 检查成就进度 =====
function getAchievements(){
  var rec=loadRecords();
  var best=0;
  rec.forEach(function(r){if(r.streak>best)best=r.streak});
  return {
    milestones:MILESTONES.map(function(m){return{value:m.v,label:m.label,unlocked:best>=m.v}}),
    completedInfinite:rec.some(function(r){return r.label==='完成无限模式'||r.label==='无限模式'}),
    completedTimed:rec.some(function(r){return r.label==='完成限时模式'||r.label==='限时模式'})
  };
}

// ===== 创建 SVG 徽章 HTML =====
function badgeHTML(v,unlocked){
  var m=MILESTONES.find(function(x){return x.v===v});
  var svg=SVG_ICONS[v]||'<circle cx="24" cy="24" r="20" fill="#ddd"/>';
  var cls='honor-badge'+(unlocked?' unlocked':'');
  var title=(m?m.label:'')+' · '+(unlocked?'✅ 已解锁':(m?m.desc:'❌ 未解锁'));
  return '<div class="'+cls+'" title="'+title+'">'+
    '<svg viewBox="0 0 48 48" width="48" height="48">'+svg+'</svg>'+
    '<div class="honor-badge-label">'+(m?m.label:'')+'</div>'+
  '</div>';
}

// ===== SVG 奖杯 =====
function trophySVG(streak){
  var s=streak||0;
  return '<svg class="honor-trophy" viewBox="0 0 120 120" width="120" height="120">'+
    '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5c211"/><stop offset="100%" stop-color="#d4a200"/></linearGradient>'+
    '<linearGradient id="tg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffe066"/><stop offset="100%" stop-color="#f5c211"/></linearGradient>'+
    '<radialGradient id="tg3"><stop offset="0%" stop-color="#fff8d6"/><stop offset="100%" stop-color="#f5c211"/></radialGradient></defs>'+
    // 奖杯主体
    '<path d="M40 95h40v10H40z" fill="#b8870a"/>'+
    '<rect x="44" y="92" width="32" height="6" rx="2" fill="#d4a200"/>'+
    // 杯身
    '<path d="M30 20c0 15 5 40 30 50 25-10 30-35 30-50H75c0 10-5 20-15 25-10-5-15-15-15-25H30z" fill="url(#tg3)" stroke="#b8870a" stroke-width="2"/>'+
    // 高光
    '<path d="M40 25c0 12 5 30 20 38" fill="none" stroke="#fff" stroke-width="1.5" opacity=".3"/>'+
    // 左把手
    '<path d="M30 30c-15 0-20 10-10 15" fill="none" stroke="#d4a200" stroke-width="4" stroke-linecap="round"/>'+
    // 右把手
    '<path d="M90 30c15 0 20 10 10 15" fill="none" stroke="#d4a200" stroke-width="4" stroke-linecap="round"/>'+
    // 彩带左
    '<path d="M50 55l-15 40h10l5-40" fill="#e64553" opacity=".8"/>'+
    // 彩带右
    '<path d="M70 55l15 40h-10l-5-40" fill="#e64553" opacity=".8"/>'+
    // 星标
    '<text x="60" y="48" text-anchor="middle" font-size="14" fill="#b8870a" font-weight="700">🏆</text>'+
    // 数字
    '<text x="60" y="75" text-anchor="middle" font-size="22" font-weight="900" fill="#6c5ce7">'+(s>0?s:'—')+'</text>'+
    '<text x="60" y="88" text-anchor="middle" font-size="8" fill="#b8870a">最高连击</text></svg>';
}

// ===== 仪表盘 HTML =====
function dashboardHTML(){
  var d=initDashboard();
  if(!d||d.length<12)return'<div class="honor-dashboard">暂无数据</div>';
  var labels=['GOOD','Perfect!','Awesome!','Unbelievable!','Fabulous!','Marvelous!','Legendary!','Unstoppable!','Godlike!','Transcendent!','Omnipotent!'];
  // d[0]=maxStreak, d[1]-d[11]=各里程碑计数
  var html='<div class="honor-dash-grid">';
  // 跳过 d[0]（最高连击已在奖杯显示）
  for(var i=1;i<d.length;i++){
    var cnt=d[i]||0;
    if(cnt===0)continue;
    var lbl=labels[i-1]||'M'+i;
    html+='<div class="honor-dash-item"><span class="honor-dash-label">'+lbl+'</span><span class="honor-dash-count">×'+cnt+'</span></div>';
  }
  html+='</div>';
  if(d.slice(1).every(function(v){return!v}))html='<div class="honor-empty-sm">尚未获得里程碑</div>';
  return html;
}

// ===== 任务 HTML =====
function tasksHTML(){
  var t=initTasks();
  var days=calcConsecutiveDays();
  t.tce=days;
  var tasks=[
    {k:'tepa',l:'每日答题',c:t.tepa?'✅':'⬜'},
    {k:'tppd',l:'每日闯关',c:t.tppd?'✅':'⬜'},
    {k:'tmpd',l:'每日连击里程碑',c:t.tmpd?'✅':'⬜'},
    {k:'tce3',l:'连续作答 3 天',c:days>=3?'✅':'⬜',n:days+'/3'},
    {k:'tce30',l:'连续作答 30 天',c:days>=30?'✅':'⬜',n:days+'/30'},
    {k:'tce180',l:'连续作答 6 个月',c:days>=180?'✅':'⬜',n:days+'/180'},
    {k:'tce365',l:'连续作答 1 年',c:days>=365?'✅':'⬜',n:days+'/365'}
  ];
  var html='<div class="honor-tasks">';
  tasks.forEach(function(tk){
    html+='<div class="honor-task-item"><span class="honor-task-icon">'+tk.c+'</span><span class="honor-task-label">'+tk.l+'</span>';
    if(tk.n)html+='<span class="honor-task-progress">'+tk.n+'</span>';
    html+='</div>';
  });
  html+='</div>';
  return html;
}

// ===== 渲染三栏面板 =====
function renderPanel(tab){
  var ach=getAchievements();
  var isDark=document.body.getAttribute('data-theme')==='dark';
  var bg=isDark?'#1e1e2e':'#fff';
  var fg=isDark?'#cdd6f4':'#333';
  var close=isDark?'#6c7086':'#999';
  var html='<div class="honor-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;align-items:center;justify-content:center" id="honor-overlay"><div class="honor-panel" style="background:'+bg+';border-radius:16px;padding:16px 20px;max-width:580px;width:94%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.25);color:'+fg+'" onclick="event.stopPropagation()">'+
    '<div class="honor-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0"><h2 style="margin:0;font-size:20px;color:'+fg+'">🎖 荣誉殿堂</h2><span class="honor-close" style="font-size:28px;cursor:pointer;color:'+close+';line-height:1" onclick="closeHonorPanel()">×</span></div>'+
    // 三栏 Tab
    '<div class="honor-tabs"><button class="honor-tab'+(tab==='ach'?' active':'')+'" onclick="switchHonorTab(\'ach\')">成就</button><button class="honor-tab'+(tab==='task'?' active':'')+'" onclick="switchHonorTab(\'task\')">任务</button><button class="honor-tab'+(tab==='hist'?' active':'')+'" onclick="switchHonorTab(\'hist\')">历史战绩</button></div>'+
    // Tab 内容
    '<div class="honor-tab-content">';

  if(tab==='ach'){
    // 奖杯 + 仪表盘
    var d=initDashboard();
    html+='<div class="honor-ach-section"><div class="honor-trophy-wrap">'+trophySVG(d[0])+'</div><div class="honor-dash-wrap">'+dashboardHTML()+'</div></div>';
    // 成就徽章
    html+='<div class="honor-badges-wrap"><h4>里程碑</h4><div class="honor-badges">';
    ach.milestones.forEach(function(m){html+=badgeHTML(m.value,m.unlocked)});
    html+='<div class="honor-badge'+(ach.completedInfinite?' unlocked':'')+'" title="无限模式 · '+(ach.completedInfinite?'✅ 已解锁':'全部题目掌握后解锁')+'">'+
      '<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="18" fill="none" stroke="#6c5ce7" stroke-width="2"/><text x="24" y="20" text-anchor="middle" font-size="10" fill="#6c5ce7">∞</text><text x="24" y="32" text-anchor="middle" font-size="7" fill="#6c5ce7">无限</text></svg>'+
      '<div class="honor-badge-label caption-complete">无限模式</div></div>';
    html+='<div class="honor-badge'+(ach.completedTimed?' unlocked':'')+'" title="限时模式 · '+(ach.completedTimed?'✅ 已解锁':'完成一次限时模式后解锁')+'">'+
      '<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="18" fill="none" stroke="#f5c211" stroke-width="2"/><text x="24" y="20" text-anchor="middle" font-size="14" fill="#f5c211">⏱</text><text x="24" y="32" text-anchor="middle" font-size="7" fill="#f5c211">限时</text></svg>'+
      '<div class="honor-badge-label caption-complete">限时模式</div></div>';
    html+='</div></div>';
  }else if(tab==='task'){
    html+=tasksHTML();
  }else{
    // 历史战绩
    var rec=loadRecords();
    html+='<div class="honor-hist-section"><div class="honor-count-badge">共 '+rec.length+' 条记录</div>';
    if(rec.length===0){
      html+='<div class="honor-empty">暂无荣誉记录，开始答题吧！</div>';
    }else{
      html+='<div class="honor-list">';
      rec.forEach(function(r){
        html+='<div class="honor-item"><span class="honor-time">'+r.time+'</span><span class="honor-label">'+r.label+'</span></div>';
      });
      html+='</div>';
    }
    html+='</div>';
  }

  html+='</div></div></div>';
  return html;
}

// ===== 开关面板 =====
window.openHonorPanel=function(tab){tab=tab||'ach';
  var el=document.getElementById('honor-panel-container');
  if(!el)return;
  el.style.display='';
  el.innerHTML=renderPanel(tab);
};
window.closeHonorPanel=function(){
  var el=document.getElementById('honor-panel-container');
  if(el){el.style.display='none';el.innerHTML=''}
};
window.refreshHonorPanel=function(){
  var el=document.getElementById('honor-panel-container');
  if(el&&el.style.display!=='none'){try{el.innerHTML=renderPanel(getCurrentTab())}catch(e){}}
};
window.switchHonorTab=function(tab){
  var el=document.getElementById('honor-panel-container');
  if(el&&el.style.display!=='none'){el.innerHTML=renderPanel(tab)}
};
function getCurrentTab(){
  var el=document.querySelector('.honor-tab.active');
  return el?el.textContent.trim():'ach';
}
window.clearAllHonors=function(){
  try{localStorage.removeItem('honorRecords');localStorage.removeItem('honorDashboard')}catch(e){}
  var el=document.getElementById('honor-panel-container');
  if(el&&el.style.display!=='none'){el.innerHTML='';setTimeout(function(){el.innerHTML=renderPanel('ach')},50)}
};

// 🎖 按钮点击
window.onHonorClick=function(){openHonorPanel('ach')};

// ===== 记录「完成模式」成就 =====
window.recordModeComplete=function(modeLabel){
  var rec=loadRecords();
  rec.unshift({time:new Date().toLocaleString(),streak:0,label:modeLabel});
  saveRecords(rec);
};
})();
