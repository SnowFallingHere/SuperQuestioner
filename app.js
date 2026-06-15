// ====== 题库配置：新增题库只需在此添加一行 ======
const QUIZ_SOURCES = [
  { file: 'Marxism.json', name: '马克思主义基本原理' },
  { file: 'Statistic.json', name: '统计学' },
  // { file: 'math.json', name: '高等数学' },
];

const DIFFICULTIES = ['easy','medium','hard','unknown'];
const DIFF_LABELS = {easy:'易',medium:'中',hard:'难',unknown:'未知'};

// 音效
let AUDIO_ORB, AUDIO_LEVELUP, AUDIO_BREAK;
function initAudio() {
  try {
    AUDIO_ORB = new Audio('orb.ogg');
    AUDIO_LEVELUP = new Audio('levelup.ogg');
    AUDIO_BREAK = new Audio('break.ogg');
    AUDIO_ORB.volume = 0.6;
    AUDIO_LEVELUP.volume = 0.8;
    AUDIO_BREAK.volume = 0.7;
  } catch (e) { /* noop */ }
}
function playOrb() {
  try {
    if (!AUDIO_ORB) initAudio();
    AUDIO_ORB.currentTime = 0;
    AUDIO_ORB.play().catch(() => {});
  } catch (e) {}
}
function playLevelup() {
  try {
    if (!AUDIO_LEVELUP) initAudio();
    AUDIO_LEVELUP.currentTime = 0;
    AUDIO_LEVELUP.play().catch(() => {});
  } catch (e) {}
}
function playBreak() {
  try {
    if (!AUDIO_BREAK) initAudio();
    AUDIO_BREAK.currentTime = 0;
    AUDIO_BREAK.play().catch(() => {});
  } catch (e) {}
}

let ALL_QUESTIONS = [];
let sourceData = {};
let sourceSelection = {}; // {[sourceName]: true/false}

function loadSourceSelection() {
  try {
    const raw = localStorage.getItem('sourceSelection');
    if (raw) sourceSelection = JSON.parse(raw);
  } catch(e) {}
  // 确保所有 source 都有记录
  QUIZ_SOURCES.forEach(s => { if (sourceSelection[s.name] === undefined) sourceSelection[s.name] = true; });
}
loadSourceSelection();

let mode, quizQueue, currentIndex, wrongCount, correctCount, totalAnswered;
let timerInterval, timeLeft, timerPaused;
let perQuestionTimerInterval, perQuestionTimeLeft, perQuestionTimerActive;
let challengeSettings = null; // {wrongLimit, correctTarget, useTimer, timerSeconds, redEffect, combo, shake, showNote}
let infiniteMap;
let infiniteSession; // {key: {is_correct: bool, corrects: int}} —— 本轮已答过的题
let timedQuestions;
let customDifficulty = {};
let wrongList = [];
let wrongBookTemp = {};   // temporary wrong - auto added, cleared on correct
let wrongBookLong = {};   // long-term memory - user added, manual remove only
let wrongBookNotes = {};
let _subjectivePending = true; // segmentit 未加载时过滤主观题
let streak = 0;
let effectsEnabled = null; // null = not asked yet, true/false
let wrongSummaryCollapsed = false;

// ====== 分析数据（章节错题 / 题目迟疑） ======
// 结构: analysis = {
//   byChapter: {[chapter]: {wrong: n, correct: n, total: n}},
//   byQuestion: {[qKey(q)]: {question, chapter, countWrong, countCorrect, hesitation: [secs,...], maxHesitation}},
//   lastUpdated
// }
let quizAnalysis = loadAnalysis();
let questionStartTime = 0;

// ====== Segmentit 中文分词（加载词典约 2~3 秒） ======
let _segmenter = null, _segmenterReady = false;
const STOPWORDS = new Set([
  '的','了','在','是','我','有','和','就','不','人','都','一',
  '上','也','很','到','说','要','去','你','会','着','没有','看',
  '自己','这','他','她','它','们','那','什么','被','把','让','从',
  '又','能','为','而','与','及','但','或','之','对','以','等',
  '中','其','这个','那个','这些','那些','因为','所以','如果','虽然',
  '但是','可以','应该','必须','通过','进行','包括','以及','更','还',
  '才','再','只','却','已','正','将','使','如','向','并','所',
  '给','让','比','同','于','由','按照','根据','经过',
  '当','着','了','过','的','地','得','个','些','第','每','各',
  '例如','比如','像','似','来','去','回','进','出',
  '上','下','里','外','前','后','内','间','旁','边',
  '方面','情况','时候','问题','方式','方法','手段','途径',
  '过程','结果','原因','目的','条件','内容','形式','特征','特点',
  '性质','本质','表现','体现','反映','说明','表明','显示',
  '意义','价值','作用','影响','关系','联系','区别','不同','相同',
  '方面','角度','层面','程度','水平','阶段','环节','步骤',
  '分为','包括','包含','具有','进行','实现','发展','变化','产生',
  '形成','成为','作为','认为','以为','主张','指出','强调','提出',
  '概括','总结','归纳','阐述','论述','叙述','描述',
  '分析','研究','探讨','讨论','解释','论证','证明','验证',
  '回答','解答','解决','处理','应对','面对','针对','基于','鉴于',
  '由于','从而','进而','然后','之后','此前',
  '同时','此外','另外','还有','而且','并且','或者',
  '不仅','不但','除了','除非','无论','不论','尽管',
  '虽然','固然','即使','哪怕','如果','假如',
  '要是','果然','居然','竟然','究竟','到底','毕竟','终究',
  '的确','确实','其实','实际上','事实上',
  '根本上','基本上','总体上','整体上',
  '逐步','逐渐','不断','持续','继续','连续',
]);

function ensureSegmenter() {
  return new Promise(resolve => {
    if (_segmenterReady) return resolve(true);
    if (typeof Segmentit === 'undefined') {
      console.warn('segmentit 未加载');
      return resolve(false);
    }
    try {
      _segmenter = new Segmentit.Segment();
      Segmentit.useDefault(_segmenter);
      _segmenterReady = true;
      resolve(true);
    } catch (e) {
      console.warn('segmentit 初始化失败', e);
      resolve(false);
    }
  });
}

function segmentText(text) {
  if (!_segmenterReady || !_segmenter) {
    return text.split(/[\s,，。；;：:、！!？?（）【】《》""''「」\n\r]+/).filter(w => w.trim());
  }
  try {
    const words = _segmenter.doSegment(text, { simple: true, stripPunctuation: true });
    return words.filter(w => w && w.trim() && !STOPWORDS.has(w));
  } catch (e) {
    return text.split(/[\s,，。；;：:、！!？?（）【】《》""''「」\n\r]+/).filter(w => w.trim());
  }
}

function scoreSubjectiveRef(userAnswer, referenceText) {
  const userWords = new Set(segmentText(userAnswer));
  const refWords = new Set(segmentText(referenceText));
  if (refWords.size === 0) return 0;
  let matched = 0;
  refWords.forEach(w => { if (userWords.has(w)) matched++; });
  return matched / refWords.size;
}

// 异步初始化分词（不阻塞页面渲染）
setTimeout(ensureSegmenter, 100);

// 动态加载 segmentit.js（不阻塞主流程），加载完成后注入主观题
function loadSegmentitAsync() {
  // 显示加载条
  const bar = showSegmentitBar();

  const script = document.createElement('script');
  script.src = 'segmentit.js';
  script.onload = function() {
    ensureSegmenter().then(ready => {
      if (bar) bar.classList.add('done');
      setTimeout(() => { if (bar) bar.remove(); }, 600);
      if (!ready) return;
      _subjectivePending = false;
      // 刷新题目池和界面
      renderSourceSelector();
      updateActiveQuestions();
      showSegmentitToast('主观题已加载完成');
    });
  };
  script.onerror = function() {
    if (bar) { bar.classList.add('done'); setTimeout(() => bar.remove(), 600); }
    console.warn('segmentit.js 加载失败，主观题暂不可用');
    _subjectivePending = false; // 显示主观题但不分词
    renderSourceSelector();
    updateActiveQuestions();
  };
  document.body.appendChild(script);
}

function showSegmentitBar() {
  const el = document.createElement('div');
  el.className = 'segmentit-bar';
  document.body.appendChild(el);
  return el;
}

function showSegmentitToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);color:#999;font-size:12px;z-index:9999;transition:opacity 1s;pointer-events:none;';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 1200); }, 2000);
}

// ====== 引号高亮格式化 ======
// 将题干中的引号内容格式化为引用块（长文本）或内联加粗（短文本）
function formatQuestionQuotes(text) {
  if (!text) return text;
  // 匹配中文引号 "" (\u201C\u201D) 或英文引号 "" (\u0022) 及其内容
  const quotePattern = /([\u201C\u0022])([^\u201C\u201D\u0022]+)([\u201D\u0022])/g;
  let result = text;
  let match;
  const quotes = [];
  while ((match = quotePattern.exec(text)) !== null) {
    quotes.push({ full: match[0], content: match[2], index: match.index, length: match[2].length });
  }
  // 从后往前替换，避免索引偏移
  for (let i = quotes.length - 1; i >= 0; i--) {
    const q = quotes[i];
    const before = result.slice(0, q.index);
    const after = result.slice(q.index + q.full.length);
    // 短引号（少于10个字）内联加粗，长引号用引用块
    if (q.length < 10) {
      result = before + '<span class="quote-inline-short">' + q.content + '</span>' + after;
    } else {
      // 长引号后紧跟的 ，。 吞掉（包括英文标点）
      let afterClean = after;
      if (afterClean.startsWith('，') || afterClean.startsWith('。') || afterClean.startsWith(',') || afterClean.startsWith('.')) {
        afterClean = afterClean.slice(1);
      }
      result = before + '<span class="quote-block"><span class="quote-content">' + q.content + '</span></span>' + afterClean;
    }
  }
  return result;
}

// 将选项中的引号内容格式化为内联高亮
function formatOptionQuotes(text) {
  if (!text) return text;
  return text.replace(/([\u201C\u0022])([^\u201C\u201D\u0022]+)([\u201D\u0022])/g, '<span class="option-quote">$2</span>');
}

function loadAnalysis() {
  try {
    const raw = localStorage.getItem('quizAnalysis');
    if (!raw) return {byChapter:{}, byQuestion:{}, lastUpdated: null};
    const parsed = JSON.parse(raw);
    if (!parsed.byChapter) parsed.byChapter = {};
    if (!parsed.byQuestion) parsed.byQuestion = {};
    return parsed;
  } catch(e) {
    return {byChapter:{}, byQuestion:{}, lastUpdated: null};
  }
}
function saveAnalysis() {
  quizAnalysis.lastUpdated = new Date().toISOString();
  try { localStorage.setItem('quizAnalysis', JSON.stringify(quizAnalysis)); } catch(e) {}
}
function resetAnalysis() {
  quizAnalysis = {byChapter:{}, byQuestion:{}, lastUpdated: null};
  saveAnalysis();
}

// ====== Normalize question: fill missing fields ======
let _qCounter = 0;
function normalize(q, sourceName) {
  q.source = sourceName;
  if (q.sequence == null) q.sequence = ++_qCounter;
  if (!q.chapter) q.chapter = '';
  if (!q.difficulty) q.difficulty = '';
  if (!q.type) {
    if (q.answer === '正确' || q.answer === '错误') {
      q.type = 'true_false';
    } else if (q.answer.length > 1 && /^[A-Z]+$/.test(q.answer)) {
      q.type = 'multiple_choice';
    } else {
      q.type = 'single_choice';
    }
  }
  if (q.type !== 'true_false' && !q.options) {
    q.options = [];
  }
}

// ====== Init ======
async function init() {
  try {
    const results = await Promise.all(
      QUIZ_SOURCES.map(s => fetch(s.file).then(r => r.json()))
    );
    results.forEach((questions, i) => {
      const name = QUIZ_SOURCES[i].name;
      questions.forEach(q => normalize(q, name));
      sourceData[name] = questions;
    });
    const saved = localStorage.getItem('customDifficulty');
    if (saved) { try { customDifficulty = JSON.parse(saved); } catch(e) {} }
    const savedTemp = localStorage.getItem('wrongBookTemp');
    if (savedTemp) { try { wrongBookTemp = JSON.parse(savedTemp); } catch(e) {} }
    const savedLong = localStorage.getItem('wrongBookLong');
    if (savedLong) { try { wrongBookLong = JSON.parse(savedLong); } catch(e) {} }
    const savedNotes = localStorage.getItem('wrongBookNotes');
    if (savedNotes) { try { wrongBookNotes = JSON.parse(savedNotes); } catch(e) {} }
    const savedEffects = localStorage.getItem('effectsEnabled');
    if (savedEffects !== null) effectsEnabled = savedEffects === 'true';
    // Migrate old wrongBook to temp
    const savedOld = localStorage.getItem('wrongBook');
    if (savedOld) {
      try {
        const old = JSON.parse(savedOld);
        Object.assign(wrongBookTemp, old);
        localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
        localStorage.removeItem('wrongBook');
      } catch(e) {}
    }
    renderSourceSelector();
    // 异步加载 segmentit.js，不阻塞页面渲染
    loadSegmentitAsync();
  } catch(e) {
    document.getElementById('source-area').innerHTML =
      '<div class="loading">加载失败：' + e.message + '</div>';
  }
}

function renderSourceSelector() {
  const area = document.getElementById('source-area');
  const tempCount = Object.keys(wrongBookTemp).length;
  const longCount = Object.keys(wrongBookLong).length;
  const totalCount = tempCount + longCount;

  let html = '<div class="source-section"><h3>选择题库</h3><div class="source-chips">';
  QUIZ_SOURCES.forEach((s, i) => {
    const all = sourceData[s.name] || [];
    const count = _subjectivePending ? all.filter(q => q.type !== 'subjective').length : all.length;
    const active = sourceSelection[s.name] !== false ? ' active' : '';
    html += '<div class="source-chip' + active + '" data-idx="'+i+'" data-type="source" onclick="toggleSource(this)">' +
      s.name + '<span class="count">(' + count + '题)</span></div>';
  });
  // Wrong book chip - green, clickable to browse
  html += '<div class="source-chip green' + (totalCount > 0 ? ' active' : '') + '" data-type="wrongbook" onclick="openWrongBook()">' +
    '错题本<span class="count">(' + totalCount + '题)</span>' +
    '<span class="count-detail">暂' + tempCount + '/长' + longCount + '</span></div>';
  html += '</div></div>';
  area.innerHTML = html;
  refreshWrongBookHome();
  document.getElementById('mode-area').classList.remove('hidden');
  updateActiveQuestions();
}

function toggleSource(el) {
  el.classList.toggle('active');
  const idx = el.dataset.idx;
  if (idx !== undefined) {
    const name = QUIZ_SOURCES[parseInt(idx)].name;
    sourceSelection[name] = el.classList.contains('active');
    localStorage.setItem('sourceSelection', JSON.stringify(sourceSelection));
  }
  updateActiveQuestions();
}

function updateActiveQuestions() {
  ALL_QUESTIONS = [];
  document.querySelectorAll('.source-chip.active').forEach(chip => {
    if (chip.dataset.type === 'wrongbook') return; // skip wrongbook chip
    const idx = parseInt(chip.dataset.idx);
    const name = QUIZ_SOURCES[idx].name;
    let qs = sourceData[name] || [];
    if (_subjectivePending) qs = qs.filter(q => q.type !== 'subjective');
    ALL_QUESTIONS = ALL_QUESTIONS.concat(qs);
  });
  const modeArea = document.getElementById('mode-area');
  if (ALL_QUESTIONS.length === 0) {
    modeArea.classList.add('hidden');
  } else {
    modeArea.classList.remove('hidden');
  }
  // Update wrong book card
  const totalCount = Object.keys(wrongBookTemp).length + Object.keys(wrongBookLong).length;
  const card = document.getElementById('card-wrongbook');
  if (totalCount === 0) {
    card.classList.add('disabled');
    card.querySelector('p').textContent = '错题本为空';
  } else {
    card.classList.remove('disabled');
    updateWrongBookCardText();
  }
}

function updateWrongBookCardText() {
  const includeLong = document.getElementById('wb-include-long').checked;
  const tempCount = Object.keys(wrongBookTemp).length;
  const longCount = Object.keys(wrongBookLong).length;
  const count = includeLong ? tempCount + longCount : tempCount;
  const card = document.getElementById('card-wrongbook');
  if (card.querySelector('p')) {
    card.querySelector('p').textContent = includeLong
      ? '错题本共 ' + (tempCount + longCount) + ' 道题（暂' + tempCount + ' + 长' + longCount + '）'
      : '暂时错题共 ' + tempCount + ' 道题';
  }
}

// ====== Page Navigation ======
const PAGES = ['page-home','page-config','page-challenge-config','page-quiz','page-result','page-wrong-review','page-wrongbook','page-preview-config','page-preview'];
function show(id) {
  PAGES.forEach(p => {
    document.getElementById(p).classList.toggle('hidden', p !== id);
  });
}
function showHome() {
  clearInterval(timerInterval);
  show('page-home');
  renderSourceSelector();
}

// ====== Shuffle ======
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function qKey(q) {
  return q.source + '::' + q.sequence;
}

function getDifficulty(q) {
  const key = qKey(q);
  return customDifficulty[key] || q.difficulty || '';
}

function qObj(q) {
  return { question: q.question, answer: q.answer, type: q.type, options: q.options, chapter: q.chapter, source: q.source, sequence: q.sequence };
}

// ====== Challenge Mode ======
function getActiveQuestions() {
  return ALL_QUESTIONS.filter(q => sourceSelection[q.source] !== false);
}

function startChallenge() {
  if (ALL_QUESTIONS.length === 0) return;
  // 读取中转页面的配置（如果没有打开过中转页面，使用默认值）
  const wrongLimitEl = document.getElementById('challenge-wrong-limit');
  const correctTargetEl = document.getElementById('challenge-correct-target');
  const useTimerEl = document.getElementById('challenge-use-timer');
  const timerSecondsEl = document.getElementById('challenge-timer-seconds');
  const redEffectEl = document.getElementById('challenge-red-effect');
  const comboEl = document.getElementById('challenge-combo');
  const shakeEl = document.getElementById('challenge-shake');
  const showNoteEl = document.getElementById('challenge-show-note');

  let wrongLimit = 50, correctTarget = 160, useTimer = true, timerSeconds = 30;
  let redEffect = true, combo = true, shake = false, showNote = false;
  if (wrongLimitEl) {
    wrongLimit = parseInt(wrongLimitEl.value, 10) || 50;
    correctTarget = parseInt(correctTargetEl.value, 10) || 160;
    useTimer = useTimerEl.checked;
    timerSeconds = parseInt(timerSecondsEl.value, 10) || 30;
    redEffect = redEffectEl.checked;
    combo = comboEl.checked;
    shake = shakeEl.checked;
    showNote = showNoteEl.checked;
  }
  if (wrongLimit < 1) wrongLimit = 1;
  if (correctTarget < 1) correctTarget = 1;
  if (timerSeconds < 5) timerSeconds = 5;
  challengeSettings = { wrongLimit, correctTarget, useTimer, timerSeconds, redEffect, combo, shake, showNote };
  effectsEnabled = combo;
  localStorage.setItem('effectsEnabled', String(effectsEnabled));
  saveChallengePrefs();
  console.log('[startChallenge] settings=', challengeSettings);

  mode = 'challenge';
  wrongCount = 0; correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  quizQueue = shuffle(getActiveQuestions());
  currentIndex = 0;
  show('page-quiz');
  document.getElementById('gear-btn').classList.add('hidden');
  renderQuestion();
}

