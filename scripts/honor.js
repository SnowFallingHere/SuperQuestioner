// 荣誉系统 — 连击里程碑记录 + SVG 徽章
(function(){
'use strict';

// ===== SVG 徽章 =====
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
  {v:3, label:'GOOD'},{v:10,label:'Perfect!'},{v:20,label:'Awesome!'},
  {v:30,label:'Unbelievable!'},{v:40,label:'Fabulous!'},{v:50,label:'Marvelous!'},
  {v:80,label:'Legendary!'},{v:110,label:'Unstoppable!'},{v:140,label:'Godlike!'},
  {v:170,label:'Transcendent!'},{v:200,label:'Omnipotent!'}
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

// ===== 记录时机：在答错时检测 =====
// 暴露给外部调用（由 app.js 在答错时调用）
window.recordHonor=function(streakValue){
  if(typeof streakValue!=='number'||streakValue<3)return;
  var lbl=getLabel(streakValue);
  var entry={time:new Date().toLocaleString(),streak:streakValue,label:lbl+' +'+streakValue};
  var rec=loadRecords();
  rec.unshift(entry);
  if(rec.length>200)rec=rec.slice(0,200);
  saveRecords(rec);
};

// ===== 检查成就进度 =====
function getAchievements(){
  var rec=loadRecords();
  var best=0;
  rec.forEach(function(r){if(r.streak>best)best=r.streak});
  return {
    milestones:MILESTONES.map(function(m){return{value:m.v,label:m.label,unlocked:best>=m.v}}),
    completedInfinite:rec.some(function(r){return r.label==='完成无限模式'}),
    completedTimed:rec.some(function(r){return r.label==='完成限时模式'})
  };
}

// ===== 创建 SVG 徽章 HTML =====
function badgeHTML(v,unlocked){
  var svg=SVG_ICONS[v]||'<circle cx="24" cy="24" r="20" fill="#ddd"/>';
  var cls='honor-badge'+(unlocked?' unlocked':'');
  return '<div class="'+cls+'">'+
    '<svg viewBox="0 0 48 48" width="48" height="48">'+svg+'</svg>'+
    '<div class="honor-badge-label">'+STREAK_LABEL[v]+'</div>'+
  '</div>';
}

// ===== 渲染面板 =====
function renderPanel(){
  var ach=getAchievements();
  var html='<div class="honor-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center" onclick="closeHonorPanel()"><div class="honor-panel" style="background:#fff;border-radius:16px;padding:20px 24px;max-width:560px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.25)" onclick="event.stopPropagation()">'+
    '<div class="honor-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2 style="margin:0;font-size:20px">🎖 荣誉殿堂</h2><span class="honor-close" style="font-size:28px;cursor:pointer;color:#999;line-height:1" onclick="closeHonorPanel()">×</span></div>';

  // 上栏：成就
  html+='<div class="honor-section"><h3>成就</h3><div class="honor-badges">';
  ach.milestones.forEach(function(m){html+=badgeHTML(m.value,m.unlocked)});
  html+='<div class="honor-badge'+(ach.completedInfinite?' unlocked':'')+'">'+
    '<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="18" fill="none" stroke="#6c5ce7" stroke-width="2"/><text x="24" y="20" text-anchor="middle" font-size="10" fill="#6c5ce7">∞</text><text x="24" y="32" text-anchor="middle" font-size="7" fill="#6c5ce7">无限</text></svg>'+
    '<div class="honor-badge-label">完成无限模式</div></div>';
  html+='<div class="honor-badge'+(ach.completedTimed?' unlocked':'')+'">'+
    '<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="18" fill="none" stroke="#f5c211" stroke-width="2"/><text x="24" y="20" text-anchor="middle" font-size="14" fill="#f5c211">⏱</text><text x="24" y="32" text-anchor="middle" font-size="7" fill="#f5c211">限时</text></svg>'+
    '<div class="honor-badge-label">完成限时模式</div></div>';
  html+='</div></div>';

  // 下栏：历史记录
  var rec=loadRecords();
  html+='<div class="honor-section"><h3>历史荣誉 <span class="honor-count">('+rec.length+')</span></h3>';
  if(rec.length===0){
    html+='<div class="honor-empty">暂无荣誉记录，开始答题吧！<br>答错时会自动记录本次连击数</div>';
  }else{
    html+='<div class="honor-list">';
    rec.forEach(function(r){
      html+='<div class="honor-item"><span class="honor-time">'+r.time+'</span><span class="honor-label">'+r.label+'</span></div>';
    });
    html+='</div>';
  }
  html+='</div></div></div>';

  return html;
}

// ===== 开关面板 =====
window.openHonorPanel=function(){
  var el=document.getElementById('honor-panel-container');
  if(!el){el=document.createElement('div');el.id='honor-panel-container';document.body.appendChild(el)}
  el.innerHTML=renderPanel();
};
window.closeHonorPanel=function(){
  var el=document.getElementById('honor-panel-container');
  if(el)el.innerHTML='';
};
window.refreshHonorPanel=function(){
  var el=document.getElementById('honor-panel-container');
  if(el&&el.innerHTML){try{el.innerHTML=renderPanel()}catch(e){}}
};
window.clearAllHonors=function(){
  try{localStorage.removeItem('honorRecords')}catch(e){}
  // 关闭并重新打开面板以刷新
  var el=document.getElementById('honor-panel-container');
  if(el){el.innerHTML='';setTimeout(function(){el.innerHTML=renderPanel()},50)}
};

// 🎖 按钮点击
window.onHonorClick=function(){openHonorPanel()};

// ===== 记录「完成模式」成就 =====
window.recordModeComplete=function(modeLabel){
  var rec=loadRecords();
  rec.unshift({time:new Date().toLocaleString(),streak:0,label:modeLabel});
  saveRecords(rec);
};
})();
