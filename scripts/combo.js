// 连击（Combo）显示 — 仅限无限模式 streak >= 30 时激活
// 每次连击数变化时弹跳出现，2 秒后消失
(function(){
'use strict';

var el=null, lastStreak=-1, hideTimer=null;

function getEl(){
  if(el)return el;
  el=document.getElementById('combo-display');
  if(!el){
    el=document.createElement('div');
    el.id='combo-display';
    el.className='combo-display';
    var card=document.querySelector('.quiz-card');
    if(card)card.appendChild(el);
  }
  return el;
}

function hide(){
  var e=getEl();
  if(e)e.style.display='none';
}

function show(s){
  var e=getEl();
  if(!e)return;
  // 清除旧隐藏定时器
  if(hideTimer){clearTimeout(hideTimer);hideTimer=null}
  // 重置动画：移除再重新添加
  e.style.display='block';
  e.style.animation='none';
  void e.offsetWidth; // force reflow
  e.style.animation='';
  e.textContent='+'+s;
  e.className='combo-display';
  if(s>=200)      e.classList.add('combo-200');
  else if(s>=100) e.classList.add('combo-100');
  else if(s>=50)  e.classList.add('combo-50');
  else            e.classList.add('combo-30');
  // 2 秒后隐藏
  hideTimer=setTimeout(hide, 2000);
}

function update(){
  var s;
  try{s=typeof streak!=='undefined'?streak:0}catch(e){s=0}
  if(typeof s!=='number'||s<30){
    var e=getEl();
    if(e){e.style.display='none';if(hideTimer){clearTimeout(hideTimer);hideTimer=null}}
    return;
  }
  if(s===lastStreak)return;
  lastStreak=s;
  show(s);
}

// 轮询监测 streak 变化
setInterval(update, 200);
setTimeout(update, 500);
})();