function showChallengeConfig() {
  // 恢复保存过的偏好
  const savedPrefs = localStorage.getItem('challengePrefs');
  if (savedPrefs) {
    try {
      const p = JSON.parse(savedPrefs);
      const we = document.getElementById('challenge-wrong-limit');
      const ce = document.getElementById('challenge-correct-target');
      const ute = document.getElementById('challenge-use-timer');
      const tse = document.getElementById('challenge-timer-seconds');
      const re = document.getElementById('challenge-red-effect');
      const coe = document.getElementById('challenge-combo');
      const se = document.getElementById('challenge-shake');
      const sne = document.getElementById('challenge-show-note');
      if (we) we.value = p.wrongLimit ?? 50;
      if (ce) ce.value = p.correctTarget ?? 160;
      if (ute) ute.checked = p.useTimer !== false;
      if (tse) tse.value = p.timerSeconds ?? 30;
      if (re) re.checked = p.redEffect !== false;
      if (coe) coe.checked = p.combo !== false;
      if (se) se.checked = p.shake === true;
      if (sne) sne.checked = p.showNote === true;
      onChallengeTimerToggle();
    } catch(e) {}
  }
  show('page-challenge-config');
}

function onChallengeTimerToggle() {
  const useTimer = document.getElementById('challenge-use-timer');
  const secondsInput = document.getElementById('challenge-timer-seconds');
  if (useTimer && secondsInput) {
    secondsInput.style.opacity = useTimer.checked ? '1' : '0.4';
    secondsInput.disabled = !useTimer.checked;
  }
}

function saveChallengePrefs() {
  const we = document.getElementById('challenge-wrong-limit');
  if (!we) return;
  const p = {
    wrongLimit: parseInt(we.value, 10) || 50,
    correctTarget: parseInt(document.getElementById('challenge-correct-target').value, 10) || 160,
    useTimer: document.getElementById('challenge-use-timer').checked,
    timerSeconds: parseInt(document.getElementById('challenge-timer-seconds').value, 10) || 30,
    redEffect: document.getElementById('challenge-red-effect').checked,
    combo: document.getElementById('challenge-combo').checked,
    shake: document.getElementById('challenge-shake').checked,
    showNote: document.getElementById('challenge-show-note').checked,
  };
  localStorage.setItem('challengePrefs', JSON.stringify(p));
}

// 每题倒计时
function startPerQuestionTimer() {
  console.log('[startPerQuestionTimer] ENTERED');
  clearPerQuestionTimer();
  if (!challengeSettings || !challengeSettings.useTimer) {
    console.log('[startPerQuestionTimer] skip: settings=', challengeSettings);
    return;
  }
  perQuestionTimeLeft = challengeSettings.timerSeconds;
  perQuestionTimerActive = true;
  const el = document.getElementById('quiz-timer');
  if (!el) { console.warn('[startPerQuestionTimer] #quiz-timer not found'); return; }
  // 不依赖 hidden class，直接用内联样式确保显示（优先级最高）
  el.classList.remove('hidden');
  el.setAttribute('style', 'display: inline-block !important; visibility: visible;');
  // 回退：某些浏览器不认内联 !important，再加一层保障
  if (getComputedStyle(el).display === 'none') {
    el.style.cssText = 'display: inline-block; visibility: visible;';
  }
  console.log('[startPerQuestionTimer] started, seconds=', perQuestionTimeLeft, ' current display=', getComputedStyle(el).display);
  // 立即渲染一次（避免 setInterval 的 1s 空窗期导致"一秒后才出现"）
  updatePerQuestionTimerDisplay();
  perQuestionTimerInterval = setInterval(() => {
    if (timerPaused) return;
    perQuestionTimeLeft--;
    updatePerQuestionTimerDisplay();
    if (perQuestionTimeLeft <= 0) {
      clearPerQuestionTimer();
      perQuestionTimerActive = false;
      registerPerQuestionTimeout();
    }
  }, 1000);
}

function updatePerQuestionTimerDisplay() {
  const el = document.getElementById('quiz-timer');
  if (!el) return;
  const s = perQuestionTimeLeft;
  el.textContent = '⏱ ' + (s < 0 ? 0 : s) + 's';
  // 倒计时特效（遮罩层方式：剩余 ≤5 秒时开启
  const overlay = document.getElementById('timer-red-overlay');
  const useRed = challengeSettings && challengeSettings.redEffect;
  const useShake = challengeSettings && challengeSettings.shake;
  if (overlay && useRed && s <= 5 && s > 0) {
    overlay.classList.add('active');
  } else if (overlay) {
    overlay.classList.remove('active');
  }
  const oa = document.getElementById('options-area');
  if (oa && useShake && s <= 5 && s > 0) {
    oa.classList.add('shake-options');
  } else if (oa) {
    oa.classList.remove('shake-options');
  }
}

function clearPerQuestionTimer() {
  if (perQuestionTimerInterval) clearInterval(perQuestionTimerInterval);
  perQuestionTimerInterval = null;
  perQuestionTimerActive = false;
  const overlay = document.getElementById('timer-red-overlay');
  if (overlay) overlay.classList.remove('active');
  const oa = document.getElementById('options-area');
  if (oa) oa.classList.remove('shake-options');
  const el = document.getElementById('quiz-timer');
  if (el) {
    el.classList.add('hidden');
    // 重置内联样式，避免 "inline-block" 残留与 hidden 冲突
    el.style.display = '';
    el.style.visibility = '';
    console.log('[clearPerQuestionTimer] hidden added');
  }
}

function registerPerQuestionTimeout() {
  // 时间到自动判错
  if (answered) return;
  const q = quizQueue[currentIndex];
  if (!q) return;
  answered = true;
  wrongCount++;
  totalAnswered++;
  streak = 0;
  wrongList.push({question: q, selectedAnswer: '时间到'});
  // 显示 feedback
  const fb = document.getElementById('answer-feedback');
  if (fb) {
    const correctText = formatAnswer(q);
    fb.innerHTML = '<div class="feedback wrong">时间到！正确答案：' + correctText + '</div>';
  }
  autoNextTimeout = setTimeout(() => {
    currentIndex++;
    renderQuestion();
  }, 1200);
}

// ====== Infinite Mode ======
// freshStart=true -> 清除缓存，从全题库重新开始
// freshStart=false/undefined -> 沿用之前进度
function startInfinite(freshStart) {
  if (ALL_QUESTIONS.length === 0) return;
  mode = 'infinite';
  correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  infiniteMap = {};
  infiniteSession = {};
  if (freshStart) {
    localStorage.removeItem('infiniteProgress');
    localStorage.removeItem('infiniteStats');
    localStorage.removeItem('infiniteSession');
    getActiveQuestions().forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
  } else {
    const savedProgress = localStorage.getItem('infiniteProgress');
    const savedStats = localStorage.getItem('infiniteStats');
    const savedSession = localStorage.getItem('infiniteSession');
    let loadedStats = null, loadedSession = null;
    if (savedStats) { try { loadedStats = JSON.parse(savedStats); } catch(e) { loadedStats = null; } }
    if (savedSession) { try { loadedSession = JSON.parse(savedSession); } catch(e) { loadedSession = null; } }
    if (savedProgress) {
      try {
        const parsed = JSON.parse(savedProgress);
        ALL_QUESTIONS.forEach(q => {
          const k = qKey(q);
          infiniteMap[k] = parsed[k] ? parsed[k] : {correctCount: 0};
        });
      } catch(e) {
        getActiveQuestions().forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
      }
    } else {
      getActiveQuestions().forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
    }
    if (loadedStats && typeof loadedStats === 'object') {
      if (typeof loadedStats.totalAnswered === 'number' && isFinite(loadedStats.totalAnswered)) {
        totalAnswered = loadedStats.totalAnswered;
      }
      if (typeof loadedStats.correctCount === 'number' && isFinite(loadedStats.correctCount)) {
        correctCount = loadedStats.correctCount;
      }
    }
    if (loadedSession && typeof loadedSession === 'object') {
      infiniteSession = loadedSession;
    }
    console.log('[startInfinite] 恢复进度：', {
      savedProgress: !!savedProgress,
      savedStatsRaw: savedStats,
      savedSessionRaw: savedSession,
      totalAnswered,
      correctCount,
      mastered: Object.values(infiniteMap).filter(v => v && v.correctCount >= 3).length,
    });
  }
  quizQueue = shuffle(ALL_QUESTIONS);
  currentIndex = 0;
  show('page-quiz');
  document.getElementById('gear-btn').classList.remove('hidden');
  renderQuestion();
}

function saveInfiniteProgress() {
  if (mode === 'infinite' && infiniteMap) {
    localStorage.setItem('infiniteProgress', JSON.stringify(infiniteMap));
    localStorage.setItem('infiniteStats', JSON.stringify({
      totalAnswered: typeof totalAnswered === 'number' ? totalAnswered : 0,
      correctCount: typeof correctCount === 'number' ? correctCount : 0,
    }));
    if (infiniteSession) localStorage.setItem('infiniteSession', JSON.stringify(infiniteSession));
  }
}

function infiniteNextIndex() {
  for (let i = currentIndex; i < quizQueue.length; i++) {
    if (infiniteMap[qKey(quizQueue[i])].correctCount < 3) return i;
  }
  const remaining = quizQueue.filter(q => infiniteMap[qKey(q)].correctCount < 3);
  if (remaining.length === 0) return -1;
  quizQueue = quizQueue.concat(shuffle(remaining));
  return currentIndex;
}

// ====== Wrong Book Mode ======
function startWrongBook() {
  const includeLong = document.getElementById('wb-include-long').checked;
  const tempQ = Object.values(wrongBookTemp);
  const longQ = includeLong ? Object.values(wrongBookLong) : [];
  const all = tempQ.concat(longQ);
  if (all.length === 0) return;
  mode = 'wrongbook';
  wrongCount = 0; correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  quizQueue = shuffle(all);
  currentIndex = 0;
  show('page-quiz');
  document.getElementById('gear-btn').classList.add('hidden');
  renderQuestion();
}

// ====== Timed Mode ======
function showTimedConfig() {
  if (ALL_QUESTIONS.length === 0) return;
  show('page-config');
  const chapterSection = document.getElementById('config-chapter-section');
  const sources = Object.keys(sourceData).filter(src => sourceSelection[src] !== false);
  if (sources.length > 0) {
    chapterSection.classList.remove('hidden');
    let html = '';
    sources.forEach(src => {
      const srcQuestions = sourceData[src] || [];
      const srcChapters = [...new Set(srcQuestions.map(q => q.chapter).filter(Boolean))];
      if (srcChapters.length === 0) return;
      html += '<div class="source-group">';
      html += '<div class="source-label">' + escHtml(src) + '</div>';
      html += '<span class="source-select-all" onclick="selectAllChapters(\'' + escHtml(src) + '\')">全选</span>';
      html += '<div class="chip-group">';
      srcChapters.forEach(ch => {
        html += '<div class="chip" data-val="'+ch+'" onclick="toggleChip(this)">'+escHtml(ch)+'</div>';
      });
      html += '</div></div>';
    });
    document.getElementById('chapter-chips').innerHTML = html;
  } else {
    chapterSection.classList.add('hidden');
  }
  const difficulties = [...new Set(ALL_QUESTIONS.map(q => getDifficulty(q)).filter(Boolean))];
  const diffSection = document.getElementById('config-difficulty-section');
  if (difficulties.length > 0) {
    diffSection.classList.remove('hidden');
    document.getElementById('difficulty-chips').innerHTML =
      difficulties.map(d => '<div class="chip" data-val="'+d+'" onclick="toggleChip(this)">'+(DIFF_LABELS[d]||d)+'</div>').join('');
  } else {
    diffSection.classList.add('hidden');
  }
  const allTypes = [...new Set(ALL_QUESTIONS.map(q => q.type).filter(Boolean))];
  const typeSection = document.getElementById('config-type-section');
  if (allTypes.length > 0) {
    typeSection.classList.remove('hidden');
    const typeLabels = {single_choice:'单选', multiple_choice:'多选', true_false:'判断', calculation:'计算', subjective:'主观'};
    document.getElementById('type-chips').innerHTML =
      allTypes.map(t => '<div class="chip" data-val="'+t+'" onclick="toggleChip(this)">'+(typeLabels[t]||t)+'</div>').join('');
  } else {
    typeSection.classList.add('hidden');
  }
  updateTypeChips();
  checkTimedReady();
}

function toggleChip(el) {
  el.classList.toggle('active');
  // 章节切换时联动更新题型筛选
  if (el.closest('#chapter-chips')) { updateTypeChips(); updateSelectAllLabels('#chapter-chips'); }
  checkTimedReady();
}

function updateSelectAllLabels(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.querySelectorAll('.source-group').forEach(group => {
    const label = group.querySelector('.source-select-all');
    if (!label) return;
    const chips = group.querySelectorAll('.chip');
    const allActive = [...chips].every(c => c.classList.contains('active'));
    label.textContent = allActive ? '全不选' : '全选';
  });
}

function selectAllChapters(src) {
  const chips = document.querySelectorAll('#chapter-chips .chip');
  const srcQuestions = sourceData[src] || [];
  const srcChapters = new Set(srcQuestions.map(q => q.chapter).filter(Boolean));
  const srcChips = [...chips].filter(c => srcChapters.has(c.dataset.val));
  const allActive = srcChips.every(c => c.classList.contains('active'));
  srcChips.forEach(c => {
    if (allActive) c.classList.remove('active');
    else c.classList.add('active');
  });
  // 更新按钮文字
  const label = document.querySelector('#chapter-chips .source-group .source-select-all[onclick*="' + src + '"]');
  if (label) label.textContent = allActive ? '全选' : '全不选';
  updateTypeChips();
  checkTimedReady();
}

function updateTypeChips() {
  const chSelected = [...document.querySelectorAll('#chapter-chips .chip.active')].map(e => e.dataset.val);
  const typeChips = document.querySelectorAll('#type-chips .chip');
  if (chSelected.length === 0) {
    // 未选章节时显示全部题型
    typeChips.forEach(c => c.style.display = '');
    return;
  }
  // 收集选中章节内出现的题型
  const validTypes = new Set();
  chSelected.forEach(ch => {
    ALL_QUESTIONS.filter(q => q.chapter === ch).forEach(q => {
      if (q.type) validTypes.add(q.type);
    });
  });
  typeChips.forEach(c => {
    if (validTypes.has(c.dataset.val)) {
      c.style.display = '';
    } else {
      c.style.display = 'none';
      c.classList.remove('active');
    }
  });
}

function checkTimedReady() {
  const ch = document.querySelectorAll('#chapter-chips .chip.active');
  const hasChapters = !document.getElementById('config-chapter-section').classList.contains('hidden');
  const hint = document.getElementById('chapter-hint');
  const hasSelection = hasChapters && ch.length > 0;
  document.getElementById('btn-start-timed').disabled = !hasSelection;
  if (hint) hint.style.display = hasSelection ? 'none' : '';
  // 联动锁定难度和题型区
  ['config-difficulty-section', 'config-type-section'].forEach(id => {
    const section = document.getElementById(id);
    if (section) {
      section.classList.toggle('config-section-locked', !hasSelection);
    }
  });
}

function startTimed() {
  const chSelected = [...document.querySelectorAll('#chapter-chips .chip.active')].map(e => e.dataset.val);
  const dfSelected = [...document.querySelectorAll('#difficulty-chips .chip.active')].map(e => e.dataset.val);
  const tpSelected = [...document.querySelectorAll('#type-chips .chip.active')].map(e => e.dataset.val);
  let pool = ALL_QUESTIONS.filter(q => sourceSelection[q.source] !== false);
  if (chSelected.length > 0) pool = pool.filter(q => chSelected.includes(q.chapter));
  if (dfSelected.length > 0) pool = pool.filter(q => dfSelected.includes(getDifficulty(q)));
  if (tpSelected.length > 0) pool = pool.filter(q => tpSelected.includes(q.type));
  if (pool.length === 0) { alert('没有符合条件的题目'); return; }
  const minutesInput = document.getElementById('timed-minutes');
  let minutes = parseInt(minutesInput && minutesInput.value, 10);
  if (!minutes || minutes < 1) minutes = 10;
  mode = 'timed';
  timedQuestions = shuffle(pool).slice(0, 50);
  quizQueue = timedQuestions;
  currentIndex = 0;
  wrongCount = 0; correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  timeLeft = minutes * 60; timerPaused = false;
  show('page-quiz');
  document.getElementById('gear-btn').classList.add('hidden');
  startTimer();
  renderQuestion();
}

function startTimer() {
  const el = document.getElementById('quiz-timer');
  el.classList.remove('hidden');
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (!timerPaused) {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) { clearInterval(timerInterval); showResult(); }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  document.getElementById('quiz-timer').textContent = m + ':' + String(s).padStart(2, '0');
}

// ====== Settings Panel ======
function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    const q = quizQueue[currentIndex];
    const currentDiff = getDifficulty(q);
    document.getElementById('settings-difficulty-chips').innerHTML = DIFFICULTIES.map(d =>
      '<div class="chip' + (d === currentDiff ? ' active' : '') + '" data-val="'+d+'" onclick="setCustomDifficulty(this,\''+d+'\')">'+DIFF_LABELS[d]+'</div>'
    ).join('');
  }
}

function setCustomDifficulty(el, diff) {
  const q = quizQueue[currentIndex];
  const key = qKey(q);
  if (customDifficulty[key] === diff) {
    delete customDifficulty[key];
    el.classList.remove('active');
  } else {
    customDifficulty[key] = diff;
    document.querySelectorAll('#settings-difficulty-chips .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  }
  localStorage.setItem('customDifficulty', JSON.stringify(customDifficulty));
  renderQuestion();
}

// ====== Note & Category Panel ======
function saveNote() {
  const q = quizQueue[currentIndex];
  if (!q) return;
  const key = qKey(q);
  const val = document.getElementById('note-input').value.trim();
  if (val) {
    wrongBookNotes[key] = val;
    // 写了备注就自动入长期记忆
    delete wrongBookTemp[key];
    if (!wrongBookLong[key]) {
      // 简化：把题目存进去
      wrongBookLong[key] = q;
    }
    localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
    localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  } else {
    delete wrongBookNotes[key];
  }
  localStorage.setItem('wrongBookNotes', JSON.stringify(wrongBookNotes));
}

function renderNotePanel(q) {
  const key = qKey(q);
  const inTemp = !!wrongBookTemp[key];
  const inLong = !!wrongBookLong[key];

  // Category chips
  const catEl = document.getElementById('note-category');
  if (catEl) {
    catEl.innerHTML =
      '<span class="cat-label">分类：</span>' +
      '<span class="cat-chip' + (inTemp ? ' active' : '') + '" onclick="setWrongCategory(\'temp\')">暂时错题</span>' +
      '<span class="cat-chip' + (inLong ? ' active-long' : '') + '" onclick="setWrongCategory(\'long\')">长期记忆</span>';
  }

  // Note
  const noteInput = document.getElementById('note-input');
  if (noteInput) noteInput.value = wrongBookNotes[key] || '';

  // Auto-show if in any book or has note
  const panel = document.getElementById('note-panel');
  if (panel) {
    if (inTemp || inLong || wrongBookNotes[key]) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  }
}

function setWrongCategory(cat) {
  const q = quizQueue[currentIndex];
  const key = qKey(q);
  if (cat === 'temp') {
    if (wrongBookTemp[key]) {
      delete wrongBookTemp[key];
    } else {
      wrongBookTemp[key] = qObj(q);
      delete wrongBookLong[key]; // can't be in both
    }
  } else if (cat === 'long') {
    if (wrongBookLong[key]) {
      delete wrongBookLong[key];
    } else {
      wrongBookLong[key] = qObj(q);
      delete wrongBookTemp[key]; // can't be in both
    }
  }
  localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
  localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  renderNotePanel(q);
}

function exportProgress() {
  const data = {
    infiniteMap: infiniteMap || {},
    infiniteStats: {totalAnswered: totalAnswered || 0, correctCount: correctCount || 0},
    infiniteSession: infiniteSession || {},
    customDifficulty: customDifficulty,
    wrongBookTemp: wrongBookTemp,
    wrongBookLong: wrongBookLong,
    wrongBookNotes: wrongBookNotes,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'quiz_progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.infiniteMap) { infiniteMap = data.infiniteMap; localStorage.setItem('infiniteProgress', JSON.stringify(infiniteMap)); }
      if (data.infiniteStats) {
        if (typeof data.infiniteStats.totalAnswered === 'number') totalAnswered = data.infiniteStats.totalAnswered;
        if (typeof data.infiniteStats.correctCount === 'number') correctCount = data.infiniteStats.correctCount;
        localStorage.setItem('infiniteStats', JSON.stringify(data.infiniteStats));
      }
      if (data.infiniteSession) {
        infiniteSession = data.infiniteSession;
        localStorage.setItem('infiniteSession', JSON.stringify(infiniteSession));
      }
      if (data.customDifficulty) { customDifficulty = data.customDifficulty; localStorage.setItem('customDifficulty', JSON.stringify(customDifficulty)); }
      if (data.wrongBookTemp) { wrongBookTemp = data.wrongBookTemp; localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp)); }
      if (data.wrongBookLong) { wrongBookLong = data.wrongBookLong; localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong)); }
      if (data.wrongBookNotes) { wrongBookNotes = data.wrongBookNotes; localStorage.setItem('wrongBookNotes', JSON.stringify(wrongBookNotes)); }
      // Migrate old wrongBook
      if (data.wrongBook && !data.wrongBookTemp) {
        wrongBookTemp = data.wrongBook;
        localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
      }
      alert('导入成功');
      toggleSettings();
      if (mode === 'infinite') renderQuestion();
    } catch(err) {
      alert('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetProgress() {
  if (!confirm('确定要重置所有进度吗？')) return;
  infiniteMap = {};
  ALL_QUESTIONS.forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
  customDifficulty = {};
  wrongBookTemp = {};
  wrongBookLong = {};
  wrongBookNotes = {};
  localStorage.removeItem('infiniteProgress');
  localStorage.removeItem('infiniteStats');
  localStorage.removeItem('infiniteSession');
  localStorage.removeItem('customDifficulty');
  localStorage.removeItem('wrongBookTemp');
  localStorage.removeItem('wrongBookLong');
  localStorage.removeItem('wrongBookNotes');
  toggleSettings();
  if (mode === 'infinite') {
    quizQueue = shuffle(ALL_QUESTIONS);
    currentIndex = 0;
    renderQuestion();
  }
}

// ====== Streak Effects ======
function handleStreak() {
  if (effectsEnabled === false) return;
  if (streak >= 3) {
    // First time: ask user
    if (effectsEnabled === null) {
      effectsEnabled = true; // assume yes for now
      localStorage.setItem('effectsEnabled', 'true');
      showEffectsPrompt();
    }
    if (effectsEnabled) {
      // Green glow
      const card = document.querySelector('.quiz-card');
      card.classList.remove('streak-glow');
      void card.offsetWidth; // force reflow
      card.classList.add('streak-glow');
      setTimeout(() => card.classList.remove('streak-glow'), 700);
    }
  }
  if (streak >= 10 && streak % 10 === 0 && effectsEnabled) {
    triggerPerfect();
  }
}

function showEffectsPrompt() {
  const div = document.createElement('div');
  div.className = 'effects-prompt';
  div.innerHTML = '<p>连续答对3题！是否显示连击特效？</p>' +
    '<div class="btn-row">' +
    '<button class="btn btn-primary" onclick="enableEffects(true,this)">显示</button>' +
    '<button class="btn btn-secondary" onclick="enableEffects(false,this)">关闭</button>' +
    '</div>';
  document.body.appendChild(div);
}

function enableEffects(val, btn) {
  effectsEnabled = val;
  localStorage.setItem('effectsEnabled', String(val));
  const prompt = btn.closest('.effects-prompt');
  if (prompt) prompt.remove();
}

function triggerPerfect() {
  // Add Perfect text
  const p = document.createElement('div');
  p.className = 'perfect-text';
  p.textContent = 'Perfect!';
  document.body.appendChild(p);

  // Make all components fall
  const components = document.querySelectorAll('.quiz-header, .quiz-card, #quiz-btns, .answer-feedback.show');
  components.forEach((el, i) => {
    el.style.transition = 'none';
    el.classList.add('falling');
    el.style.animationDelay = (i * 0.08) + 's';
  });

  // Clean up after animation
  setTimeout(() => {
    p.remove();
    components.forEach(el => {
      el.classList.remove('falling');
      el.style.transition = '';
      el.style.animationDelay = '';
    });
  }, 1600);
}

// ====== Render Question ======
let answered = false;
let autoNextTimeout;

function renderQuestion() {
  answered = false;
  clearTimeout(autoNextTimeout);
  questionStartTime = Date.now();
  // 重置答题后的只读备注显示
  const noteEl = document.getElementById('readonly-note');
  if (noteEl) noteEl.classList.add('hidden');

  console.log('[renderQuestion] mode=', mode, 'challengeSettings=', challengeSettings);

  // 闯关模式：检查胜利/失败
  if (mode === 'challenge' && challengeSettings) {
    if (wrongCount >= challengeSettings.wrongLimit) { showResult(); return; }
    if (correctCount >= challengeSettings.correctTarget && wrongCount < challengeSettings.wrongLimit) { showResult(); return; }
  }
  if (mode === 'challenge' && !challengeSettings) {
    // 兜底：默认 100
    if (wrongCount >= 100) { showResult(); return; }
  }
  if (mode === 'infinite') {
    currentIndex = infiniteNextIndex();
    if (currentIndex === -1) { showResult(); return; }
  }
  if (mode === 'timed' && currentIndex >= quizQueue.length) { showResult(); return; }
  if (mode === 'wrongbook' && currentIndex >= quizQueue.length) { showResult(); return; }
  if (currentIndex >= quizQueue.length) {
    quizQueue = quizQueue.concat(shuffle(ALL_QUESTIONS));
  }

  const q = quizQueue[currentIndex];

  // === 闯关模式：启动每题倒计时（必须放在所有题型分支之前，避免 calculation/subjective return 时漏掉）===
  if (mode === 'challenge') {
    // 清掉旧状态（确保 quiz-timer 能被看见）
    const oldTimer = document.getElementById('quiz-timer');
    if (oldTimer) {
      oldTimer.textContent = '';
      oldTimer.classList.remove('hidden');
    }
    startPerQuestionTimer();
  }

  let info = '';
  if (mode === 'challenge') info = '闯关 | 对' + correctCount + ' 错' + wrongCount;
  else if (mode === 'infinite') {
    const mastered = getActiveQuestions().filter(x => infiniteMap[qKey(x)].correctCount >= 3).length;
    info = '无限 | 已掌握 ' + mastered + '/' + getActiveQuestions().length + ' | 已答题 ' + totalAnswered + '/∞';
  }
  else if (mode === 'timed') info = '限时 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  else if (mode === 'wrongbook') info = '错题本 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  document.getElementById('quiz-info').textContent = info;

  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断',calculation:'计算',subjective:'主观'}[q.type] || '';
  const diff = getDifficulty(q);
  let metaParts = [];
  if (q.chapter) metaParts.push(q.chapter);
  if (typeLabel) metaParts.push(typeLabel);
  if (diff && DIFF_LABELS[diff]) metaParts.push(DIFF_LABELS[diff]);
  if (Object.keys(sourceData).length > 1) metaParts.push(q.source);
  // Show wrong book category
  const key = qKey(q);
  if (wrongBookTemp[key]) metaParts.push('暂时错题');
  if (wrongBookLong[key]) metaParts.push('长期记忆');
  document.getElementById('question-meta').textContent = metaParts.join(' · ');

  document.getElementById('question-text').innerHTML = formatQuestionQuotes(q.question);

  const area = document.getElementById('options-area');
  area.innerHTML = '';

  if (q.type === 'calculation') {
    renderCalculation(q, area);
    return;
  }
  if (q.type === 'subjective') {
    renderSubjective(q, area);
    return;
  }

  if (q.type === 'true_false') {
    area.innerHTML = '<div class="tf-buttons">' +
      '<div class="tf-btn" onclick="answerTF(true)">正确</div>' +
      '<div class="tf-btn" onclick="answerTF(false)">错误</div></div>';
  } else {
    const isMulti = q.type === 'multiple_choice';
    const origOptions = q.options || [];
    const indices = origOptions.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const shuffled = indices.map(i => origOptions[i]);
    const labelMap = {};
    shuffled.forEach((opt, i) => {
      const newLabel = String.fromCharCode(65 + i);
      labelMap[opt.label || ''] = newLabel;
    });
    const mappedAnswer = isMulti
      ? (q.answer || '').split('').map(l => labelMap[l] || '').sort().join('')
      : (labelMap[q.answer] || q.answer);

    let html = '<div class="options">';
    shuffled.forEach((opt, i) => {
      const newLabel = String.fromCharCode(65 + i);
      const text = formatOptionQuotes(opt.text || '');
      html += '<div class="option" data-label="'+newLabel+'" onclick="clickOption(this,'+isMulti+')">' +
        newLabel + '. ' + text + '</div>';
    });
    html += '</div>';
    if (isMulti) {
      html += '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="btn-confirm-multi" onclick="confirmMulti()">确认</button></div>';
    }
    area.innerHTML = html;

    const fb = document.getElementById('answer-feedback');
    fb.className = 'answer-feedback';
    fb.textContent = '';
    fb.dataset.mappedAnswer = mappedAnswer;
    return;
  }

  const fb = document.getElementById('answer-feedback');
  fb.className = 'answer-feedback';
  fb.textContent = '';

  // Note panel
  renderNotePanel(q);

  // （闯关模式的倒计时已在 renderQuestion 最前面启动）
}

function clickOption(el, isMulti) {
  if (answered) return;
  if (!isMulti) {
    const q = quizQueue[currentIndex];
    const selected = el.dataset.label;
    const fb = document.getElementById('answer-feedback');
    const mappedAnswer = fb.dataset.mappedAnswer || q.answer;
    judge(selected === mappedAnswer, mappedAnswer, selected);
  } else {
    el.classList.toggle('selected');
  }
}

function confirmMulti() {
  if (answered) return;
  const q = quizQueue[currentIndex];
  const selected = [...document.querySelectorAll('.option.selected')].map(e => e.dataset.label).sort().join('');
  const fb = document.getElementById('answer-feedback');
  const mappedAnswer = (fb.dataset.mappedAnswer || q.answer).split('').sort().join('');
  judge(selected === mappedAnswer, mappedAnswer, selected);
}

function answerTF(val) {
  if (answered) return;
  const q = quizQueue[currentIndex];
  const selected = val ? '正确' : '错误';
  judge(selected === q.answer, q.answer, selected);
}

function judge(isCorrect, correctAnswer, selectedAnswer) {
  answered = true;
  const q = quizQueue[currentIndex];

  // 停止每题倒计时（闯关模式）
  if (mode === 'challenge') {
    clearPerQuestionTimer();
    console.log('[judge] cleared per-question timer; will render next question in 1500ms');
  }

  if (mode === 'timed') timerPaused = true;

  if (q.type === 'true_false') {
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.classList.add('disabled');
      const btnVal = btn.textContent === '正确' ? '正确' : '错误';
      if (btnVal === correctAnswer) btn.classList.add('correct');
      else if (btnVal === selectedAnswer && !isCorrect) btn.classList.add('wrong');
    });
  } else {
    document.querySelectorAll('.option').forEach(opt => {
      opt.classList.add('disabled');
      const label = opt.dataset.label;
      if (q.type === 'multiple_choice') {
        const correctLabels = correctAnswer.split('');
        const selectedLabels = selectedAnswer.split('');
        if (correctLabels.includes(label)) opt.classList.add('correct');
        if (selectedLabels.includes(label) && !correctLabels.includes(label)) opt.classList.add('wrong');
      } else {
        if (label === correctAnswer) opt.classList.add('correct');
        if (label === selectedAnswer && !isCorrect) opt.classList.add('wrong');
      }
    });
    const btn = document.getElementById('btn-confirm-multi');
    if (btn) btn.style.display = 'none';
  }

  const fb = document.getElementById('answer-feedback');
  if (isCorrect) {
    fb.className = 'answer-feedback show correct-fb';
    fb.textContent = '回答正确！答案：' + correctAnswer;
    playOrb();
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '回答错误！正确答案：' + correctAnswer;
    playBreak();
    // 周围闪红光
    const card = document.querySelector('.quiz-card');
    if (card) {
      card.classList.remove('flash-red');
      void card.offsetWidth;
      card.classList.add('flash-red');
      setTimeout(() => card.classList.remove('flash-red'), 800);
    }
  }

  totalAnswered++;
  const key = qKey(q);

  // —— 记录分析数据（章节错题 & 题目迟疑时长） ——
  const chapter = q.chapter || '未分类';
  if (!quizAnalysis.byChapter[chapter]) quizAnalysis.byChapter[chapter] = {wrong:0, correct:0, total:0};
  quizAnalysis.byChapter[chapter].total++;
  if (isCorrect) quizAnalysis.byChapter[chapter].correct++;
  else quizAnalysis.byChapter[chapter].wrong++;

  let qa = quizAnalysis.byQuestion[key];
  if (!qa) {
    qa = {question: q.question, chapter: chapter, countWrong:0, countCorrect:0, hesitation:[], maxHesitation:0};
    quizAnalysis.byQuestion[key] = qa;
  }
  const hesitation = questionStartTime ? (Date.now() - questionStartTime) / 1000 : 0; // 秒
  if (hesitation > 0) {
    qa.hesitation.push(hesitation);
    if (qa.hesitation.length > 20) qa.hesitation.splice(0, qa.hesitation.length - 20);
    if (hesitation > qa.maxHesitation) qa.maxHesitation = hesitation;
  }
  if (isCorrect) qa.countCorrect++;
  else qa.countWrong++;
  // 保持题干与章节信息始终最新
  qa.question = q.question;
  qa.chapter = chapter;
  saveAnalysis();
  // ——————————

  if (isCorrect) {
    correctCount++;
    streak++;
    if (correctCount > 0 && correctCount % 10 === 0) {
      setTimeout(playLevelup, 200);
    }
    if (mode === 'infinite') {
      infiniteMap[key].correctCount++;
      // 更新 session：连续答对 3 次就移除此题（不再记在会话里）
      const cur = infiniteSession[key] || {is_correct: false, corrects: 0};
      cur.is_correct = true;
      cur.corrects = (cur.corrects || 0) + 1;
      if (cur.corrects >= 3) {
        delete infiniteSession[key];
      } else {
        infiniteSession[key] = cur;
      }
    }
    // In wrongbook mode, only remove from temp, NOT from long
    if (mode === 'wrongbook' && wrongBookTemp[key]) {
      delete wrongBookTemp[key];
      localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
    }
    // Streak effects
    handleStreak();
  } else {
    wrongCount++;
    streak = 0;
    if (mode === 'infinite') {
      infiniteMap[key].correctCount = 0;
      quizQueue.push(q);
      // 答错：保留在 session 里，下次还要问
      infiniteSession[key] = {is_correct: false, corrects: 0};
    }
    wrongList.push({question: q, selectedAnswer: selectedAnswer});
    // Auto add to temp (if not already in long)
    if (!wrongBookLong[key] && !wrongBookTemp[key]) {
      wrongBookTemp[key] = qObj(q);
      localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
    }
  }

  currentIndex++;
  if (mode === 'infinite') saveInfiniteProgress();

  // 答题后显示只读备注：必须开关开启且该题有备注才显示
  const noteKey = qKey(q);
  const noteVal = wrongBookNotes[noteKey];
  const noteEl = document.getElementById('readonly-note');
  const noteContentEl = document.getElementById('readonly-note-content');
  const showNoteEnabled = challengeSettings && challengeSettings.showNote;
  if (noteEl && noteContentEl) {
    if (showNoteEnabled && noteVal) {
      noteEl.classList.remove('hidden');
      noteContentEl.textContent = noteVal;
      // 默认折叠
      noteEl.classList.remove('expanded');
    } else {
      noteEl.classList.add('hidden');
    }
  }

  autoNextTimeout = setTimeout(() => {
    if (mode === 'timed') timerPaused = false;
    renderQuestion();
  }, 1500);
}

// 切换答题后的只读备注展开/折叠
function toggleReadonlyNote() {
  const noteEl = document.getElementById('readonly-note');
  if (noteEl) noteEl.classList.toggle('expanded');
}

// ====== Calculation Questions ======
function renderCalculation(q, area) {
  const subQuestions = q.sub_questions || [];
  const answers = q.answer || {};
  let html = '<div class="calc-container">';

  // Table rendering
  if (q.table && q.table.headers && q.table.rows) {
    html += '<div class="calc-table-wrap"><table class="calc-table"><thead><tr>';
    q.table.headers.forEach(h => {
      html += '<th>' + escHtml(h) + '</th>';
    });
    html += '</tr></thead><tbody>';
    q.table.rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => {
        html += '<td>' + escHtml(cell) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }

  subQuestions.forEach(sq => {
    const id = sq.id;
    html += '<div class="calc-question" data-qid="' + id + '">';
    html += '<div class="calc-label">第' + id + '问：</div>';
    html += '<div class="calc-text">' + escHtml(sq.text) + '</div>';
    html += '<div class="calc-input-row">';
    html += '<input type="text" class="calc-input" data-qid="' + id + '" placeholder="输入答案...">';
    html += '<span class="calc-feedback" id="calc-fb-' + id + '"></span>';
    html += '</div></div>';
  });
  html += '<div class="btn-row" style="margin-top:12px">';
  html += '<button class="btn btn-primary" id="btn-submit-calculation" onclick="judgeCalculation()">提交计算题</button>';
  html += '</div></div>';
  area.innerHTML = html;
  const fb = document.getElementById('answer-feedback');
  fb.className = 'answer-feedback';
  fb.textContent = '';
}

function judgeCalculation() {
  answered = true;
  if (mode === 'challenge') clearPerQuestionTimer();
  const q = quizQueue[currentIndex];
  const answers = q.answer || {};
  const inputs = document.querySelectorAll('.calc-input');
  let allCorrect = true;

  inputs.forEach(input => {
    const qid = input.dataset.qid;
    const userVal = parseFloat(input.value.trim());
    const fbEl = document.getElementById('calc-fb-' + qid);
    const ans = answers[qid];
    let isCorrect = false;

    if (ans) {
      if (ans.scope) {
        isCorrect = userVal >= ans.scope[0] && userVal <= ans.scope[1];
      } else if (ans.value !== undefined) {
        isCorrect = Math.abs(userVal - ans.value) < 0.001;
      }
    }

    if (isCorrect) {
      fbEl.textContent = '✓';
      fbEl.className = 'calc-feedback calc-correct';
    } else {
      fbEl.textContent = '✗ 期望: ' + (ans && ans.scope ? ans.scope[0] + '~' + ans.scope[1] : (ans ? ans.value : '?'));
      fbEl.className = 'calc-feedback calc-wrong';
      allCorrect = false;
    }
  });

  const fb = document.getElementById('answer-feedback');
  if (allCorrect) {
    fb.className = 'answer-feedback show correct-fb';
    fb.textContent = '全部正确！';
    playOrb();
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '部分或全部错误，请查看各问反馈';
    playBreak();
    const card = document.querySelector('.quiz-card');
    if (card) {
      card.classList.remove('flash-red');
      void card.offsetWidth;
      card.classList.add('flash-red');
      setTimeout(() => card.classList.remove('flash-red'), 800);
    }
  }

  totalAnswered++;
  const key = qKey(q);
  const chapter = q.chapter || '未分类';
  if (!quizAnalysis.byChapter[chapter]) quizAnalysis.byChapter[chapter] = {wrong:0, correct:0, total:0};
  quizAnalysis.byChapter[chapter].total++;
  if (allCorrect) quizAnalysis.byChapter[chapter].correct++;
  else quizAnalysis.byChapter[chapter].wrong++;
  let qa = quizAnalysis.byQuestion[key];
  if (!qa) {
    qa = {question: q.question, chapter: chapter, countWrong:0, countCorrect:0, hesitation:[], maxHesitation:0};
    quizAnalysis.byQuestion[key] = qa;
  }
  const hesitation = questionStartTime ? (Date.now() - questionStartTime) / 1000 : 0;
  if (hesitation > 0) {
    qa.hesitation.push(hesitation);
    if (qa.hesitation.length > 20) qa.hesitation.splice(0, qa.hesitation.length - 20);
    if (hesitation > qa.maxHesitation) qa.maxHesitation = hesitation;
  }
  if (allCorrect) qa.countCorrect++;
  else qa.countWrong++;
  qa.question = q.question;
  qa.chapter = chapter;
  saveAnalysis();

  if (allCorrect) {
    correctCount++;
    if (correctCount > 0 && correctCount % 10 === 0) setTimeout(playLevelup, 200);
  } else {
    wrongCount++;
    wrongList.push({question: q, selectedAnswer: JSON.stringify(Array.from(inputs).map(i => ({qid:i.dataset.qid, val:i.value})))
  });
    if (!wrongBookLong[key] && !wrongBookTemp[key]) {
      wrongBookTemp[key] = qObj(q);
      localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
    }
  }

  document.getElementById('btn-submit-calculation').classList.add('hidden');
  // Add "下一题" button dynamically
  const btnRow = document.querySelector('.calc-container .btn-row');
  if (btnRow && !btnRow.querySelector('#btn-next-calculation')) {
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.id = 'btn-next-calculation';
    nextBtn.textContent = '下一题';
    nextBtn.onclick = nextQuestion;
    btnRow.appendChild(nextBtn);
  }
}

// ====== Subjective Questions ======
function renderSubjective(q, area) {
  let html = '<div class="subjective-container">';
  html += '<textarea class="subjective-input" id="subjective-input" placeholder="请输入你的答案..."></textarea>';
  html += '<div class="btn-row" style="margin-top:12px">';
  html += '<button class="btn btn-primary" id="btn-submit-subjective" onclick="judgeSubjective()">提交</button>';
  html += '</div></div>';
  area.innerHTML = html;
  const fb = document.getElementById('answer-feedback');
  fb.className = 'answer-feedback';
  fb.textContent = '';
}

function judgeSubjective() {
  answered = true;
  if (mode === 'challenge') clearPerQuestionTimer();
  const q = quizQueue[currentIndex];
  const userAnswer = document.getElementById('subjective-input').value.trim();
  const answerData = q.answer || {};
  const reference = answerData.reference || '';
  const minMatch = answerData.min_match || 0.4;

  let matchedItems = [], unmatchedItems = [], score = 0;

  if (reference && reference.trim()) {
    // 词集对比模式：用 jieba 分词后对比用户答案与参考答案的词重叠率
    score = scoreSubjectiveRef(userAnswer, reference);
    // unmatchedItems 暂时为空，detail 中展示参考核心词云
  } else {
    // 旧模式：groups 或 keywords（向后兼容）
    const groups = answerData.groups;
    if (groups && groups.length > 0) {
      let matchedCount = 0;
      groups.forEach((group, idx) => {
        const groupMatch = group.some(kw => userAnswer.includes(kw));
        if (groupMatch) {
          matchedCount++;
          matchedItems.push('第' + (idx + 1) + '组');
        } else {
          unmatchedItems.push('第' + (idx + 1) + '组（' + group.join('/') + '）');
        }
      });
      score = groups.length > 0 ? matchedCount / groups.length : 0;
    } else {
      const keywords = answerData.keywords || [];
      let matchedCount = 0;
      keywords.forEach(kw => {
        if (userAnswer.includes(kw)) {
          matchedCount++;
          matchedItems.push(kw);
        } else {
          unmatchedItems.push(kw);
        }
      });
      score = keywords.length > 0 ? matchedCount / keywords.length : 0;
    }
  }

  const isCorrect = score >= minMatch;
  const pct = isFinite(score) ? Math.round(score * 100) : 0;

  const fb = document.getElementById('answer-feedback');
  if (isCorrect) {
    fb.className = 'answer-feedback show correct-fb';
    fb.textContent = '优秀！匹配度 ' + pct + '%';
    playOrb();
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '匹配度 ' + pct + '%';
    playBreak();
    const card = document.querySelector('.quiz-card');
    if (card) {
      card.classList.remove('flash-red');
      void card.offsetWidth;
      card.classList.add('flash-red');
      setTimeout(() => card.classList.remove('flash-red'), 800);
    }
  }

  let detailHtml = '<div class="subjective-feedback">';
  detailHtml += '<div class="subjective-score">得分：' + pct + '%</div>';
  if (reference && reference.trim()) {
    const refWords = segmentText(reference);
    if (refWords.length > 0) {
      detailHtml += '<div class="subjective-matched">参考答案核心词：' + refWords.join(' · ') + '</div>';
    }
  } else {
    if (matchedItems.length > 0) detailHtml += '<div class="subjective-matched">命中的要点：' + matchedItems.join('、') + '</div>';
    if (unmatchedItems.length > 0) detailHtml += '<div class="subjective-unmatched">遗漏的要点：' + unmatchedItems.join('; ') + '</div>';
  }
  if (reference) detailHtml += '<div class="subjective-reference">参考答案：' + escHtml(reference) + '</div>';
  detailHtml += '</div>';

  const container = document.querySelector('.subjective-container');
  const existingDetail = container && container.querySelector('.subjective-feedback');
  if (existingDetail) existingDetail.remove();
  if (container) container.insertAdjacentHTML('beforeend', detailHtml);

  totalAnswered++;
  const key = qKey(q);
  const chapter = q.chapter || '未分类';
  if (!quizAnalysis.byChapter[chapter]) quizAnalysis.byChapter[chapter] = {wrong:0, correct:0, total:0};
  quizAnalysis.byChapter[chapter].total++;
  if (isCorrect) quizAnalysis.byChapter[chapter].correct++;
  else quizAnalysis.byChapter[chapter].wrong++;
  let qa = quizAnalysis.byQuestion[key];
  if (!qa) {
    qa = {question: q.question, chapter: chapter, countWrong:0, countCorrect:0, hesitation:[], maxHesitation:0};
    quizAnalysis.byQuestion[key] = qa;
  }
  const hesitation = questionStartTime ? (Date.now() - questionStartTime) / 1000 : 0;
  if (hesitation > 0) {
    qa.hesitation.push(hesitation);
    if (qa.hesitation.length > 20) qa.hesitation.splice(0, qa.hesitation.length - 20);
    if (hesitation > qa.maxHesitation) qa.maxHesitation = hesitation;
  }
  if (isCorrect) qa.countCorrect++;
  else qa.countWrong++;
  qa.question = q.question;
  qa.chapter = chapter;
  saveAnalysis();

  if (isCorrect) {
    correctCount++;
    if (correctCount > 0 && correctCount % 10 === 0) setTimeout(playLevelup, 200);
  } else {
    wrongCount++;
    wrongList.push({question: q, selectedAnswer: userAnswer});
    if (!wrongBookLong[key] && !wrongBookTemp[key]) {
      wrongBookTemp[key] = qObj(q);
      localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
    }
  }

  const submitBtn = document.getElementById('btn-submit-subjective');
  if (submitBtn) {
    submitBtn.classList.add('hidden');
    const btnRow = document.querySelector('.subjective-container .btn-row');
    if (btnRow && !btnRow.querySelector('.btn-next')) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-primary btn-next';
      nextBtn.textContent = '下一题';
      nextBtn.onclick = nextQuestion;
      btnRow.appendChild(nextBtn);
    }
  }
}

function nextQuestion() {
  currentIndex++;
  if (mode === 'infinite') saveInfiniteProgress();
  if (mode === 'timed') timerPaused = false;
  renderQuestion();
}

function quitQuiz() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);
  clearPerQuestionTimer();
  recordQuizSession();
  if (mode === 'infinite') saveInfiniteProgress();
  if (totalAnswered > 0) showResult();
  else showHome();
}

// ====== Result ======
function showResult() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);
  clearPerQuestionTimer();
  recordQuizSession();
  if (mode === 'infinite') saveInfiniteProgress();

  show('page-result');
  const title = document.getElementById('result-title');
  const stats = document.getElementById('result-stats');

  const rate = totalAnswered > 0 ? Math.round(correctCount / totalAnswered * 100) : 0;

  if (mode === 'challenge') {
    const wl = challengeSettings ? challengeSettings.wrongLimit : 100;
    const ct = challengeSettings ? challengeSettings.correctTarget : 160;
    if (wrongCount >= wl) title.textContent = '闯关失败 ❌';
    else if (correctCount >= ct) title.textContent = '闯关胜利 🎉';
    else title.textContent = '已退出';
  } else if (mode === 'infinite') {
    const mastered = getActiveQuestions().filter(q => infiniteMap[qKey(q)].correctCount >= 3).length;
    title.textContent = mastered === getActiveQuestions().length ? '全部掌握！' : '已退出';
    stats.innerHTML =
      '<div class="stat"><div class="stat-num green">' + mastered + '</div><div class="stat-label">已掌握</div></div>' +
      '<div class="stat"><div class="stat-num red">' + (getActiveQuestions().length - mastered) + '</div><div class="stat-label">未掌握</div></div>' +
      '<div class="stat"><div class="stat-num">' + totalAnswered + '</div><div class="stat-label">总答题</div></div>';
  } else if (mode === 'wrongbook') {
    title.textContent = '错题重做完成';
  } else if (mode === 'timed') {
    title.textContent = '限时结束';
  }

  if (mode !== 'infinite') {
    stats.innerHTML =
      '<div class="stat"><div class="stat-num green">' + correctCount + '</div><div class="stat-label">答对</div></div>' +
      '<div class="stat"><div class="stat-num red">' + wrongCount + '</div><div class="stat-label">答错</div></div>' +
      '<div class="stat"><div class="stat-num">' + rate + '%</div><div class="stat-label">正确率</div></div>' +
      '<div class="stat"><div class="stat-num">' + totalAnswered + '</div><div class="stat-label">总计</div></div>';
  }

  document.getElementById('quiz-timer').classList.add('hidden');
  document.getElementById('gear-btn').classList.add('hidden');

  const summaryEl = document.getElementById('wrong-summary');
  if (wrongList.length > 0) {
    summaryEl.classList.remove('hidden');
    renderWrongSummary();
  } else {
    summaryEl.classList.add('hidden');
  }
}

// ====== Wrong Summary ======
function formatAnswer(q) {
  if (q.type === 'calculation') {
    const ans = q.answer || {};
    return Object.keys(ans).map(k => {
      const a = ans[k];
      if (a.scope) return 'Q' + k + '[' + a.scope[0] + '~' + a.scope[1] + ']';
      if (a.value !== undefined) return 'Q' + k + '=' + a.value;
      return 'Q' + k + '=?';
    }).join(' ');
  }
  if (q.type === 'subjective') return '见展开详情';
  return q.answer;
}
function renderWrongSummary() {
  const list = document.getElementById('wrong-summary-list');
  let html = '';
  wrongList.forEach((item, i) => {
    const q = item.question;
    let sel = item.selectedAnswer;
    let ans = q.answer;

    // 格式化计算题答案
    if (q.type === 'calculation') {
      let parsedSel = '';
      try {
        const arr = JSON.parse(sel);
        parsedSel = arr.map(s => {
          const v = s.val ? s.val.trim() : '';
          return 'Q' + s.qid + ': ' + (v || '未回答');
        }).join('  ');
      } catch (e) {
        parsedSel = sel || '未回答';
      }
      sel = parsedSel;

      if (typeof ans === 'object' && ans !== null) {
        ans = Object.keys(ans).map(k => {
          const a = ans[k];
          if (a.scope) return 'Q' + k + ': [' + a.scope[0] + '~' + a.scope[1] + ']';
          if (a.value !== undefined) return 'Q' + k + ': ' + a.value;
          return 'Q' + k + ': ?';
        }).join('  ');
      } else if (!ans) {
        ans = '未设置';
      }
    } else if (q.type === 'subjective' && ans && ans.reference) {
      ans = ans.reference;
    } else if (typeof ans === 'object' && ans !== null) {
      ans = JSON.stringify(ans);
    }

    const brief = q.question.length > 30 ? q.question.substring(0, 30) + '...' : q.question;
    html += '<div class="wrong-item">' +
      '<div class="wrong-item-header" onclick="toggleWrongItem(this)">' +
      '<span class="wrong-item-num">' + (i+1) + '</span>' +
      '<span class="wrong-item-brief">' + escHtml(brief) + '</span>' +
      '</div>' +
      '<div class="wrong-item-detail">' +
      '<div class="detail-q">' + escHtml(q.question) + '</div>' +
      '<div class="wrong-item-ans-inline"><span class="wrong-sel">' + escHtml(sel || '未回答') + '</span> → <span class="correct-ans">答 ' + escHtml(ans || '未设置') + '</span></div>';

    if (q.type === 'calculation') {
      // 计算题详情：显示各子问
      const subQuestions = q.sub_questions || [];
      const ansObj = q.answer || {};
      let userAnswers = [];
      try { userAnswers = JSON.parse(item.selectedAnswer); } catch(e) {}
      subQuestions.forEach(sq => {
        const id = sq.id;
        const ua = userAnswers.find(u => String(u.qid) === String(id));
        const userVal = ua ? (ua.val ? ua.val.trim() : '未回答') : '未回答';
        const correct = ansObj[id];
        let correctStr = '';
        if (correct) {
          if (correct.scope) correctStr = correct.scope[0] + ' ~ ' + correct.scope[1];
          else if (correct.value !== undefined) correctStr = String(correct.value);
          else correctStr = '?';
        }
        const isRight = correct && (
          correct.scope
            ? (parseFloat(userVal) >= correct.scope[0] && parseFloat(userVal) <= correct.scope[1])
            : correct.value !== undefined && Math.abs(parseFloat(userVal) - correct.value) < 0.001
        );
        html += '<div class="detail-opt' + (isRight ? ' correct' : ' wrong') + '">' +
          formatOptionQuotes(escHtml(sq.text)) + '<br><span style="font-size:12px;color:#888">你的答案：' + escHtml(userVal) +
          ' | 正确答案：' + correctStr + '</span></div>';
      });
    } else if (q.type === 'true_false') {
      html += '<div class="detail-opt' + (sel === '正确' ? ' wrong' : '') + '">正确' + (sel === '正确' ? ' ← 你的选择' : '') + (ans === '正确' && sel !== '正确' ? ' (正确)' : '') + '</div>';
      html += '<div class="detail-opt' + (sel === '错误' ? ' wrong' : '') + '">错误' + (sel === '错误' ? ' ← 你的选择' : '') + (ans === '错误' && sel !== '错误' ? ' (正确)' : '') + '</div>';
      html += '<div class="detail-opt correct">正确答案：' + ans + '</div>';
    } else {
      (q.options || []).forEach(opt => {
        const label = opt.label || '';
        const text = opt.text || '';
        const isMulti = q.type === 'multiple_choice';
        const isCorrectOpt = isMulti ? ans.includes(label) : label === ans;
        const isSelected = isMulti ? sel.includes(label) : label === sel;
        let cls = 'detail-opt';
        if (isCorrectOpt) cls += ' correct';
        if (isSelected && !isCorrectOpt) cls += ' wrong';
        // 只在多选题时显示漏选标记（单选/判断只有一个正确答案，选了别的就是选错，不是漏选）
        const isMissing = isMulti && isCorrectOpt && !isSelected;
        html += '<div class="' + cls + '">' +
          (isMissing ? '<span class="miss-badge" title="漏选">漏</span> ' : '') +
          label + (label ? '. ' : '') + formatOptionQuotes(escHtml(text)) +
          (isSelected ? ' ← 你的选择' : '') + (isCorrectOpt && !isSelected ? ' (正确)' : '') + '</div>';
      });
    }
    html += '</div></div>';
  });
  list.innerHTML = html;
  wrongSummaryCollapsed = false;
  document.getElementById('wrong-summary-toggle').classList.remove('collapsed');
}

function toggleWrongSummary() {
  wrongSummaryCollapsed = !wrongSummaryCollapsed;
  document.getElementById('wrong-summary-list').style.display = wrongSummaryCollapsed ? 'none' : 'block';
  document.getElementById('wrong-summary-toggle').classList.toggle('collapsed', wrongSummaryCollapsed);
}

function toggleWrongItem(header) {
  header.nextElementSibling.classList.toggle('show');
}

// ====== Wrong Review ======
function showWrongReview() {
  if (wrongList.length === 0) return;
  reviewIndex = 0;
  show('page-wrong-review');
  renderReviewItem();
}

function renderReviewItem() {
  const item = wrongList[reviewIndex];
  const q = item.question;
  const selected = item.selectedAnswer;

  document.getElementById('review-counter').textContent = (reviewIndex + 1) + ' / ' + wrongList.length;

  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断'}[q.type] || '';
  let metaParts = [];
  if (q.chapter) metaParts.push(q.chapter);
  if (typeLabel) metaParts.push(typeLabel);
  if (Object.keys(sourceData).length > 1) metaParts.push(q.source);

  let html = '<div class="question-meta">' + metaParts.join(' · ') + '</div>';
  html += '<div class="question-text">' + formatQuestionQuotes(escHtml(q.question)) + '</div>';

  if (q.type === 'true_false') {
    html += '<div class="review-option' + (selected === '正确' ? ' wrong' : '') + '">正确' + (selected === '正确' ? ' (你的选择)' : '') + (q.answer === '正确' && selected !== '正确' ? ' (正确)' : '') + '</div>';
    html += '<div class="review-option' + (selected === '错误' ? ' wrong' : '') + '">错误' + (selected === '错误' ? ' (你的选择)' : '') + (q.answer === '错误' && selected !== '错误' ? ' (正确)' : '') + '</div>';
    html += '<div class="review-answer correct-ans">正确答案：' + q.answer + '</div>';
  } else if (q.type === 'calculation') {
    html += '<div class="review-answer correct-ans">正确答案：' + formatAnswer(q) + '</div>';
    html += '<div class="review-answer" style="font-size:13px;color:#888">你的回答：' + escHtml(selected || '未回答') + '</div>';
  } else {
    (q.options || []).forEach(opt => {
      const label = opt.label || '';
      const text = opt.text || '';
      const isMulti = q.type === 'multiple_choice';
      const isCorrectOpt = isMulti ? q.answer.includes(label) : label === q.answer;
      const isSelected = isMulti ? selected.includes(label) : label === selected;
      let cls = 'review-option';
      if (isCorrectOpt) cls += ' correct';
      else if (isSelected) cls += ' wrong';
      else cls += ' neutral';
      // 只在多选题时显示漏选标记
      const isMissing = isMulti && isCorrectOpt && !isSelected;
      html += '<div class="' + cls + '">' +
        (isMissing ? '<span class="miss-badge" title="漏选">漏</span> ' : '') +
        label + (label ? '. ' : '') + formatOptionQuotes(escHtml(text)) +
        (isSelected ? ' (你的选择)' : '') + (isCorrectOpt && !isSelected ? ' (正确)' : '') + '</div>';
    });
    html += '<div class="review-answer correct-ans">正确答案：' + q.answer + '</div>';
  }

  const key = qKey(q);
  const note = wrongBookNotes[key];
  if (note) {
    html += '<div class="note-display">备注：' + escHtml(note) + '</div>';
  }

  document.getElementById('review-card').innerHTML = html;

  // Update button
  const btnAdd = document.getElementById('btn-review-add');
  if (wrongBookTemp[key]) {
    btnAdd.textContent = '暂时错题 (点击转长期)';
    btnAdd.className = 'btn btn-book-green';
  } else if (wrongBookLong[key]) {
    btnAdd.textContent = '长期记忆 (点击移除)';
    btnAdd.className = 'btn btn-book-active';
  } else {
    btnAdd.textContent = '加入错题本';
    btnAdd.className = 'btn btn-primary';
  }
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function reviewPrev() {
  if (reviewIndex > 0) { reviewIndex--; renderReviewItem(); }
}

function reviewNext() {
  if (reviewIndex < wrongList.length - 1) { reviewIndex++; renderReviewItem(); }
}

function toggleWrongBookReview() {
  const q = wrongList[reviewIndex].question;
  const key = qKey(q);
  if (wrongBookTemp[key]) {
    // temp -> long
    delete wrongBookTemp[key];
    wrongBookLong[key] = qObj(q);
  } else if (wrongBookLong[key]) {
    // long -> remove
    delete wrongBookLong[key];
  } else {
    // not in book -> add to temp
    wrongBookTemp[key] = qObj(q);
  }
  localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
  localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  renderReviewItem();
}

function backToResult() {
  show('page-result');
}

// ====== Wrong Book Browser ======
let wbList = [];
let wbIndex = 0;
let wbFilter = 'all'; // 'all', 'temp', 'long'
let wbSourceFilter = 'all'; // 'all' or source name
// 展开状态：两级 key
// wbExpanded.source[source] = true / false (题库是否展开)
// wbExpanded.cat[source+':temp' or source+':long'] = true / false (二级分组是否展开)
let wbExpanded = { source: {}, cat: {} };

function openWrongBook() {
  const tempCount = Object.keys(wrongBookTemp).length;
  const longCount = Object.keys(wrongBookLong).length;
  if (tempCount + longCount === 0) return;
  wbFilter = 'all';
  wbIndex = 0;
  wbExpanded = { source: {}, cat: {} };
  document.querySelectorAll('#wb-filter-row .chip').forEach(c => {
    c.classList.remove('active');
  });
  const allChip = document.querySelector('#wb-filter-row .chip[data-filter="all"]');
  if (allChip) allChip.classList.add('active');
  buildWbGrouped();
  show('page-wrongbook');
  renderWbView();
}

// 按"题库 → 暂时/长期"分组构造数据
function buildWbGrouped() {
  // result: { sources: [{name, temp:[{key,q}], long:[{key,q}], totalCount}] }
  const map = new Map();
  function addToMap(q, key, cat) {
    const s = q.source || '未分类';
    if (!map.has(s)) map.set(s, { name: s, temp: [], long: [] });
    const entry = map.get(s);
    entry[cat].push({ key, q });
  }
  Object.entries(wrongBookTemp).forEach(([key, q]) => addToMap(q, key, 'temp'));
  Object.entries(wrongBookLong).forEach(([key, q]) => addToMap(q, key, 'long'));
  const sources = Array.from(map.values())
    .map(s => ({ ...s, totalCount: s.temp.length + s.long.length }))
    .sort((a, b) => b.totalCount - a.totalCount);
  wbGrouped = sources;
}
let wbGrouped = [];

function buildWbList() {
  wbList = [];
  const sourceFilter = wbSourceFilter !== 'all' ? wbSourceFilter : null;
  function matches(q) { return !sourceFilter || (q.source || '未分类') === sourceFilter; }
  if (wbFilter === 'all' || wbFilter === 'temp') {
    Object.entries(wrongBookTemp).forEach(([key, q]) => {
      if (matches(q)) wbList.push({ key, q, cat: 'temp' });
    });
  }
  if (wbFilter === 'all' || wbFilter === 'long') {
    Object.entries(wrongBookLong).forEach(([key, q]) => {
      if (matches(q)) wbList.push({ key, q, cat: 'long' });
    });
  }
}

function setWbFilter(el) {
  wbFilter = el.dataset.filter;
  document.querySelectorAll('#wb-filter-row .chip').forEach(c => {
    c.classList.remove('active');
  });
  el.classList.add('active');
  wbIndex = 0;
  const card = document.getElementById('wb-card');
  const analysis = document.getElementById('wb-analysis');
  const statsEl = document.getElementById('wb-stats');
  if (wbFilter === 'analysis') {
    card.classList.add('hidden');
    statsEl.classList.add('hidden');
    analysis.classList.remove('hidden');
    renderAnalysis();
  } else if (wbFilter === 'stats') {
    card.classList.add('hidden');
    analysis.classList.add('hidden');
    statsEl.classList.remove('hidden');
    renderStatsPage(statsEl);
  } else {
    analysis.classList.add('hidden');
    statsEl.classList.add('hidden');
    card.classList.remove('hidden');
    buildWbGrouped();
    renderWbView();
  }
}

// ====== 分析面板：逐题 SVG 柱状图 + 可点击跳转 ======
function renderAnalysis() {
  const analysisEl = document.getElementById('wb-analysis');
  if (!analysisEl) return;

  // —— 实时同步：每次进入分析页都从 localStorage 重新读（保证"答一题，数据更新一次"）
  quizAnalysis = loadAnalysis();

  const byChapter = Object.entries(quizAnalysis.byChapter || {})
    .map(([name, v]) => ({name, wrong: v.wrong || 0, correct: v.correct || 0, total: v.total || 0}))
    .sort((a, b) => b.wrong - a.wrong);

  const byQuestion = Object.entries(quizAnalysis.byQuestion || {})
    .map(([key, v]) => ({
      key,
      question: v.question || key,
      chapter: v.chapter,
      maxHesitation: v.maxHesitation || 0,
      avgHesitation: v.hesitation && v.hesitation.length ? v.hesitation.reduce((a,b)=>a+b,0)/v.hesitation.length : 0,
      countWrong: v.countWrong || 0,
    }))
    .sort((a, b) => b.maxHesitation - a.maxHesitation)
    .slice(0, 10);

  const totalWrong = byChapter.reduce((s, c) => s + c.wrong, 0);
  const totalA = byChapter.reduce((s, c) => s + c.total, 0);
  const worstChapter = byChapter[0];
  const slowest = byQuestion[0];

  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  }
  function escapeAttr(s) { return escapeXml(s); }

  // —— 每行一个独立 SVG（单一柱） ——
  // row: {label, value, color, onClick?}
  function buildBarRow(row, maxVal, color, onClickHtml) {
    const barHeight = 28;
    const labelWidth = 180;
    const valueSpace = 70;
    const chartWidth = 360;
    const totalWidth = labelWidth + chartWidth + valueSpace;
    const totalHeight = barHeight + 8;

    const ratio = row.value / maxVal;
    const barW = Math.max(2, chartWidth * ratio);
    const label = row.label.length > 22 ? row.label.substring(0, 20) + '…' : row.label;
    const valueText = Number.isInteger(row.value) ? row.value : row.value.toFixed(1);

    let svg = '<svg viewBox="0 0 ' + totalWidth + ' ' + totalHeight + '" style="width:100%;height:auto;display:block">';
    svg += '<text x="' + (labelWidth - 10) + '" y="' + (barHeight/2 + 4 + 4) + '" text-anchor="end" font-size="12" fill="#333">' + escapeXml(label) + '</text>';
    svg += '<rect x="' + labelWidth + '" y="4" width="' + barW + '" height="' + barHeight + '" fill="' + color + '" rx="4" ry="4"></rect>';
    svg += '<text x="' + (labelWidth + barW + 8) + '" y="' + (barHeight/2 + 4 + 4) + '" font-size="12" fill="#555">' + escapeXml(valueText) + '</text>';
    svg += '</svg>';

    if (onClickHtml) {
      return '<div class="analysis-row" style="cursor:pointer;padding:4px 0" ' + onClickHtml + '>' + svg + '</div>';
    }
    return '<div class="analysis-row" style="padding:4px 0">' + svg + '</div>';
  }

  // —— 跳转：把题目送入错题本浏览视图（若没在错题本里，临时塞到 wrongBookTemp 以便查看） ——
  function buildJumpOnClickAttr(qKeyVal, questionText) {
    const safeKey = escapeAttr(qKeyVal);
    const safeText = escapeAttr(questionText);
    return 'onclick="jumpToAnalysisQuestion(\'' + safeKey + '\')" title="' + safeText + '"';
  }

  const updated = quizAnalysis.lastUpdated ? new Date(quizAnalysis.lastUpdated).toLocaleString() : '未记录';

  // —— 最久迟疑题目摘要 ——
  let slowestHtml = '';
  if (slowest && slowest.maxHesitation > 0) {
    const label = (slowest.chapter ? slowest.chapter + '·' : '') + slowest.question;
    const slowestOnClick = 'onclick="jumpToAnalysisQuestion(\'' + escapeAttr(slowest.key) + '\')"';
    slowestHtml = '最久迟疑的题目：<b style="color:#f39c12;cursor:pointer" ' + slowestOnClick + ' title="' + escapeAttr(label) + '">' +
      escapeXml(label.substring(0, 30)) + (label.length > 30 ? '…' : '') + '</b>（最长 ' + slowest.maxHesitation.toFixed(1) + ' 秒）<br>';
  }

  // —— 章节图 ——
  let chapterChart;
  const chapterRows = byChapter.filter(c => c.wrong > 0);
  if (chapterRows.length === 0) {
    chapterChart = '<div style="color:#999;text-align:center;padding:30px">暂无错题记录</div>';
  } else {
    const maxWrong = Math.max(...chapterRows.map(c => c.wrong), 1);
    chapterChart = chapterRows.map(r => buildBarRow({label: r.name, value: r.wrong}, maxWrong, '#e74c3c', null)).join('');
  }

  // —— 迟疑 Top 10 图（每行可点击） ——
  let questionChart;
  const qRows = byQuestion.filter(q => q.maxHesitation > 0);
  if (qRows.length === 0) {
    questionChart = '<div style="color:#999;text-align:center;padding:30px">暂无迟疑记录</div>';
  } else {
    const maxH = Math.max(...qRows.map(q => q.maxHesitation), 1);
    questionChart = qRows.map(q => {
      const label = (q.chapter ? q.chapter + '·' : '') + q.question;
      const onClickHtml = buildJumpOnClickAttr(q.key, label);
      return buildBarRow({label: label, value: q.maxHesitation}, maxH, '#f39c12', onClickHtml);
    }).join('');
  }

  analysisEl.innerHTML = '' +
    '<div style="padding:12px 18px 4px;">' +
      '<h4 style="margin:0 0 10px 0;font-size:15px">📊 答题分析 <span style="font-size:12px;color:#999;font-weight:normal;margin-left:8px">(实时：每答一题自动更新)</span></h4>' +
      '<div style="font-size:13px;color:#666;line-height:1.7">' +
        '累计答题：<b>' + totalA + '</b> 题 · 累计错题：<b>' + totalWrong + '</b> 题<br>' +
        (worstChapter && worstChapter.wrong > 0 ? '错题最多的章节：<b style="color:#e74c3c">' + escapeXml(worstChapter.name) + '</b>（' + worstChapter.wrong + ' 次）<br>' : '') +
        slowestHtml +
        '最后更新：' + updated +
      '</div>' +
    '</div>' +
    '<div style="padding:10px 18px 18px;border-top:1px solid #eee">' +
      '<h5 style="margin:8px 0 12px 0;font-size:14px">① 各章节错题数</h5>' + chapterChart +
    '</div>' +
    '<div style="padding:10px 18px 18px;border-top:1px solid #eee">' +
      '<h5 style="margin:8px 0 12px 0;font-size:14px">② 迟疑最久的题目（Top 10，单位：秒，点击可查看原题）</h5>' + questionChart +
    '</div>' +
    '<div style="padding:6px 18px 18px;text-align:right;border-top:1px solid #eee">' +
      '<button class="btn btn-secondary" onclick="if(confirm(\'确认清空所有分析数据？\')){resetAnalysis();renderAnalysis();}">清空分析数据</button>' +
    '</div>';
}

// 点击分析页某行 → 跳转到对应题目详情
function jumpToAnalysisQuestion(qKeyVal) {
  const qa = quizAnalysis.byQuestion && quizAnalysis.byQuestion[qKeyVal];
  if (!qa) return;

  // 构造一个和现有题目结构一致的对象，用于浏览视图
  // 若题库中有这道题（通过 key 匹配），优先用原题；否则用 qa 里保留的副本
  let q = ALL_QUESTIONS.find(x => qKey(x) === qKeyVal);
  if (!q) {
    q = {question: qa.question, chapter: qa.chapter, type: 'single_choice', answer: '', options: []};
  }

  // 切到"错题本"页面展示这道题
  show('page-wrongbook');
  wbList = [{key: qKeyVal, q: q, cat: 'analysis'}];
  wbIndex = 0;

  // 临时切换显示：把视图改为单题详情
  const cardEl = document.getElementById('wb-card');
  const counterEl = document.getElementById('wb-counter');
  cardEl.classList.remove('hidden');
  document.getElementById('wb-analysis').classList.add('hidden');

  // 高亮"全部"作为活跃状态（和原筛选逻辑保持一致）
  document.querySelectorAll('#wb-filter-row .chip').forEach(c => {
    c.classList.remove('active', 'active-green');
    c.style.background = ''; c.style.color = ''; c.style.borderColor = '';
  });
  const allChip = document.querySelector('#wb-filter-row .chip[data-filter="all"]');
  if (allChip) allChip.classList.add('active');

  counterEl.textContent = '分析跳转 · 1 题';
  // 直接渲染这道题的详情视图
  renderSingleAnalysisItem(q, qKeyVal, qa);
}

function renderSingleAnalysisItem(q, qKeyVal, qa) {
  const cardEl = document.getElementById('wb-card');
  const btnAction = document.getElementById('btn-wb-action');
  const btnPrev = document.getElementById('btn-wb-prev');
  const btnNext = document.getElementById('btn-wb-next');
  const btnRemove = document.getElementById('btn-wb-remove');
  btnPrev.classList.add('hidden');
  btnNext.classList.add('hidden');
  btnAction.classList.add('hidden');
  btnRemove.classList.add('hidden');

  let html = '<div class="review-item" style="padding:10px 4px">';
  html += '<div class="question-meta" style="font-size:12px;color:#666;margin-bottom:8px">';
  const metaParts = [];
  if (q.chapter) metaParts.push(q.chapter);
  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断'}[q.type];
  if (typeLabel) metaParts.push(typeLabel);
  html += metaParts.join(' · ');
  html += '</div>';
  html += '<div class="question-text" style="font-size:15px;line-height:1.6;margin-bottom:14px">' + formatQuestionQuotes(escapeHtml(q.question)) + '</div>';

  if (q.options && q.options.length) {
    html += '<div class="options" style="margin-bottom:12px">';
    q.options.forEach((opt, i) => {
      const isCorrect = opt.label === q.answer;
      html += '<div class="option' + (isCorrect ? ' correct' : '') + '" style="padding:10px 12px;margin:6px 0;border:1px solid #e5e5e5;border-radius:6px;cursor:default">';
      html += '<span style="font-weight:bold;margin-right:8px">' + (opt.label || (String.fromCharCode(65 + i))) + '</span>' + formatOptionQuotes(escapeHtml(opt.text || ''));
      if (isCorrect) html += ' <span style="color:#27ae60;margin-left:6px;font-weight:bold">✓</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="font-size:13px;color:#27ae60;margin-bottom:10px">正确答案：' + (q.answer || '未记录') + '</div>';
  } else if (q.type === 'true_false') {
    html += '<div style="font-size:13px;color:#27ae60;margin:8px 0 12px">正确答案：' + (q.answer || '未记录') + '</div>';
  } else {
    html += '<div style="font-size:13px;color:#888;margin:8px 0 12px">（未记录选项）</div>';
  }

  // 这道题的历史统计
  if (qa) {
    html += '<div class="answer-feedback" style="font-size:13px;color:#555;margin-top:10px;padding:8px 10px;background:#f8f9fa;border-radius:6px">';
    html += '答错 ' + (qa.countWrong || 0) + ' 次 · 答对 ' + (qa.countCorrect || 0) + ' 次';
    if (qa.maxHesitation > 0) html += ' · 最长迟疑 ' + qa.maxHesitation.toFixed(1) + ' 秒';
    if (qa.avgHesitation > 0) html += ' · 平均 ' + qa.avgHesitation.toFixed(1) + ' 秒';
    html += '</div>';
  }

  html += '</div>';
  cardEl.innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
}

// ====== 三级列表视图（题库 → 暂时/长期 → 题目） ======
function renderWbView() {
  renderWbThreeLevel();
}

function renderWbThreeLevel() {
  const cardEl = document.getElementById('wb-card');
  const counterEl = document.getElementById('wb-counter');

  const totalCount = wbGrouped.reduce((s, x) => s + x.totalCount, 0);
  counterEl.textContent = '共 ' + totalCount + ' 题';

  if (totalCount === 0) {
    cardEl.innerHTML = '<div style="text-align:center;color:#999;padding:40px">暂无错题</div>';
    return;
  }

  let html = '<div class="wb-three">';
  wbGrouped.forEach((src) => {
    const sourceExpanded = wbExpanded.source[src.name];
    const srcIcon = sourceExpanded ? '▼' : '▶';
    html += '<div class="wb-level1">' +
      '<div class="wb-level1-header" onclick="wbToggleSource(\'' + escAttr(src.name) + '\')">' +
      '<span class="wb-level1-icon">' + srcIcon + '</span>' +
      '<span class="wb-level1-title">' + escHtml(src.name) + '</span>' +
      '<span class="wb-level1-count">' + src.temp.length + '暂 / ' + src.long.length + '长</span>' +
      '</div>';
    if (sourceExpanded) {
      html += '<div class="wb-level1-body">';
      html += buildWbCatBlock(src, 'temp');
      html += buildWbCatBlock(src, 'long');
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '<div id="wb-detail" class="wb-detail hidden"></div>';
  cardEl.innerHTML = html;
}

function buildWbCatBlock(src, cat) {
  const items = src[cat];
  if (items.length === 0) return '';
  const catKey = src.name + ':' + cat;
  const expanded = wbExpanded.cat[catKey];
  const label = cat === 'temp' ? '暂时错题' : '长期记忆';
  const colorClass = cat === 'temp' ? 'wb-level2-temp' : 'wb-level2-long';
  const icon = expanded ? '▼' : '▶';
  let html = '<div class="wb-level2">';
  html += '<div class="wb-level2-header ' + colorClass + '" onclick="wbToggleCat(\'' + escAttr(catKey) + '\')">' +
    '<span class="wb-level2-icon">' + icon + '</span>' +
    '<span class="wb-level2-title">' + label + '</span>' +
    '<span class="wb-level2-count">' + items.length + ' 题</span>' + '</div>';
  if (expanded) {
    html += '<div class="wb-level2-body">';
    items.forEach((item, idx) => {
      const q = item.q;
      const brief = q.question.length > 40 ? q.question.substring(0, 40) + '...' : q.question;
      html += '<div class="wb-level3-item" onclick="wbOpenDetail(\'' + escAttr(item.key) + '\',\'' + cat + '\')">' +
        '<span class="wb-num">' + (idx + 1) + '</span>' +
        '<span class="wb-text">' + escHtml(brief) + '</span>' +
        '<span class="wb-ans">答 ' + escHtml(formatAnswer(q)) + '</span>' +
        '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function wbToggleSource(name) {
  wbExpanded.source[name] = !wbExpanded.source[name];
  renderWbThreeLevel();
}
function wbToggleCat(key) {
  wbExpanded.cat[key] = !wbExpanded.cat[key];
  renderWbThreeLevel();
}

function wbOpenDetail(key, cat) {
  const store = cat === 'temp' ? wrongBookTemp : wrongBookLong;
  const q = store[key];
  if (!q) return;
  const detail = document.getElementById('wb-detail');
  if (!detail) return;
  if (detail.dataset.key === key && detail.dataset.cat === cat) {
    detail.classList.add('hidden');
    detail.dataset.key = '';
    return;
  }
  detail.dataset.key = key;
  detail.dataset.cat = cat;

  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断',calculation:'计算',subjective:'主观'}[q.type] || '';
  let meta = [];
  if (q.chapter) meta.push(q.chapter);
  if (typeLabel) meta.push(typeLabel);

  let html = '<div class="wb-detail-header">' +
    '<span class="wb-detail-label">' + (cat === 'temp' ? '暂时错题' : '长期记忆') + '</span>' +
    '<span class="wb-detail-close" onclick="wbCloseDetail()">×</span>' +
    '</div>';
  html += '<div class="wb-detail-meta">' + meta.join(' · ') + '</div>';
  html += '<div class="wb-detail-q">' + formatQuestionQuotes(escHtml(q.question)) + '</div>';

  if (q.type === 'calculation') {
    const subQuestions = q.sub_questions || [];
    subQuestions.forEach(sq => {
      let aText = '';
      if (sq.answer) {
        if (sq.answer.value !== undefined) aText = String(sq.answer.value);
        else if (sq.answer.scope) aText = sq.answer.scope[0] + '~' + sq.answer.scope[1];
      }
      html += '<div class="detail-opt">' + escHtml(sq.text) +
        '<br><span style="font-size:12px;color:#888">参考答案：' + escHtml(aText) + '</span></div>';
    });
    html += '<div class="detail-opt correct">正确答案：' + escHtml(formatAnswer(q)) + ' ✓</div>';
  } else if (q.type === 'subjective') {
    const ref = (q.answer && q.answer.reference) ? q.answer.reference : '';
    html += '<div class="detail-opt correct">参考答案：' + escHtml(ref) + '</div>';
  } else if (q.type === 'true_false') {
    const isCorrect = (opt) => opt.label === q.answer;
    [{label:'正确',text:'正确'}, {label:'错误',text:'错误'}].forEach(opt => {
      const ok = opt.label === q.answer;
      html += '<div class="detail-opt' + (ok ? ' correct' : '') + '">' + opt.label + (ok ? ' ✓' : '') + '</div>';
    });
  } else {
    (q.options || []).forEach(opt => {
      const isCorrect = q.type === 'multiple_choice' ? (q.answer || '').includes(opt.label) : opt.label === q.answer;
      html += '<div class="detail-opt' + (isCorrect ? ' correct' : '') + '">' +
        (opt.label ? opt.label + '. ' : '') + formatOptionQuotes(escHtml(opt.text || '')) + (isCorrect ? ' ✓' : '') + '</div>';
    });
    html += '<div class="detail-opt correct">正确答案：' + escHtml(q.answer || '') + '</div>';
  }

  // 备注显示
  const noteKey = qKey(q);
  const noteVal = wrongBookNotes[noteKey];
  if (noteVal) {
    html += '<div class="note-display">📝 ' + escHtml(noteVal) + '</div>';
  }

  // 按钮行：纯图标 + 增加备注
  const isLongTerm = (cat === 'long');
  html += '<div class="wb-detail-btn-row">' +
    '<button class="wb-icon-btn wb-icon-star' + (isLongTerm ? ' is-long' : '') + '" onclick="wbToggleCategory(\'' + escAttr(key) + '\',\'' + cat + '\')" title="' + (cat === 'temp' ? '转为长期记忆' : '转回暂时错题') + '">' + (isLongTerm ? '★' : '☆') + '</button>' +
    '<button class="wb-icon-btn wb-icon-remove" onclick="wbRemove(\'' + escAttr(key) + '\',\'' + cat + '\')" title="移除">✈</button>' +
    '<button class="wb-icon-btn wb-icon-note" onclick="wbToggleNoteInput()" title="增加备注">📝</button>' +
    '</div>';

  // 备注输入区（默认隐藏）
  html += '<div id="wb-note-editor" class="wb-note-editor hidden">' +
    '<textarea id="wb-note-text" placeholder="输入备注内容…" maxlength="500"></textarea>' +
    '<div class="wb-note-editor-actions">' +
    '<button class="btn btn-primary btn-sm" onclick="wbSaveDetailNote(\'' + escAttr(noteKey) + '\')">保存</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="wbCancelNote()">取消</button>' +
    '</div></div>';

  // 底部导航：◀ ▶
  html += '<div class="wb-detail-nav">' +
    '<button class="wb-nav-btn" onclick="wbNavPrev()" title="上一题">◀</button>' +
    '<button class="wb-nav-btn" onclick="wbNavNext()" title="下一题">▶</button>' +
    '</div>';

  detail.innerHTML = html;

  // 如果有备注，回填到输入框
  const noteTextEl = document.getElementById('wb-note-text');
  if (noteTextEl && noteVal) {
    noteTextEl.value = noteVal;
  }

  detail.classList.remove('hidden');
}

function wbCloseDetail() {
  const d = document.getElementById('wb-detail');
  if (d) {
    d.classList.add('hidden');
    d.dataset.key = '';
  }
}

// ====== 浮层备注 ======
function wbToggleNoteInput() {
  const editor = document.getElementById('wb-note-editor');
  if (!editor) return;
  editor.classList.toggle('hidden');
  if (!editor.classList.contains('hidden')) {
    const ta = document.getElementById('wb-note-text');
    if (ta) { ta.focus(); ta.select(); }
  }
}

function wbSaveDetailNote(noteKey) {
  const ta = document.getElementById('wb-note-text');
  if (!ta) return;
  const val = ta.value.trim();
  if (val) {
    wrongBookNotes[noteKey] = val;
  } else {
    delete wrongBookNotes[noteKey];
  }
  localStorage.setItem('wrongBookNotes', JSON.stringify(wrongBookNotes));
  // 刷新浮层以更新备注显示
  const key = document.getElementById('wb-detail').dataset.key;
  const cat = document.getElementById('wb-detail').dataset.cat;
  wbOpenDetail(key, cat);
}

function wbCancelNote() {
  const editor = document.getElementById('wb-note-editor');
  if (editor) editor.classList.add('hidden');
}

// ====== 浮层上下题导航 ======
function wbBuildNavList() {
  const list = [];
  wbGrouped.forEach(src => {
    src.temp.forEach(item => list.push({ key: item.key, cat: 'temp' }));
    src.long.forEach(item => list.push({ key: item.key, cat: 'long' }));
  });
  return list;
}

function wbNavPrev() {
  const detail = document.getElementById('wb-detail');
  if (!detail || !detail.dataset.key) return;
  const list = wbBuildNavList();
  const cur = detail.dataset.key + '::' + detail.dataset.cat;
  const idx = list.findIndex(i => i.key + '::' + i.cat === cur);
  if (idx > 0) {
    const prev = list[idx - 1];
    wbOpenDetail(prev.key, prev.cat);
  }
}

function wbNavNext() {
  const detail = document.getElementById('wb-detail');
  if (!detail || !detail.dataset.key) return;
  const list = wbBuildNavList();
  const cur = detail.dataset.key + '::' + detail.dataset.cat;
  const idx = list.findIndex(i => i.key + '::' + i.cat === cur);
  if (idx < list.length - 1) {
    const next = list[idx + 1];
    wbOpenDetail(next.key, next.cat);
  }
}

// ========== 单题视图（用于分析页点击跳转） ==========
function renderWbItem() {
  const cardEl = document.getElementById('wb-card');
  const counterEl = document.getElementById('wb-counter');
  if (wbList.length === 0) {
    counterEl.textContent = '0 / 0';
    cardEl.innerHTML = '<div style="text-align:center;color:#999;padding:40px">暂无错题</div>';
    return;
  }
  if (wbIndex >= wbList.length) wbIndex = wbList.length - 1;
  if (wbIndex < 0) wbIndex = 0;
  const item = wbList[wbIndex];
  const q = item.q;
  counterEl.textContent = (wbIndex + 1) + ' / ' + wbList.length;
  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断'}[q.type] || '';
  let metaParts = [];
  if (q.chapter) metaParts.push(q.chapter);
  if (typeLabel) metaParts.push(typeLabel);

  let html = '<div class="question-meta">' + metaParts.join(' · ') + '</div>';
  html += '<div class="question-text">' + formatQuestionQuotes(escHtml(q.question)) + '</div>';

  if (q.type === 'true_false') {
    html += '<div class="detail-opt">正确</div>';
    html += '<div class="detail-opt">错误</div>';
    html += '<div class="detail-opt correct">正确答案：' + q.answer + '</div>';
  } else if (q.type === 'calculation') {
    html += '<div class="review-answer correct-ans">正确答案：' + formatAnswer(q) + '</div>';
  } else if (q.type === 'subjective') {
    const ref = (q.answer && q.answer.reference) ? q.answer.reference : '';
    html += '<div class="review-answer correct-ans">参考答案：' + escHtml(ref) + '</div>';
  } else {
    (q.options || []).forEach(opt => {
      const isCorrect = q.type === 'multiple_choice' ? (q.answer || '').includes(opt.label) : opt.label === q.answer;
      html += '<div class="detail-opt' + (isCorrect ? ' correct' : '') + '">' +
        (opt.label ? opt.label + '. ' : '') + formatOptionQuotes(escHtml(opt.text || '')) + '</div>';
    });
    html += '<div class="detail-opt correct">正确答案：' + escHtml(q.answer || '') + '</div>';
  }
  const key = qKey(q);
  if (wrongBookNotes[key]) {
    html += '<div class="note-display">备注：' + escHtml(wrongBookNotes[key]) + '</div>';
  }
  cardEl.innerHTML = html;
}

// ========== 工具：属性转义 ==========
function escAttr(s) {
  return String(s).replace(/[<>&"']/g, c => ({
    '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Click a list item to open it in detail view
function wbOpenItem(idx) {
  wbIndex = idx;
  // Switch to the matching filter
  const item = wbList[idx];
  wbFilter = item.cat;
  buildWbList();
  // Find the item in the new filtered list
  wbIndex = wbList.findIndex(x => x.key === item.key);
  if (wbIndex < 0) wbIndex = 0;
  // Update filter chips
  document.querySelectorAll('#wb-filter-row .chip').forEach(c => {
    c.classList.remove('active', 'active-green');
    c.style.background = ''; c.style.color = ''; c.style.borderColor = '';
    if (c.dataset.filter === wbFilter) c.classList.add('active');
  });
  renderWbItem();
}

function wbPrev() {
  if (wbIndex > 0) { wbIndex--; renderWbItem(); }
}

function wbNext() {
  if (wbIndex < wbList.length - 1) { wbIndex++; renderWbItem(); }
}

function refreshWrongBookHome() {
  const tempCount = Object.keys(wrongBookTemp).length;
  const longCount = Object.keys(wrongBookLong).length;
  const totalCount = tempCount + longCount;
  const card = document.getElementById('card-wrongbook');
  if (!card) return;
  if (totalCount === 0) {
    card.classList.add('disabled');
    card.querySelector('p').textContent = '错题本为空';
  } else {
    card.classList.remove('disabled');
    const includeLong = document.getElementById('wb-include-long')?.checked;
    card.querySelector('p').textContent = includeLong
      ? '错题本共 ' + totalCount + ' 道题（暂' + tempCount + ' + 长' + longCount + '）'
      : '暂时错题共 ' + tempCount + ' 道题';
  }
  // 同时更新首页的错题本 chip
  const chip = document.querySelector('.source-chip[data-type="wrongbook"]');
  if (chip) {
    chip.classList.toggle('active', totalCount > 0);
    chip.querySelector('.count').textContent = '(' + totalCount + '题)';
    const detail = chip.querySelector('.count-detail');
    if (detail) detail.textContent = '暂' + tempCount + '/长' + longCount;
  }
}

// 支持两种调用：
// 1) wbRemove(key, cat) —— 新版（从三级列表详情）
// 2) wbRemove() —— 老版（基于 wbIndex/wbList）
function wbRemove(key, cat) {
  let removed = false;
  if (key && cat) {
    if (cat === 'temp') {
      if (wrongBookTemp[key]) { delete wrongBookTemp[key]; removed = true; }
    } else if (cat === 'long') {
      if (wrongBookLong[key]) { delete wrongBookLong[key]; removed = true; }
    }
  } else if (wbList.length > 0) {
    const item = wbList[wbIndex];
    const k = item.key;
    if (item.cat === 'temp') {
      if (wrongBookTemp[k]) { delete wrongBookTemp[k]; removed = true; }
    } else if (item.cat === 'long') {
      if (wrongBookLong[k]) { delete wrongBookLong[k]; removed = true; }
    }
  }
  if (!removed) return;
  localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
  localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  refreshWrongBookHome();

  if (key && cat) {
    // 从三级列表调用：删除后跳转到下一题（或上一题），若没有了则关闭
    const list = wbBuildNavList();
    const cur = key + '::' + cat;
    const idx = list.findIndex(i => i.key + '::' + i.cat === cur);
    // 先删除数据
    // (数据已在上面删完)
    buildWbGrouped();
    renderWbThreeLevel();
    // 找下一个可显示的题
    const newList = wbBuildNavList();
    if (newList.length === 0) {
      const d = document.getElementById('wb-detail');
      if (d) { d.classList.add('hidden'); d.dataset.key = ''; }
      return;
    }
    // 优先显示同位置的下一题，超出则显示最后一题
    const targetIdx = Math.min(idx, newList.length - 1);
    const target = newList[targetIdx];
    wbOpenDetail(target.key, target.cat);
  } else {
    // 老版路径（如分析页）：重新渲染单题视图
    buildWbList();
    if (wbIndex >= wbList.length) wbIndex = wbList.length - 1;
    if (wbList.length === 0) { showHome(); return; }
    renderWbItem();
  }
}

function wbToggleCategory(key, cat) {
  let q = null;
  if (key && cat) {
    if (cat === 'temp') {
      if (!wrongBookTemp[key]) return;
      q = wrongBookTemp[key];
      delete wrongBookTemp[key];
      wrongBookLong[key] = q;
    } else if (cat === 'long') {
      if (!wrongBookLong[key]) return;
      q = wrongBookLong[key];
      delete wrongBookLong[key];
      wrongBookTemp[key] = q;
    }
  } else if (wbList.length > 0) {
    const item = wbList[wbIndex];
    const k = item.key;
    q = item.q;
    if (item.cat === 'temp') {
      delete wrongBookTemp[k];
      wrongBookLong[k] = q;
    } else if (item.cat === 'long') {
      delete wrongBookLong[k];
      wrongBookTemp[k] = q;
    }
  } else {
    return;
  }
  localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
  localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  refreshWrongBookHome();

  if (key && cat) {
    buildWbGrouped();
    renderWbThreeLevel();
    // 临时清空 key 绕过 wbOpenDetail 的 toggle-self 检测，然后重新打开
    const detail = document.getElementById('wb-detail');
    if (detail) detail.dataset.key = '';
    const newCat = cat === 'temp' ? 'long' : 'temp';
    wbOpenDetail(key, newCat);
  } else {
    buildWbList();
    renderWbItem();
  }
}

// ====== 答题历史统计（正确率图表） ======
let statsScope = 'all', statsTime = 'day';

function renderStatsPage(container) {
  let html = '<div class="stats-filter-row">';
  html += '<span class="chip' + (statsScope === 'all' ? ' active' : '') + '" onclick="setStatsScope(this,\'all\')">全部</span>';
  html += '<span class="chip' + (statsScope === 'chapter' ? ' active' : '') + '" onclick="setStatsScope(this,\'chapter\')">分章节</span>';
  html += '<span style="width:12px;display:inline-block"></span>';
  html += '<span class="chip' + (statsTime === 'day' ? ' active' : '') + '" onclick="setStatsTime(this,\'day\')">按天</span>';
  html += '<span class="chip' + (statsTime === 'week' ? ' active' : '') + '" onclick="setStatsTime(this,\'week\')">按周</span>';
  html += '</div><div class="stats-chart" id="stats-chart"></div>';
  container.innerHTML = html;
  renderStatsChart(document.getElementById('stats-chart'), statsScope, statsTime);
}

function setStatsScope(el, val) {
  statsScope = val;
  document.querySelectorAll('#wb-stats .stats-filter-row .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderStatsChart(document.getElementById('stats-chart'), statsScope, statsTime);
}

function setStatsTime(el, val) {
  statsTime = val;
  document.querySelectorAll('#wb-stats .stats-filter-row .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderStatsChart(document.getElementById('stats-chart'), statsScope, statsTime);
}
function recordQuizSession() {
  if (totalAnswered <= 0) return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const entry = {
    date: dateStr,
    chapter: quizQueue?.[0]?.chapter || '未知',
    source: quizQueue?.[0]?.source || '未知',
    total: totalAnswered,
    correct: correctCount,
    accuracy: totalAnswered > 0 ? Math.round(correctCount / totalAnswered * 100) : 0,
  };
  let history = [];
  try { history = JSON.parse(localStorage.getItem('quizHistory') || '[]'); } catch(e) {}
  history.push(entry);
  localStorage.setItem('quizHistory', JSON.stringify(history));
}

function renderStatsChart(container, filterScope, filterTime) {
  let history = [];
  try { history = JSON.parse(localStorage.getItem('quizHistory') || '[]'); } catch(e) {}
  if (history.length === 0) { container.innerHTML = '<div style="text-align:center;color:#888;padding:40px">暂无答题记录</div>'; return; }

  // 按题库筛选（只显示已选题库）
  const activeSources = new Set(Object.keys(sourceData).filter(s => sourceSelection[s] !== false));
  history = history.filter(h => activeSources.has(h.source));
  if (history.length === 0) { container.innerHTML = '<div style="text-align:center;color:#888;padding:40px">当前题库无答题记录</div>'; return; }

  // 分组
  let groups;
  if (filterScope === 'chapter') {
    // 分章节：每个 chapter 一条线，按天聚合
    const byChapter = {};
    history.forEach(h => {
      const ch = h.chapter || '未知';
      if (!byChapter[ch]) byChapter[ch] = {};
      const key = filterTime === 'week' ? getWeekKey(h.date) : h.date;
      if (!byChapter[ch][key]) byChapter[ch][key] = { total: 0, correct: 0 };
      byChapter[ch][key].total += h.total;
      byChapter[ch][key].correct += h.correct;
    });
    groups = byChapter;
  } else {
    // 全部：按天/周聚合
    const byTime = {};
    history.forEach(h => {
      const key = filterTime === 'week' ? getWeekKey(h.date) : h.date;
      if (!byTime[key]) byTime[key] = { total: 0, correct: 0 };
      byTime[key].total += h.total;
      byTime[key].correct += h.correct;
    });
    groups = { '正确率': byTime };
  }

  // 收集所有时间点
  const allKeys = new Set();
  Object.values(groups).forEach(g => Object.keys(g).forEach(k => allKeys.add(k)));
  const sortedKeys = Array.from(allKeys).sort();
  if (sortedKeys.length === 0) { container.innerHTML = '<div style="text-align:center;color:#888;padding:40px">暂无数据</div>'; return; }

  const W = 560, H = 280, PAD = { top: 20, right: 20, bottom: 45, left: 45 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = Math.max(8, Math.min(36, chartW / sortedKeys.length * 0.6));
  const gap = chartW / sortedKeys.length;

  // 计算全局最大正确率
  let maxVal = 100;
  Object.values(groups).forEach(g => {
    sortedKeys.forEach(k => { if (g[k]) maxVal = Math.max(maxVal, Math.ceil(g[k].correct / g[k].total * 100 / 10) * 10); });
  });
  if (maxVal < 50) maxVal = 50;

  // 颜色
  const colors = ['#4a90d9', '#27ae60', '#e74c3c', '#f39c12', '#8e44ad', '#2c3e50', '#1abc9c', '#e67e22'];
  let colorIdx = 0;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible"><g transform="translate(${PAD.left},${PAD.top})">`;

  // Y 轴网格
  for (let v = 0; v <= maxVal; v += 10) {
    const y = chartH - (v / maxVal) * chartH;
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#e0e0e0" stroke-dasharray="4,3"/>`;
    svg += `<text x="-6" y="${y+4}" text-anchor="end" font-size="11" fill="#888">${v}%</text>`;
  }

  // X 轴标签
  sortedKeys.forEach((k, i) => {
    const cx = i * gap + gap / 2;
    const label = filterTime === 'week' ? k.replace('W', '') : k.slice(5);
    svg += `<text x="${cx}" y="${chartH + 18}" text-anchor="end" font-size="10" fill="#888" transform="rotate(-30,${cx},${chartH + 18})">${label}</text>`;
  });

  // 绘制各组数据
  const series = Object.entries(groups);
  series.forEach(([name, data], si) => {
    const color = colors[colorIdx % colors.length];
    colorIdx++;
    const points = [];

    sortedKeys.forEach((k, i) => {
      const d = data[k];
      if (!d || d.total === 0) return;
      const cx = i * gap + gap / 2;
      const acc = d.correct / d.total * 100;
      const barH = (acc / maxVal) * chartH;
      const y = chartH - barH;
      points.push({ x: cx, y, acc });

      // 柱状图
      if (filterScope !== 'chapter' || series.length <= 3) {
        const w = si === 0 ? barW : barW * 0.5;
        const offset = si === 0 ? -w / 2 : (si === 1 ? 2 : -w - 2);
        svg += `<rect x="${cx + offset}" y="${y}" width="${w}" height="${barH}" fill="${color}" opacity=".7" rx="2"/>`;
      }
    });

    // 趋势线
    if (points.length >= 2) {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      svg += `<path d="${d}" stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
      // 数据点
      points.forEach(p => {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
      });
    }

    // 图例
    if (filterScope === 'chapter') {
      const ly = -10 - si * 18;
      svg += `<rect x="${chartW - 120}" y="${ly}" width="12" height="12" fill="${color}" rx="2"/>
        <text x="${chartW - 104}" y="${ly + 10}" font-size="11" fill="var(--text, #333)">${name}</text>`;
    }
  });

  svg += '</g></svg>';
  container.innerHTML = svg;
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const week = Math.ceil(dayOfYear / 7);
  return d.getFullYear() + 'W' + String(week).padStart(2, '0');
}
function toggleTheme() {
  const body = document.body;
  const isDark = body.getAttribute('data-theme') === 'dark';
  body.setAttribute('data-theme', isDark ? '' : 'dark');
  document.getElementById('theme-toggle').textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('theme', isDark ? '' : 'dark');
}
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    document.getElementById('theme-toggle').textContent = '🌙';
  }
})();

// ====== Preview Mode ======
let previewList = [];
let previewIndex = 0;
let previewViewMode = 'card'; // 'card' or 'list'
let previewSavedSelection = null; // { chapters: [...], types: [...] }
let cylinderModeEnabled = false;
let cylinderRafId = null;
let cylinderScrollPending = false;
let cylinderWheelAccum = 0;
let cylinderWheelTimer = null;
let cylinderSnapAnimating = false;
let cylinderSnapIdleTimer = null;
let cylinderFastMode = false;
let cylinderFastExitTimer = null;
let cylinderFocusIdx = 0; // index of currently focused item
const CYLINDER_WHEEL_THRESHOLD = 80; // px of accumulated delta to trigger snap
const CYLINDER_FAST_WINDOW = 2000; // 2 seconds window for fast detection
const CYLINDER_FAST_COUNT = 2; // >=2 wheel events in window = fast mode
const CYLINDER_FAST_EXIT = 500; // ms of no scroll before exiting fast mode

function loadPreviewSelection() {
  try {
    const raw = localStorage.getItem('previewSelection');
    if (raw) previewSavedSelection = JSON.parse(raw);
  } catch(e) {}
}
loadPreviewSelection();

function savePreviewSelection() {
  const chSelected = [...document.querySelectorAll('#preview-chapter-chips .chip.active')].map(e => e.dataset.val);
  const tpSelected = [...document.querySelectorAll('#preview-type-chips .chip.active')].map(e => e.dataset.val);
  previewSavedSelection = { chapters: chSelected, types: tpSelected };
  localStorage.setItem('previewSelection', JSON.stringify(previewSavedSelection));
}

function showPreviewConfig() {
  if (ALL_QUESTIONS.length === 0) return;
  disableCylinderMode();
  show('page-preview-config');
  const chapterSection = document.getElementById('preview-chapter-section');
  const sources = Object.keys(sourceData).filter(src => sourceSelection[src] !== false);
  if (sources.length > 0) {
    chapterSection.classList.remove('hidden');
    let html = '';
    sources.forEach(src => {
      const srcQuestions = sourceData[src] || [];
      const srcChapters = [...new Set(srcQuestions.map(q => q.chapter).filter(Boolean))];
      if (srcChapters.length === 0) return;
      const savedChapters = previewSavedSelection ? previewSavedSelection.chapters : null;
      html += '<div class="source-group">';
      html += '<div class="source-label">' + escHtml(src) + '</div>';
      html += '<span class="source-select-all" onclick="previewSelectAllChapters(\'' + escHtml(src) + '\')">全不选</span>';
      html += '<div class="chip-group">';
      srcChapters.forEach(ch => {
        const active = savedChapters ? savedChapters.includes(ch) : true;
        html += '<div class="chip' + (active ? ' active' : '') + '" data-val="'+ch+'" onclick="togglePreviewChip(this)">'+escHtml(ch)+'</div>';
      });
      html += '</div></div>';
    });
    document.getElementById('preview-chapter-chips').innerHTML = html;
    updateSelectAllLabels('#preview-chapter-chips');
  } else {
    chapterSection.classList.add('hidden');
  }
  // Type chips
  const allTypes = [...new Set(ALL_QUESTIONS.filter(q => sourceSelection[q.source] !== false).map(q => q.type).filter(Boolean))];
  const typeSection = document.getElementById('preview-type-section');
  if (allTypes.length > 0) {
    typeSection.classList.remove('hidden');
    const savedTypes = previewSavedSelection ? previewSavedSelection.types : null;
    const typeLabels = {single_choice:'单选', multiple_choice:'多选', true_false:'判断', calculation:'计算', subjective:'主观'};
    document.getElementById('preview-type-chips').innerHTML =
      allTypes.map(t => {
        const active = savedTypes ? savedTypes.includes(t) : true;
        return '<div class="chip' + (active ? ' active' : '') + '" data-val="'+t+'" onclick="togglePreviewChip(this)">'+(typeLabels[t]||t)+'</div>';
      }).join('');
  } else {
    typeSection.classList.add('hidden');
  }
  updatePreviewTypeChips();
  updatePreviewCount();
}

function togglePreviewChip(el) {
  el.classList.toggle('active');
  if (el.closest('#preview-chapter-chips')) { updatePreviewTypeChips(); updateSelectAllLabels('#preview-chapter-chips'); }
  updatePreviewCount();
  savePreviewSelection();
}

function previewSelectAllChapters(src) {
  const chips = document.querySelectorAll('#preview-chapter-chips .chip');
  const srcQuestions = sourceData[src] || [];
  const srcChapters = new Set(srcQuestions.map(q => q.chapter).filter(Boolean));
  const srcChips = [...chips].filter(c => srcChapters.has(c.dataset.val));
  const allActive = srcChips.every(c => c.classList.contains('active'));
  srcChips.forEach(c => {
    if (allActive) c.classList.remove('active');
    else c.classList.add('active');
  });
  // 更新按钮文字
  const label = document.querySelector('#preview-chapter-chips .source-group .source-select-all[onclick*="' + src + '"]');
  if (label) label.textContent = allActive ? '全选' : '全不选';
  updatePreviewTypeChips();
  updatePreviewCount();
  savePreviewSelection();
}

function updatePreviewTypeChips() {
  const chSelected = [...document.querySelectorAll('#preview-chapter-chips .chip.active')].map(e => e.dataset.val);
  const typeChips = document.querySelectorAll('#preview-type-chips .chip');
  if (chSelected.length === 0) {
    typeChips.forEach(c => c.style.display = '');
    return;
  }
  const validTypes = new Set();
  chSelected.forEach(ch => {
    ALL_QUESTIONS.filter(q => q.chapter === ch && sourceSelection[q.source] !== false).forEach(q => {
      if (q.type) validTypes.add(q.type);
    });
  });
  typeChips.forEach(c => {
    if (validTypes.has(c.dataset.val)) {
      c.style.display = '';
    } else {
      c.style.display = 'none';
      c.classList.remove('active');
    }
  });
}

function updatePreviewCount() {
  const pool = getPreviewPool();
  document.getElementById('preview-count').textContent = pool.length;
  document.getElementById('btn-start-preview').disabled = pool.length === 0;
  // 联动锁定题型区
  const chSelected = [...document.querySelectorAll('#preview-chapter-chips .chip.active')].map(e => e.dataset.val);
  const typeSection = document.getElementById('preview-type-section');
  if (typeSection) {
    typeSection.classList.toggle('config-section-locked', chSelected.length === 0);
  }
}

function getPreviewPool() {
  const chSelected = [...document.querySelectorAll('#preview-chapter-chips .chip.active')].map(e => e.dataset.val);
  const tpSelected = [...document.querySelectorAll('#preview-type-chips .chip.active')].map(e => e.dataset.val);
  let pool = ALL_QUESTIONS.filter(q => sourceSelection[q.source] !== false);
  if (chSelected.length > 0) pool = pool.filter(q => chSelected.includes(q.chapter));
  if (tpSelected.length > 0) pool = pool.filter(q => tpSelected.includes(q.type));
  return pool;
}

function startPreview() {
  const pool = getPreviewPool();
  if (pool.length === 0) { alert('没有符合条件的题目'); return; }
  previewList = pool;
  previewIndex = 0;
  // Restore last view/cylinder state
  const saved = localStorage.getItem('previewViewState');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      previewViewMode = s.viewMode || 'card';
      cylinderModeEnabled = !!s.cylinder;
    } catch (e) {
      previewViewMode = 'card';
      cylinderModeEnabled = false;
    }
  } else {
    previewViewMode = 'card';
    cylinderModeEnabled = false;
  }
  show('page-preview');
  // Sync checkbox state
  const cb = document.getElementById('cylinder-toggle');
  if (cb) cb.checked = cylinderModeEnabled;
  renderPreviewView();
}

function togglePreviewView() {
  previewViewMode = previewViewMode === 'card' ? 'list' : 'card';
  savePreviewViewState();
  renderPreviewView();
}

function savePreviewViewState() {
  localStorage.setItem('previewViewState', JSON.stringify({
    viewMode: previewViewMode,
    cylinder: cylinderModeEnabled
  }));
}

function renderPreviewView() {
  const cardEl = document.getElementById('preview-card');
  const listEl = document.getElementById('preview-list');
  const navEl = document.getElementById('preview-card-nav');
  const toggleEl = document.getElementById('preview-view-toggle');
  const cylinderRow = document.getElementById('cylinder-toggle-row');

  if (previewViewMode === 'card') {
    cardEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    navEl.classList.remove('hidden');
    toggleEl.textContent = '☰';
    toggleEl.title = '切换为列表视图';
    cylinderRow.classList.add('hidden');
    disableCylinderMode();
    renderPreviewItem();
  } else {
    cardEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    navEl.classList.add('hidden');
    toggleEl.textContent = '⊟';
    toggleEl.title = '切换为卡片视图';
    cylinderRow.classList.remove('hidden');
    renderPreviewList();
    if (cylinderModeEnabled) enableCylinderMode();
  }
  document.getElementById('preview-counter').textContent = previewList.length + ' 题';
  document.getElementById('preview-info').textContent = '预览模式';
}

// ====== Cylinder Mode ======
function toggleCylinderMode(enabled) {
  cylinderModeEnabled = enabled;
  savePreviewViewState();
  if (enabled) enableCylinderMode();
  else disableCylinderMode();
}

function enableCylinderMode() {
  const listEl = document.getElementById('preview-list');
  listEl.classList.add('cylinder-mode');
  document.documentElement.classList.add('cylinder-snap');

  // Reset all items
  listEl.querySelectorAll('.pv-list-detail').forEach(d => { d.classList.remove('show'); d.classList.remove('half-show'); });
  listEl.querySelectorAll('.pv-list-arrow').forEach(a => { a.style.transform = ''; });
  listEl.querySelectorAll('.pv-list-item').forEach(item => {
    item.style.marginTop = '';
    item.style.marginBottom = '';
    item.style.transform = '';
    item.style.opacity = '';
  });

  // Spacers so first/last can reach center
  const spacerH = Math.round(window.innerHeight / 2);
  let topSpacer = listEl.querySelector('.cylinder-spacer-top');
  let bottomSpacer = listEl.querySelector('.cylinder-spacer-bottom');
  if (!topSpacer) {
    topSpacer = document.createElement('div');
    topSpacer.className = 'cylinder-spacer-top';
    listEl.insertBefore(topSpacer, listEl.firstChild);
  }
  if (!bottomSpacer) {
    bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'cylinder-spacer-bottom';
    listEl.appendChild(bottomSpacer);
  }
  topSpacer.style.height = spacerH + 'px';
  bottomSpacer.style.height = spacerH + 'px';

  // Event listeners
  window.addEventListener('scroll', onCylinderScroll, { passive: true });
  window.addEventListener('resize', onCylinderResize, { passive: true });
  window.addEventListener('wheel', onCylinderWheel, { passive: false });
  window.addEventListener('touchstart', onCylinderTouchStart, { passive: true });
  window.addEventListener('touchend', onCylinderTouchEnd, { passive: true });

  cylinderWheelAccum = 0;
  cylinderSnapAnimating = false;
  cylinderFastMode = false;
  cylinderFocusIdx = 0;

  // First item to center
  requestAnimationFrame(() => {
    const items = listEl.querySelectorAll('.pv-list-item');
    if (items.length > 0) {
      const itemRect = items[0].getBoundingClientRect();
      const targetScroll = window.scrollY + itemRect.top + itemRect.height / 2 - window.innerHeight / 2;
      window.scrollTo({ top: targetScroll, behavior: 'instant' });
    }
    updateCylinderEffect();
  });
}

function disableCylinderMode() {
  const listEl = document.getElementById('preview-list');
  listEl.classList.remove('cylinder-mode');
  listEl.classList.remove('cylinder-fast-mode');
  document.documentElement.classList.remove('cylinder-snap');

  listEl.querySelectorAll('.pv-list-item').forEach(item => {
    item.style.transform = '';
    item.style.opacity = '';
    item.style.marginBottom = '';
    item.style.marginTop = '';
    item.classList.remove('focused', 'adjacent', 'far');
  });
  listEl.querySelectorAll('.pv-list-detail').forEach(d => { d.classList.remove('show'); d.classList.remove('half-show'); });
  listEl.querySelectorAll('.pv-list-arrow').forEach(a => { a.style.transform = ''; });

  const topSpacer = listEl.querySelector('.cylinder-spacer-top');
  const bottomSpacer = listEl.querySelector('.cylinder-spacer-bottom');
  if (topSpacer) topSpacer.remove();
  if (bottomSpacer) bottomSpacer.remove();

  window.removeEventListener('scroll', onCylinderScroll);
  window.removeEventListener('resize', onCylinderResize);
  window.removeEventListener('wheel', onCylinderWheel);
  window.removeEventListener('touchstart', onCylinderTouchStart);
  window.removeEventListener('touchend', onCylinderTouchEnd);

  if (cylinderRafId) { cancelAnimationFrame(cylinderRafId); cylinderRafId = null; }
  if (cylinderWheelTimer) { clearTimeout(cylinderWheelTimer); cylinderWheelTimer = null; }
  if (cylinderSnapIdleTimer) { clearTimeout(cylinderSnapIdleTimer); cylinderSnapIdleTimer = null; }
  if (cylinderFastExitTimer) { clearTimeout(cylinderFastExitTimer); cylinderFastExitTimer = null; }
  cylinderScrollPending = false;
  cylinderSnapAnimating = false;
  cylinderWheelAccum = 0;
  cylinderFastMode = false;
}

function onCylinderScroll() {
  if (!cylinderScrollPending) {
    cylinderScrollPending = true;
    cylinderRafId = requestAnimationFrame(() => {
      cylinderScrollPending = false;
      // Find the item closest to center and make it focus
      const listEl = document.getElementById('preview-list');
      const items = listEl.querySelectorAll('.pv-list-item');
      if (items.length === 0) return;
      const viewCenter = window.innerHeight / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      items.forEach((item, i) => {
        const rect = item.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - viewCenter);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      });
      if (closestIdx !== cylinderFocusIdx) {
        cylinderFocusIdx = closestIdx;
      }
      updateCylinderEffect();
      // In fast mode: schedule exit when scrolling stops
      if (cylinderFastMode) {
        scheduleFastExit();
      }
    });
  }
}

function onCylinderResize() {
  const listEl = document.getElementById('preview-list');
  const spacerH = Math.round(window.innerHeight / 2);
  const topSpacer = listEl.querySelector('.cylinder-spacer-top');
  const bottomSpacer = listEl.querySelector('.cylinder-spacer-bottom');
  if (topSpacer) topSpacer.style.height = spacerH + 'px';
  if (bottomSpacer) bottomSpacer.style.height = spacerH + 'px';
  updateCylinderEffect();
}

let cylinderTouchStartY = 0;

function onCylinderTouchStart(e) {
  if (!cylinderModeEnabled) return;
  cylinderTouchStartY = e.touches[0].clientY;
}

function onCylinderTouchEnd(e) {
  if (!cylinderModeEnabled) return;
  const deltaY = cylinderTouchStartY - (e.changedTouches[0]?.clientY || cylinderTouchStartY);
  if (Math.abs(deltaY) > 30) {
    // Fast-mode detection via touch: if we're already in fast mode, stay there
    if (!cylinderFastMode) {
      cylinderSnapToItem(deltaY > 0 ? 1 : -1);
    }
    // In fast mode, just let native scrolling continue
  }
}

function onCylinderWheel(e) {
  if (!cylinderModeEnabled) return;
  const listEl = document.getElementById('preview-list');
  if (!listEl || listEl.classList.contains('hidden')) return;

  // In fast mode: don't intercept, let native scroll happen freely
  if (cylinderFastMode) return;

  // Ignore wheel during snap animation
  if (cylinderSnapAnimating) return;

  const delta = e.deltaY;
  cylinderWheelAccum += delta;

  if (cylinderWheelTimer) clearTimeout(cylinderWheelTimer);
  cylinderWheelTimer = setTimeout(() => {
    cylinderWheelAccum = 0;
  }, 200);

  if (Math.abs(cylinderWheelAccum) >= CYLINDER_WHEEL_THRESHOLD) {
    const direction = cylinderWheelAccum > 0 ? 1 : -1;
    cylinderWheelAccum = 0;

    // Fast-mode detection: 2+ snap-triggering wheel events within 2s
    if (!window._cylWheelTimes) window._cylWheelTimes = [];
    window._cylWheelTimes.push(Date.now());
    const windowNow = Date.now();
    window._cylWheelTimes = window._cylWheelTimes.filter(t => windowNow - t <= CYLINDER_FAST_WINDOW);

    if (window._cylWheelTimes.length >= CYLINDER_FAST_COUNT + 1) {
      window._cylWheelTimes = [];
      enterFastMode();
      // After entering fast mode, still prevent this scroll from going beyond the list
      e.preventDefault();
      return;
    }

    cylinderSnapToItem(direction);
  }

  // Prevent page scroll during cylinder mode (when not in fast mode)
  e.preventDefault();
}

function enterFastMode() {
  cylinderFastMode = true;
  document.documentElement.classList.remove('cylinder-snap'); // disable CSS snap
  // Schedule auto-exit when scrolling stops
  scheduleFastExit();
}

function scheduleFastExit() {
  if (cylinderFastExitTimer) clearTimeout(cylinderFastExitTimer);
  cylinderFastExitTimer = setTimeout(() => {
    if (!cylinderFastMode) return;
    exitFastMode();
  }, CYLINDER_FAST_EXIT);
}

function exitFastMode() {
  cylinderFastMode = false;
  document.documentElement.classList.add('cylinder-snap'); // re-enable CSS snap
  // Snap to nearest item
  cylinderSnapToNearest();
}

function cylinderSnapToNearest() {
  if (cylinderSnapAnimating) return;
  const listEl = document.getElementById('preview-list');
  const items = listEl.querySelectorAll('.pv-list-item');
  if (items.length === 0) return;

  const viewCenter = window.innerHeight / 2;
  let closestIdx = 0;
  let closestDist = Infinity;
  items.forEach((item, i) => {
    const rect = item.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - viewCenter);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });

  cylinderFocusIdx = closestIdx;
  cylinderAnimateSnapTo(items[closestIdx]);
}

function cylinderSnapToItem(direction) {
  if (cylinderSnapAnimating) return;
  const listEl = document.getElementById('preview-list');
  const items = listEl.querySelectorAll('.pv-list-item');
  if (items.length === 0) return;

  let targetIdx = cylinderFocusIdx + direction;
  targetIdx = Math.max(0, Math.min(items.length - 1, targetIdx));
  if (targetIdx === cylinderFocusIdx) return;
  cylinderFocusIdx = targetIdx;

  cylinderAnimateSnapTo(items[targetIdx]);
}

function cylinderAnimateSnapTo(targetItem) {
  if (!targetItem || cylinderSnapAnimating) return;
  cylinderSnapAnimating = true;

  const rect = targetItem.getBoundingClientRect();
  const targetScroll = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;

  window.scrollTo({ top: targetScroll, behavior: 'smooth' });

  setTimeout(() => {
    cylinderSnapAnimating = false;
    updateCylinderEffect();
  }, 450);
}

function updateCylinderEffect() {
  const listEl = document.getElementById('preview-list');
  if (!listEl || !listEl.classList.contains('cylinder-mode')) return;

  const items = listEl.querySelectorAll('.pv-list-item');
  if (items.length === 0) return;

  items.forEach((item, idx) => {
    const idxDist = Math.abs(idx - cylinderFocusIdx);

    // Clear inline styles that may have been set
    item.style.transform = '';
    item.style.opacity = '';
    item.style.marginTop = '';
    item.style.marginBottom = '';

    // Set class for visual state
    item.classList.remove('focused', 'adjacent', 'far');
    if (idx === cylinderFocusIdx) item.classList.add('focused');
    else if (idxDist === 1) item.classList.add('adjacent');
    else item.classList.add('far');

    // Expand/collapse: in fast mode, collapse all
    const detail = item.querySelector('.pv-list-detail');
    const arrow = item.querySelector('.pv-list-arrow');
    if (detail) {
      if (cylinderFastMode) {
        // Fast mode: all collapsed, just visual scaling
        detail.classList.remove('show');
        detail.classList.remove('half-show');
        if (arrow) arrow.style.transform = '';
      } else if (idx === cylinderFocusIdx) {
        detail.classList.add('show');
        detail.classList.remove('half-show');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      } else if (idxDist === 1) {
        detail.classList.remove('show');
        detail.classList.add('half-show');
        if (arrow) arrow.style.transform = 'rotate(90deg)';
      } else {
        detail.classList.remove('show');
        detail.classList.remove('half-show');
        if (arrow) arrow.style.transform = '';
      }
    }
  });
}

function renderPreviewItem() {
  if (previewIndex < 0) previewIndex = 0;
  if (previewIndex >= previewList.length) previewIndex = previewList.length - 1;
  const q = previewList[previewIndex];
  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断',calculation:'计算',subjective:'主观'}[q.type] || '';
  let metaParts = [];
  if (q.chapter) metaParts.push(q.chapter);
  if (typeLabel) metaParts.push(typeLabel);
  if (Object.keys(sourceData).length > 1) metaParts.push(q.source);

  document.getElementById('preview-counter').textContent = (previewIndex + 1) + ' / ' + previewList.length;

  let html = '<div class="question-meta">' + metaParts.join(' · ') + '</div>';
  // 题干末尾加答案字母（选择/判断题）
  let answerTag = '';
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    answerTag = ' <span class="preview-answer-tag">' + (q.answer || '') + '</span>';
  } else if (q.type === 'true_false') {
    answerTag = ' <span class="preview-answer-tag">' + (q.answer === '正确' ? '正确' : q.answer === '错误' ? '错误' : '') + '</span>';
  }
  html += '<div class="question-text">' + formatQuestionQuotes(escHtml(q.question)) + answerTag + '</div>';

  // Table for calculation questions
  if (q.type === 'calculation' && q.table && q.table.headers && q.table.rows) {
    html += '<div class="calc-table-wrap"><table class="calc-table"><thead><tr>';
    q.table.headers.forEach(h => { html += '<th>' + escHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    q.table.rows.forEach(row => {
      html += '<tr>';
      row.forEach(cell => { html += '<td>' + escHtml(cell) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (q.sub_questions) {
      q.sub_questions.forEach(sq => {
        html += '<div class="preview-sub-q"><b>第' + sq.id + '问：</b>' + escHtml(sq.text) + '</div>';
      });
    }
  }

  // Options
  if (q.type === 'true_false') {
    html += '<div class="preview-options">';
    html += '<div class="review-option' + (q.answer === '正确' ? ' correct' : ' neutral') + '">正确' + (q.answer === '正确' ? ' ✓' : '') + '</div>';
    html += '<div class="review-option' + (q.answer === '错误' ? ' correct' : ' neutral') + '">错误' + (q.answer === '错误' ? ' ✓' : '') + '</div>';
    html += '</div>';
  } else if (q.options && q.options.length > 0) {
    html += '<div class="preview-options">';
    q.options.forEach(opt => {
      const label = opt.label || '';
      const isCorrect = q.type === 'multiple_choice' ? q.answer.includes(label) : label === q.answer;
      html += '<div class="review-option' + (isCorrect ? ' correct' : ' neutral') + '">' + label + (label ? '. ' : '') + formatOptionQuotes(escHtml(opt.text || '')) + (isCorrect ? ' ✓' : '') + '</div>';
    });
    html += '</div>';
  }

  // Answer area - 只有计算/主观题显示答案区块
  if (q.type === 'calculation' || q.type === 'subjective') {
    html += '<div class="preview-answer" id="preview-answer">';
    html += buildPreviewAnswerHtml(q);
    html += '</div>';
  }

  // 只读备注（如果有）
  const previewNoteKey = qKey(q);
  const previewNote = wrongBookNotes[previewNoteKey];
  if (previewNote) {
    html += '<div class="note-display">📝 备注：' + escHtml(previewNote) + '</div>';
  }

  document.getElementById('preview-card').innerHTML = html;

  document.getElementById('btn-preview-prev').disabled = previewIndex === 0;
  document.getElementById('btn-preview-next').disabled = previewIndex === previewList.length - 1;
}

function buildPreviewAnswerHtml(q) {
  let html = '';
  if (q.type === 'true_false') {
    html += '<div class="review-answer correct-ans">正确答案：' + escHtml(q.answer) + '</div>';
  } else if (q.type === 'calculation') {
    html += '<div class="review-answer correct-ans">正确答案：' + escHtml(formatAnswer(q)) + '</div>';
  } else if (q.type === 'subjective') {
    const ansData = q.answer || {};
    const ref = ansData.reference || '';
    html += '<div class="review-answer correct-ans">参考答案：' + escHtml(ref || JSON.stringify(ansData)) + '</div>';
    if (ansData.min_match) html += '<div style="font-size:12px;color:#888;margin-top:4px">最低匹配度：' + Math.round(ansData.min_match * 100) + '%</div>';
  } else {
    html += '<div class="review-answer correct-ans">正确答案：' + escHtml(q.answer) + '</div>';
  }
  return html;
}

function renderPreviewList() {
  const typeLabels = {single_choice:'单选',multiple_choice:'多选',true_false:'判断',calculation:'计算',subjective:'主观'};
  let html = '';
  previewList.forEach((q, i) => {
    const typeLabel = typeLabels[q.type] || '';
    let metaParts = [];
    if (q.chapter) metaParts.push(q.chapter);
    if (typeLabel) metaParts.push(typeLabel);
    if (Object.keys(sourceData).length > 1) metaParts.push(q.source);
    const brief = q.question.length > 50 ? q.question.substring(0, 50) + '...' : q.question;

    // 检查是否有备注
    const listItemNoteKey = qKey(q);
    const listItemHasNote = !!wrongBookNotes[listItemNoteKey];

    html += '<div class="pv-list-item' + (listItemHasNote ? ' has-note' : '') + '" onclick="togglePreviewListItem(this)">';
    html += '<div class="pv-list-header">';
    html += '<span class="pv-list-num">' + (i + 1) + '</span>';
    html += '<span class="pv-list-meta">' + escHtml(metaParts.join(' · ')) + '</span>';
    html += '<span class="pv-list-brief">' + escHtml(brief) + '</span>';
    html += '<span class="pv-list-arrow">&#9662;</span>';
    html += '</div>';
    html += '<div class="pv-list-detail">';

    // Full question text + 答案字母
    let listAnswerTag = '';
    if (q.type === 'single_choice' || q.type === 'multiple_choice') {
      listAnswerTag = ' <span class="preview-answer-tag">' + (q.answer || '') + '</span>';
    } else if (q.type === 'true_false') {
      listAnswerTag = ' <span class="preview-answer-tag">' + (q.answer === '正确' ? '正确' : q.answer === '错误' ? '错误' : '') + '</span>';
    }
    html += '<div class="question-text" style="font-size:15px;margin-bottom:12px">' + formatQuestionQuotes(escHtml(q.question)) + listAnswerTag + '</div>';

    // Table for calculation
    if (q.type === 'calculation' && q.table && q.table.headers && q.table.rows) {
      html += '<div class="calc-table-wrap"><table class="calc-table"><thead><tr>';
      q.table.headers.forEach(h => { html += '<th>' + escHtml(h) + '</th>'; });
      html += '</tr></thead><tbody>';
      q.table.rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => { html += '<td>' + escHtml(cell) + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      if (q.sub_questions) {
        q.sub_questions.forEach(sq => {
          html += '<div class="preview-sub-q"><b>第' + sq.id + '问：</b>' + escHtml(sq.text) + '</div>';
        });
      }
    }

    // Options
    if (q.type === 'true_false') {
      html += '<div class="review-option' + (q.answer === '正确' ? ' correct' : ' neutral') + '">正确' + (q.answer === '正确' ? ' ✓' : '') + '</div>';
      html += '<div class="review-option' + (q.answer === '错误' ? ' correct' : ' neutral') + '">错误' + (q.answer === '错误' ? ' ✓' : '') + '</div>';
    } else if (q.options && q.options.length > 0) {
    q.options.forEach(opt => {
      const label = opt.label || '';
      const isCorrect = q.type === 'multiple_choice' ? q.answer.includes(label) : label === q.answer;
      html += '<div class="review-option' + (isCorrect ? ' correct' : ' neutral') + '">' + label + (label ? '. ' : '') + formatOptionQuotes(escHtml(opt.text || '')) + (isCorrect ? ' ✓' : '') + '</div>';
    });
  }

  // Answer - 只有计算/主观题显示答案区块
    if (q.type === 'calculation' || q.type === 'subjective') {
      html += buildPreviewAnswerHtml(q);
    }

    // 只读备注（如果有）
    const listNoteKey = qKey(q);
    const listNote = wrongBookNotes[listNoteKey];
    if (listNote) {
      html += '<div class="note-display">📝 备注：' + escHtml(listNote) + '</div>';
    }

    html += '</div></div>';
  });
  document.getElementById('preview-list').innerHTML = html;
}

function togglePreviewListItem(el) {
  if (cylinderModeEnabled) return; // cylinder mode manages open/close
  const detail = el.querySelector('.pv-list-detail');
  const arrow = el.querySelector('.pv-list-arrow');
  const isOpen = detail.classList.contains('show');
  detail.classList.toggle('show', !isOpen);
  arrow.innerHTML = isOpen ? '&#9662;' : '&#9662;';
  arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function previewPrev() {
  if (previewIndex > 0) {
    previewIndex--;
    renderPreviewItem();
  }
}

function previewNext() {
  if (previewIndex < previewList.length - 1) {
    previewIndex++;
    renderPreviewItem();
  }
}

// ====== Start ======
init();
