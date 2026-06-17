// ====== 题库配置：新增题库只需在此添加一行 ======
const QUIZ_SOURCES = [
  { file: 'Marxism.json', name: '马克思主义基本原理' },
  { file: 'Statistic.json', name: '统计学' },
  // { file: 'math.json', name: '高等数学' },
  // { file: 'history.json', name: '历史' },
  // { file: 'geography.json', name: '地理' },
];

const DIFFICULTIES = ['easy','medium','hard','unknown'];
const DIFF_LABELS = {easy:'易',medium:'中',hard:'难',unknown:'未知'};

// 音效
let AUDIO_GOOD, AUDIO_PERFECT, AUDIO_AWESOME, AUDIO_UNBELIEVABLE, AUDIO_FABULOUS, AUDIO_MARVELOUS, AUDIO_WRONG;
function initAudio() {
  try {
    AUDIO_GOOD = new Audio('good.ogg');
    AUDIO_PERFECT = new Audio('perfect.ogg');
    AUDIO_AWESOME = new Audio('awesome.ogg');
    AUDIO_UNBELIEVABLE = new Audio('unbelievable.ogg');
    AUDIO_FABULOUS = new Audio('fabulous.ogg');
    AUDIO_MARVELOUS = new Audio('marvelous.ogg');
    AUDIO_WRONG = new Audio('wrong.ogg');
    AUDIO_GOOD.volume = 0.6;
    AUDIO_PERFECT.volume = 0.7;
    AUDIO_AWESOME.volume = 0.75;
    AUDIO_UNBELIEVABLE.volume = 0.8;
    AUDIO_FABULOUS.volume = 0.85;
    AUDIO_MARVELOUS.volume = 0.9;
    AUDIO_WRONG.volume = 0.7;
  } catch (e) { /* noop */ }
}
function playGood() {
  try {
    if (!AUDIO_GOOD) initAudio();
    AUDIO_GOOD.currentTime = 0;
    AUDIO_GOOD.play().catch(() => {});
  } catch (e) {}
}
function playPerfect() {
  try {
    if (!AUDIO_PERFECT) initAudio();
    AUDIO_PERFECT.currentTime = 0;
    AUDIO_PERFECT.play().catch(() => {});
  } catch (e) {}
}
function playAwesome() {
  try {
    if (!AUDIO_AWESOME) initAudio();
    AUDIO_AWESOME.currentTime = 0;
    AUDIO_AWESOME.play().catch(() => {});
  } catch (e) {}
}
function playUnbelievable() {
  try {
    if (!AUDIO_UNBELIEVABLE) initAudio();
    AUDIO_UNBELIEVABLE.currentTime = 0;
    AUDIO_UNBELIEVABLE.play().catch(() => {});
  } catch (e) {}
}
function playFabulous() {
  try {
    if (!AUDIO_FABULOUS) initAudio();
    AUDIO_FABULOUS.currentTime = 0;
    AUDIO_FABULOUS.play().catch(() => {});
  } catch (e) {}
}
function playMarvelous() {
  try {
    if (!AUDIO_MARVELOUS) initAudio();
    AUDIO_MARVELOUS.currentTime = 0;
    AUDIO_MARVELOUS.play().catch(() => {});
  } catch (e) {}
}
function playWrong() {
  try {
    if (!AUDIO_WRONG) initAudio();
    AUDIO_WRONG.currentTime = 0;
    AUDIO_WRONG.play().catch(() => {});
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
// 多错题本结构: wrongBooks = { [id]: { name, temp: {}, long: {}, notes: {} } }
let wrongBooks = {};
let currentWrongBookId = null; // 当前打开的错题本ID
let targetWrongBookId = null; // 用于收集错题的目标错题本ID（用户选择的）
let _subjectivePending = true; // segmentit 未加载时过滤主观题

// 兼容旧数据：迁移到新的多错题本结构
function migrateWrongBooks() {
  const savedTemp = localStorage.getItem('wrongBookTemp');
  const savedLong = localStorage.getItem('wrongBookLong');
  const savedNotes = localStorage.getItem('wrongBookNotes');
  
  if (savedTemp || savedLong) {
    const defaultBook = {
      name: '默认错题本',
      temp: savedTemp ? JSON.parse(savedTemp) : {},
      long: savedLong ? JSON.parse(savedLong) : {},
      notes: savedNotes ? JSON.parse(savedNotes) : {}
    };
    wrongBooks = { 'default': defaultBook };
    localStorage.setItem('wrongBooks', JSON.stringify(wrongBooks));
    // 清除旧数据
    localStorage.removeItem('wrongBookTemp');
    localStorage.removeItem('wrongBookLong');
    localStorage.removeItem('wrongBookNotes');
  }
}

// 获取当前错题本的 temp/long/notes
function getCurrentWB() {
  if (!currentWrongBookId || !wrongBooks[currentWrongBookId]) {
    // 如果没有当前错题本，使用第一个或创建默认
    const ids = Object.keys(wrongBooks);
    if (ids.length > 0) {
      currentWrongBookId = ids[0];
    } else {
      wrongBooks['default'] = { name: '默认错题本', temp: {}, long: {}, notes: {} };
      currentWrongBookId = 'default';
      saveWrongBooks();
    }
  }
  return wrongBooks[currentWrongBookId];
}

// 获取目标错题本（用于收集错题）
function getTargetWB() {
  // 优先使用用户选择的目标错题本
  if (targetWrongBookId && wrongBooks[targetWrongBookId]) {
    return wrongBooks[targetWrongBookId];
  }
  // 否则使用当前错题本
  return getCurrentWB();
}

// 保存所有错题本
function saveWrongBooks() {
  localStorage.setItem('wrongBooks', JSON.stringify(wrongBooks));
}

// 创建新错题本
function createWrongBook(name) {
  const id = 'wb_' + Date.now();
  wrongBooks[id] = { name: name || '新错题本', temp: {}, long: {}, notes: {} };
  saveWrongBooks();
  renderWrongBookChips();
  return id;
}

// 重命名错题本
function renameWrongBook(id, newName) {
  if (wrongBooks[id]) {
    wrongBooks[id].name = newName || wrongBooks[id].name;
    saveWrongBooks();
    renderWrongBookChips();
    if (currentWrongBookId === id) {
      document.getElementById('wb-current-name').textContent = wrongBooks[id].name;
    }
  }
}

// 删除错题本
function deleteWrongBook(id) {
  if (wrongBooks[id]) {
    if (Object.keys(wrongBooks).length <= 1) {
      alert('至少保留一个错题本');
      return false;
    }
    delete wrongBooks[id];
    saveWrongBooks();
    renderWrongBookChips();

    // 如果被删的是"当前收集本"或"当前打开本"，必须把它们指到仍然存在的错题本，
    // 否则 Proxy 访问 wrongBooks[id] 会拿到 undefined，后续读写立即报
    // "Cannot set property of undefined"，页面整个功能崩溃。
    const ids = Object.keys(wrongBooks);
    const fallback = ids.length > 0 ? ids[0] : null;
    if (!fallback) {
      // 极端情况：全部被删，建一个保底的默认本
      wrongBooks['默认'] = { name: '默认', temp: {}, long: {}, notes: {} };
      targetWrongBookId = '默认';
      currentWrongBookId = '默认';
    } else {
      if (targetWrongBookId === id || !wrongBooks[targetWrongBookId]) {
        targetWrongBookId = fallback;
      }
      if (currentWrongBookId === id || !wrongBooks[currentWrongBookId]) {
        currentWrongBookId = fallback;
      }
    }
    if (targetWrongBookId) localStorage.setItem('defaultWrongBookId', targetWrongBookId);
    saveWrongBooks();

    // 更新首页默认本徽章（若存在）
    const badge = document.getElementById('wb-default-badge-home');
    if (badge && wrongBooks[targetWrongBookId]) badge.textContent = wrongBooks[targetWrongBookId].name;

    return true;
  }
  return false;
}

// 兼容旧代码的访问器 - 使用目标错题本（用户选择的）
// 所有 Proxy 都对 getTargetWB() 结果做非空兜底，避免被删本后读写立即报 undefined 错误
let wrongBookTemp = new Proxy({}, {
  get(target, prop) {
    const wb = getTargetWB();
    return (wb && wb.temp) ? wb.temp[prop] : undefined;
  },
  set(target, prop, value) {
    const wb = getTargetWB();
    if (!wb || !wb.temp) return true;
    wb.temp[prop] = value;
    saveWrongBooks();
    return true;
  },
  deleteProperty(target, prop) {
    const wb = getTargetWB();
    if (wb && wb.temp) delete wb.temp[prop];
    saveWrongBooks();
    return true;
  },
  has(target, prop) {
    const wb = getTargetWB();
    return !!(wb && wb.temp && prop in wb.temp);
  },
  ownKeys(target) {
    const wb = getTargetWB();
    return (wb && wb.temp) ? Object.keys(wb.temp) : [];
  }
});

let wrongBookLong = new Proxy({}, {
  get(target, prop) {
    const wb = getTargetWB();
    return (wb && wb.long) ? wb.long[prop] : undefined;
  },
  set(target, prop, value) {
    const wb = getTargetWB();
    if (!wb || !wb.long) return true;
    wb.long[prop] = value;
    saveWrongBooks();
    return true;
  },
  deleteProperty(target, prop) {
    const wb = getTargetWB();
    if (wb && wb.long) delete wb.long[prop];
    saveWrongBooks();
    return true;
  },
  has(target, prop) {
    const wb = getTargetWB();
    return !!(wb && wb.long && prop in wb.long);
  },
  ownKeys(target) {
    const wb = getTargetWB();
    return (wb && wb.long) ? Object.keys(wb.long) : [];
  }
});

let wrongBookNotes = new Proxy({}, {
  get(target, prop) {
    const wb = getTargetWB();
    return (wb && wb.notes) ? wb.notes[prop] : undefined;
  },
  set(target, prop, value) {
    const wb = getTargetWB();
    if (!wb || !wb.notes) return true;
    wb.notes[prop] = value;
    saveWrongBooks();
    return true;
  },
  deleteProperty(target, prop) {
    const wb = getCurrentWB();
    if (wb && wb.notes) delete wb.notes[prop];
    saveWrongBooks();
    return true;
  },
  has(target, prop) {
    const wb = getTargetWB();
    return !!(wb && wb.notes && prop in wb.notes);
  },
  ownKeys(target) {
    const wb = getTargetWB();
    return (wb && wb.notes) ? Object.keys(wb.notes) : [];
  }
});
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

// 动态加载 segmentit.js（延迟加载，不阻塞主流程）
function loadSegmentitAsync() {
  // 延迟3秒后再加载segmentit，确保页面已经完全渲染
  setTimeout(() => {
    // 显示加载条
    const bar = showSegmentitBar();

    const script = document.createElement('script');
    script.src = 'segmentit.js';
    script.async = true; // 确保异步加载
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
  }, 3000); // 延迟3秒加载，让页面先完全渲染
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
function resetAllStats() {
  // 清空分析数据
  resetAnalysis();
  // 清空答题详情记录（统计图表数据）
  localStorage.removeItem('quizDetailHistory');
  // 刷新统计页面（如果当前在统计标签）
  const statsContainer = document.getElementById('stats-charts');
  if (statsContainer) renderAllCharts(statsContainer, statsTime);
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
    // 先显示加载状态
    const sourceArea = document.getElementById('source-area');
    if (sourceArea) {
      sourceArea.innerHTML = '<div class="source-section"><h3>选择题库</h3><div class="source-chips"><div class="loading">加载中...</div></div></div>';
    }
    
    // 先加载本地数据（错题本等）
    const saved = localStorage.getItem('customDifficulty');
    if (saved) { try { customDifficulty = JSON.parse(saved); } catch(e) {} }
    
    // 加载错题本数据（先尝试新格式，再迁移旧格式）
    const savedBooks = localStorage.getItem('wrongBooks');
    if (savedBooks) {
      try {
        wrongBooks = JSON.parse(savedBooks);
        // 验证数据格式是否正确
        Object.keys(wrongBooks).forEach(id => {
          const wb = wrongBooks[id];
          if (!wb || typeof wb !== 'object') {
            delete wrongBooks[id];
          } else {
            if (!wb.name) wb.name = '未命名错题本';
            if (!wb.temp) wb.temp = {};
            if (!wb.long) wb.long = {};
            if (!wb.notes) wb.notes = {};
          }
        });
      } catch(e) {
        wrongBooks = {};
      }
    } else {
      // 迁移旧数据
      migrateWrongBooks();
    }
    // 确保至少有一个错题本
    if (Object.keys(wrongBooks).length === 0) {
      wrongBooks['default'] = { name: '默认错题本', temp: {}, long: {}, notes: {} };
      saveWrongBooks();
    }
    // 迁移旧版 notes 数据
    const savedNotes = localStorage.getItem('wrongBookNotes');
    if (savedNotes) {
      try {
        const oldNotes = JSON.parse(savedNotes);
        // 将旧 notes 迁移到默认错题本
        if (wrongBooks['default']) {
          Object.assign(wrongBooks['default'].notes, oldNotes);
          saveWrongBooks();
        }
        localStorage.removeItem('wrongBookNotes');
      } catch(e) {}
    }
    // 读取连击设置（迁移旧数据）
    effectsEnabled = getComboEffectsEnabled();
    localStorage.setItem('effectsEnabled', String(effectsEnabled));
    // 如果旧版没有 comboEffectsEnabled，但有效果设置，迁移一下
    if (localStorage.getItem('comboEffectsEnabled') === null && localStorage.getItem('effectsEnabled') !== null) {
      localStorage.setItem('comboEffectsEnabled', localStorage.getItem('effectsEnabled'));
    }
    if (localStorage.getItem('comboSoundEnabled') === null) {
      localStorage.setItem('comboSoundEnabled', 'true');
    }
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

    // 清理旧版 quizHistory 数据（已迁移到按题记录）
    localStorage.removeItem('quizHistory');

    // 初始化目标错题本（用于收集错题）
    const savedSelectedWB = localStorage.getItem('selectedWBForRedo');
    if (savedSelectedWB && wrongBooks[savedSelectedWB]) {
      targetWrongBookId = savedSelectedWB;
    } else {
      targetWrongBookId = getDefaultWrongBookId();
    }

    // 先渲染错题本（不依赖题库数据）
    renderWrongBookChips();
    updateWrongBookCardText();

    // 初始化闯关模式开关
    const savedChallengeSubjective = localStorage.getItem('challengeIncludeSubjective');
    if (savedChallengeSubjective !== null) {
      const checkbox = document.getElementById('challenge-include-subjective');
      if (checkbox) checkbox.checked = savedChallengeSubjective === 'true';
    }

    // 异步加载题库数据（不阻塞UI）
    loadQuizDataAsync();
    
  } catch(e) {
    console.error('Init error:', e);
    document.getElementById('source-area').innerHTML =
      '<div class="loading">加载失败：' + e.message + '<br>请按 F12 查看控制台详情</div>';
  }
}

// 异步加载题库数据
async function loadQuizDataAsync() {
  try {
    const results = await Promise.all(
      QUIZ_SOURCES.map(s => fetch(s.file).then(r => r.json()))
    );
    results.forEach((questions, i) => {
      const name = QUIZ_SOURCES[i].name;
      questions.forEach(q => normalize(q, name));
      sourceData[name] = questions;
    });
    
    // 数据加载完成后渲染
    renderSourceSelector();
    updateActiveQuestions();
    
    // 异步加载 segmentit.js，不阻塞页面渲染
    loadSegmentitAsync();
  } catch(e) {
    console.error('加载题库失败:', e);
    document.getElementById('source-area').innerHTML =
      '<div class="loading">加载题库失败：' + e.message + '</div>';
  }
}

function renderSourceSelector() {
  const area = document.getElementById('source-area');

  let html = '<div class="source-section"><h3>选择题库</h3><div class="source-chips">';
  QUIZ_SOURCES.forEach((s, i) => {
    const all = sourceData[s.name] || [];
    const count = _subjectivePending ? all.filter(q => q.type !== 'subjective').length : all.length;
    const active = sourceSelection[s.name] !== false ? ' active' : '';
    html += '<div class="source-chip' + active + '" data-idx="'+i+'" data-type="source" onclick="toggleSource(this)">' +
      s.name + '<span class="count">(' + count + '题)</span></div>';
  });
  html += '</div></div>';
  area.innerHTML = html;
  
  // 渲染错题本区域
  renderWrongBookChips();
  
  document.getElementById('mode-area').classList.remove('hidden');
  updateActiveQuestions();
}

// 渲染错题本列表
function renderWrongBookChips() {
  const area = document.getElementById('wrongbook-area');
  if (!area) return;
  
  let html = '';
  Object.keys(wrongBooks).forEach(id => {
    const wb = wrongBooks[id];
    const tempCount = Object.keys(wb.temp).length;
    const longCount = Object.keys(wb.long).length;
    const totalCount = tempCount + longCount;
    // 有题目的错题本用绿色，空的用灰色边框样式
    const chipClass = totalCount > 0 ? 'source-chip wb-chip green active' : 'source-chip wb-chip';
    html += '<div class="' + chipClass + '" data-wb-id="' + id + '" onclick="openWrongBook(\'' + id + '\')">' +
      wb.name + '<span class="wb-count">(' + totalCount + '题)</span>' +
      '<span class="count-detail">暂' + tempCount + '/长' + longCount + '</span>' +
      '<span class="wb-actions" onclick="event.stopPropagation()">' +
      '<span class="wb-action-icon" onclick="renameWrongBookPrompt(\'' + id + '\')" title="重命名">✏️</span>' +
      '<span class="wb-action-icon" onclick="deleteWrongBookPrompt(\'' + id + '\')" title="删除">🗑️</span>' +
      '</span></div>';
  });
  // 添加新建按钮
  html += '<div class="wb-add-btn" data-action="create-wb" title="新建错题本">+</div>';
  
  document.getElementById('wrongbook-chips').innerHTML = html;
  area.classList.remove('hidden');
  refreshWrongBookHome();
  
  // 为错题本卡片添加长按事件（移动端）
  setupWBChipLongPress();
  
  // 使用事件委托处理按钮点击
  setupWBChipClickHandlers();
}

// 使用事件委托处理错题本按钮点击
function setupWBChipClickHandlers() {
  const container = document.getElementById('wrongbook-chips');
  if (!container) return;
  
  container.addEventListener('click', (e) => {
    // 新建按钮
    const addBtn = e.target.closest('[data-action="create-wb"]');
    if (addBtn) {
      e.stopPropagation();
      createWrongBookPrompt();
      return;
    }
    
    // 重命名按钮
    const renameBtn = e.target.closest('.wb-action-icon[title="重命名"]');
    if (renameBtn) {
      e.stopPropagation();
      const chip = renameBtn.closest('.wb-chip');
      if (chip && chip.dataset.wbId) {
        renameWrongBookPrompt(chip.dataset.wbId);
      }
      return;
    }
    
    // 删除按钮
    const deleteBtn = e.target.closest('.wb-action-icon[title="删除"]');
    if (deleteBtn) {
      e.stopPropagation();
      const chip = deleteBtn.closest('.wb-chip');
      if (chip && chip.dataset.wbId) {
        deleteWrongBookPrompt(chip.dataset.wbId);
      }
      return;
    }
  });
}

// 为错题本卡片设置长按事件
function setupWBChipLongPress() {
  const chips = document.querySelectorAll('.wb-chip[data-wb-id]');
  let longPressTimer = null;
  let isLongPress = false;
  let activeChip = null;
  
  chips.forEach(chip => {
    const wbId = chip.dataset.wbId;
    
    // 触摸开始
    chip.addEventListener('touchstart', (e) => {
      isLongPress = false;
      activeChip = chip;
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        showWBChipMobileMenu(chip, wbId, e.touches[0].clientX, e.touches[0].clientY);
      }, 500); // 500ms 长按
    }, { passive: true });
    
    // 触摸结束
    chip.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);
      if (isLongPress) {
        e.preventDefault(); // 阻止点击事件
      }
      isLongPress = false;
      activeChip = null;
    });
    
    // 触摸移动（取消长按）
    chip.addEventListener('touchmove', () => {
      clearTimeout(longPressTimer);
      isLongPress = false;
    }, { passive: true });
    
    // 触摸取消
    chip.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      isLongPress = false;
      activeChip = null;
    });
    
    // 鼠标右键（桌面端备用）
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showWBChipMobileMenu(chip, wbId, e.clientX, e.clientY);
    });
  });
}

// 显示移动端错题本操作菜单
function showWBChipMobileMenu(chip, wbId, x, y) {
  const wb = wrongBooks[wbId];
  if (!wb) return;
  
  // 关闭已有菜单
  closeWBChipMobileMenu();
  
  // 创建遮罩
  const backdrop = document.createElement('div');
  backdrop.className = 'wb-chip-mobile-menu-backdrop';
  backdrop.onclick = closeWBChipMobileMenu;
  document.body.appendChild(backdrop);
  
  // 创建菜单
  const menu = document.createElement('div');
  menu.className = 'wb-chip-mobile-menu';
  menu.innerHTML = 
    '<div class="menu-item" onclick="closeWBChipMobileMenu(); renameWrongBookPrompt(\'' + wbId + '\')">' +
    '  <span>✏️</span><span>重命名</span>' +
    '</div>' +
    '<div class="menu-item delete" onclick="closeWBChipMobileMenu(); deleteWrongBookPrompt(\'' + wbId + '\')">' +
    '  <span>🗑️</span><span>删除</span>' +
    '</div>';
  
  // 定位菜单（确保不超出屏幕）
  const menuWidth = 140;
  const menuHeight = 100;
  let left = x - menuWidth / 2;
  let top = y - menuHeight / 2;
  
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;
  if (top < 10) top = 10;
  if (top + menuHeight > window.innerHeight - 10) top = window.innerHeight - menuHeight - 10;
  
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  
  document.body.appendChild(menu);
  
  // 高亮当前卡片
  chip.classList.add('active');
}

// 关闭移动端菜单
function closeWBChipMobileMenu() {
  const backdrop = document.querySelector('.wb-chip-mobile-menu-backdrop');
  const menu = document.querySelector('.wb-chip-mobile-menu');
  if (backdrop) backdrop.remove();
  if (menu) menu.remove();
  document.querySelectorAll('.wb-chip.active').forEach(c => c.classList.remove('active'));
}

// 自定义 prompt 对话框
let customPromptCallback = null;

function showCustomPrompt(title, defaultValue, callback) {
  const overlay = document.getElementById('custom-prompt-overlay');
  const titleEl = document.getElementById('custom-prompt-title');
  const inputEl = document.getElementById('custom-prompt-input');
  
  if (!overlay || !titleEl || !inputEl) {
    // 如果 DOM 元素不存在，回退到原生 prompt
    const result = prompt(title, defaultValue);
    callback(result);
    return;
  }
  
  customPromptCallback = callback;
  titleEl.textContent = title;
  inputEl.value = defaultValue || '';
  inputEl.placeholder = defaultValue || '';
  overlay.classList.remove('hidden');
  inputEl.focus();
  inputEl.select();
  
  // 回车确认
  inputEl.onkeydown = (e) => {
    if (e.key === 'Enter') {
      closeCustomPrompt(true);
    } else if (e.key === 'Escape') {
      closeCustomPrompt(false);
    }
  };
}

function closeCustomPrompt(confirmed) {
  const overlay = document.getElementById('custom-prompt-overlay');
  const inputEl = document.getElementById('custom-prompt-input');
  
  if (!overlay) return;
  
  overlay.classList.add('hidden');
  
  if (customPromptCallback) {
    if (confirmed && inputEl) {
      customPromptCallback(inputEl.value);
    } else {
      customPromptCallback(null);
    }
    customPromptCallback = null;
  }
}

// 提示创建新错题本
function createWrongBookPrompt() {
  showCustomPrompt('请输入错题本名称：', '新错题本', (name) => {
    if (name && name.trim()) {
      createWrongBook(name.trim());
    }
  });
}

// 提示重命名错题本
function renameWrongBookPrompt(id) {
  const wb = wrongBooks[id];
  if (!wb) return;
  showCustomPrompt('请输入新名称：', wb.name, (name) => {
    if (name && name.trim()) {
      renameWrongBook(id, name.trim());
    }
  });
}

// 提示删除错题本
function deleteWrongBookPrompt(id) {
  const wb = wrongBooks[id];
  if (!wb) return;
  if (confirm('确定要删除错题本"' + wb.name + '"吗？其中的所有题目将被清空。')) {
    if (deleteWrongBook(id)) {
      // 如果删除的是当前打开的错题本，刷新显示
      if (currentWrongBookId === id) {
        const ids = Object.keys(wrongBooks);
        if (ids.length > 0) {
          openWrongBook(ids[0]);
        }
      }
    }
  }
}

// 显示移动题目对话框
let moveQuestionKey = null;
let moveQuestionCat = null;

function showMoveQuestionDialog(key, cat) {
  moveQuestionKey = key;
  moveQuestionCat = cat;
  
  const overlay = document.getElementById('move-to-overlay');
  const listEl = document.getElementById('move-to-list');
  if (!overlay || !listEl) return;
  
  // 生成其他错题本列表
  let html = '';
  Object.keys(wrongBooks).forEach(id => {
    if (id === currentWrongBookId) return; // 跳过当前错题本
    const wb = wrongBooks[id];
    const tempCount = Object.keys(wb.temp).length;
    const longCount = Object.keys(wb.long).length;
    html += '<div class="move-to-item" data-wb-id="' + id + '" onclick="selectMoveQuestionTarget(\'' + id + '\')">' +
      '<span class="move-to-item-name">' + wb.name + ' <small style="opacity:0.6">(暂' + tempCount + '/长' + longCount + ')</small></span>' +
      '<span class="move-to-item-star" id="move-star-' + id + '">☆</span>' +
      '</div>';
  });
  
  if (html === '') {
    html = '<div style="text-align:center;color:#888;padding:20px">没有其他错题本</div>';
  }
  
  listEl.innerHTML = html;
  overlay.classList.remove('hidden');
}

// 选择移动题目目标
function selectMoveQuestionTarget(toId) {
  // 切换选中状态
  document.querySelectorAll('.move-to-item').forEach(item => {
    item.classList.remove('selected');
    const star = item.querySelector('.move-to-item-star');
    if (star) star.classList.remove('active');
  });
  
  const selectedItem = document.querySelector('.move-to-item[data-wb-id="' + toId + '"]');
  if (selectedItem) {
    selectedItem.classList.add('selected');
    const star = document.getElementById('move-star-' + toId);
    if (star) {
      star.classList.add('active');
      star.textContent = '★';
    }
  }
  
  // 执行移动
  if (moveQuestionKey && moveQuestionCat && toId) {
    moveQuestionToWrongBook(moveQuestionKey, moveQuestionCat, toId);
  }
  
  // 关闭对话框
  setTimeout(closeMoveToDialog, 300);
}

// 移动题目到指定错题本
function moveQuestionToWrongBook(key, cat, toId) {
  const fromWB = wrongBooks[currentWrongBookId];
  const toWB = wrongBooks[toId];
  if (!fromWB || !toWB) return;
  
  // 获取题目数据
  const qData = fromWB[cat][key];
  if (!qData) return;
  
  // 移动到目标错题本（保持相同分类）
  toWB[cat][key] = qData;
  
  // 从原错题本移除
  delete fromWB[cat][key];
  
  // 移动备注
  if (fromWB.notes[key]) {
    toWB.notes[key] = fromWB.notes[key];
    delete fromWB.notes[key];
  }
  
  saveWrongBooks();
  
  // 关闭详情浮层
  const detail = document.getElementById('wb-detail');
  if (detail) {
    detail.classList.add('hidden');
    detail.dataset.key = '';
  }
  
  // 刷新显示
  renderWbThreeLevel();
}

// 关闭移动到对话框
function closeMoveToDialog() {
  const overlay = document.getElementById('move-to-overlay');
  if (overlay) overlay.classList.add('hidden');
  moveQuestionKey = null;
  moveQuestionCat = null;
}

// 显示默认错题本选择器
function showDefaultWBSelector() {
  const overlay = document.getElementById('default-wb-overlay');
  const listEl = document.getElementById('default-wb-list');
  if (!overlay || !listEl) return;
  
  const defaultId = localStorage.getItem('defaultWrongBookId') || 'default';
  
  let html = '';
  Object.keys(wrongBooks).forEach(id => {
    const wb = wrongBooks[id];
    const isDefault = id === defaultId;
    html += '<div class="default-wb-item' + (isDefault ? ' active' : '') + '" onclick="setDefaultWrongBook(\'' + id + '\')">' +
      '<span class="default-wb-item-name">' + wb.name + '</span>' +
      '<span class="default-wb-item-check">✓</span>' +
      '</div>';
  });
  
  listEl.innerHTML = html;
  overlay.classList.remove('hidden');
}

// 设置默认错题本
function setDefaultWrongBook(id) {
  if (!wrongBooks[id]) return;

  localStorage.setItem('defaultWrongBookId', id);
  // 同步内存中的收集目标，让新增错题落到新的默认错题本
  targetWrongBookId = id;

  // 更新徽章文字
  const badge = document.getElementById('wb-default-badge');
  if (badge) {
    badge.textContent = wrongBooks[id].name;
  }

  // 更新首页徽章
  const homeBadge = document.getElementById('wb-default-badge-home');
  if (homeBadge) {
    homeBadge.textContent = wrongBooks[id].name;
  }

  // 更新选中状态
  document.querySelectorAll('.default-wb-item').forEach(item => {
    item.classList.remove('active');
  });
  const selected = document.querySelector('.default-wb-item:nth-child(' + (Object.keys(wrongBooks).indexOf(id) + 1) + ')');
  if (selected) selected.classList.add('active');

  closeDefaultWBSelector();
}

// 关闭默认错题本选择器
function closeDefaultWBSelector() {
  const overlay = document.getElementById('default-wb-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// 显示首页默认错题本选择器
function showDefaultWBSelectorHome() {
  const overlay = document.getElementById('default-wb-overlay');
  const listEl = document.getElementById('default-wb-list');
  if (!overlay || !listEl) return;
  
  const defaultId = localStorage.getItem('defaultWrongBookId') || 'default';
  
  let html = '';
  Object.keys(wrongBooks).forEach(id => {
    const wb = wrongBooks[id];
    const isDefault = id === defaultId;
    html += '<div class="default-wb-item' + (isDefault ? ' active' : '') + '" onclick="setDefaultWrongBookHome(\'' + id + '\')">' +
      '<span class="default-wb-item-name">' + wb.name + '</span>' +
      '<span class="default-wb-item-check">✓</span>' +
      '</div>';
  });
  
  listEl.innerHTML = html;
  overlay.classList.remove('hidden');
}

// 设置默认错题本（从首页）
function setDefaultWrongBookHome(id) {
  if (!wrongBooks[id]) return;

  localStorage.setItem('defaultWrongBookId', id);
  // 同步内存中的收集目标，让新增错题落到新的默认错题本
  targetWrongBookId = id;

  // 更新首页徽章
  const badge = document.getElementById('wb-default-badge-home');
  if (badge && wrongBooks[id]) {
    badge.textContent = wrongBooks[id].name;
  }

  // 顺带同步错题本详情页徽章
  const detailBadge = document.getElementById('wb-default-badge');
  if (detailBadge) {
    detailBadge.textContent = wrongBooks[id].name;
  }

  // 更新重做错题卡片显示
  updateWrongBookCardText();

  closeDefaultWBSelector();
}

// 获取默认错题本ID
function getDefaultWrongBookId() {
  const saved = localStorage.getItem('defaultWrongBookId');
  if (saved && wrongBooks[saved]) return saved;
  const ids = Object.keys(wrongBooks);
  return ids.length > 0 ? ids[0] : null;
}

// 显示选择错题本重做对话框
let selectedWBForRedo = null;

function showSelectWBForRedo() {
  const overlay = document.getElementById('select-wb-redo-overlay');
  const listEl = document.getElementById('select-wb-redo-list');
  if (!overlay || !listEl) return;
  
  // 获取上次选择的错题本或默认
  const savedId = localStorage.getItem('selectedWBForRedo') || getDefaultWrongBookId();
  selectedWBForRedo = savedId;
  
  // 同步含长期记忆开关
  const includeLong = localStorage.getItem('redoIncludeLong') !== 'false';
  const checkbox = document.getElementById('select-wb-redo-include-long');
  if (checkbox) checkbox.checked = includeLong;
  
  // 生成列表
  let html = '';
  Object.keys(wrongBooks).forEach(id => {
    const wb = wrongBooks[id];
    const tempCount = Object.keys(wb.temp).length;
    const longCount = Object.keys(wb.long).length;
    const totalCount = tempCount + longCount;
    const isSelected = id === selectedWBForRedo;
    html += '<div class="select-wb-redo-item' + (isSelected ? ' selected' : '') + '" data-wb-id="' + id + '" onclick="selectWBForRedoItem(\'' + id + '\')">' +
      '<span class="select-wb-redo-item-name">' + wb.name + '<span class="select-wb-redo-item-count">(暂' + tempCount + '/长' + longCount + ')</span></span>' +
      '<span class="select-wb-redo-item-star">' + (isSelected ? '★' : '☆') + '</span>' +
      '</div>';
  });
  
  listEl.innerHTML = html;
  overlay.classList.remove('hidden');
}

// 选择错题本项
function selectWBForRedoItem(id) {
  selectedWBForRedo = id;
  
  // 更新选中状态
  document.querySelectorAll('.select-wb-redo-item').forEach(item => {
    item.classList.remove('selected');
    const star = item.querySelector('.select-wb-redo-item-star');
    if (star) star.textContent = '☆';
  });
  
  const selectedItem = document.querySelector('.select-wb-redo-item[data-wb-id="' + id + '"]');
  if (selectedItem) {
    selectedItem.classList.add('selected');
    const star = selectedItem.querySelector('.select-wb-redo-item-star');
    if (star) star.textContent = '★';
  }
}

// 关闭选择错题本对话框
function closeSelectWBForRedo() {
  const overlay = document.getElementById('select-wb-redo-overlay');
  if (overlay) overlay.classList.add('hidden');
  selectedWBForRedo = null;
}

// 确认选择错题本
function confirmSelectWBForRedo() {
  if (!selectedWBForRedo || !wrongBooks[selectedWBForRedo]) {
    closeSelectWBForRedo();
    return;
  }

  // 保存选择
  localStorage.setItem('selectedWBForRedo', selectedWBForRedo);

  // 设置目标错题本（用于收集错题）
  targetWrongBookId = selectedWBForRedo;

  // 保存含长期记忆设置
  const checkbox = document.getElementById('select-wb-redo-include-long');
  if (checkbox) {
    localStorage.setItem('redoIncludeLong', String(checkbox.checked));
    // 同步到主开关
    const mainCheckbox = document.getElementById('wb-include-long');
    if (mainCheckbox) mainCheckbox.checked = checkbox.checked;
  }

  // 更新卡片显示
  updateWrongBookCardText();

  closeSelectWBForRedo();
}

// 重命名当前打开的错题本
function renameCurrentWrongBook() {
  if (currentWrongBookId) {
    renameWrongBookPrompt(currentWrongBookId);
  }
}

// 删除当前打开的错题本
function deleteCurrentWrongBook() {
  if (currentWrongBookId) {
    deleteWrongBookPrompt(currentWrongBookId);
  }
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
    if (isNaN(idx) || idx < 0 || idx >= QUIZ_SOURCES.length) return; // 安全检查
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
  // Update wrong book card - 始终启用卡片，根据选择的错题本更新上半部分状态
  updateWrongBookCardText();
  // 更新闯关模式卡片
  updateChallengeCardText();
}
function updateWrongBookCardText() {
  // 获取选择的错题本
  const selectedId = localStorage.getItem('selectedWBForRedo') || getDefaultWrongBookId();
  const wb = wrongBooks[selectedId];
  const card = document.getElementById('card-wrongbook');
  
  if (!wb) return;
  
  const includeLong = document.getElementById('wb-include-long')?.checked ?? true;
  const tempCount = Object.keys(wb.temp).length;
  const longCount = Object.keys(wb.long).length;
  const totalCount = includeLong ? tempCount + longCount : tempCount;
  
  // 根据选择的错题本是否有题，设置卡片上半部分状态
  const hasQuestions = totalCount > 0;
  if (hasQuestions) {
    card.classList.remove('disabled');
  } else {
    card.classList.add('disabled');
  }
  
  // 更新描述文字
  const descEl = document.getElementById('wb-card-desc');
  if (descEl) {
    if (hasQuestions) {
      descEl.textContent = includeLong
        ? '错题本共 ' + (tempCount + longCount) + ' 道题（暂' + tempCount + ' + 长' + longCount + '）'
        : '暂时错题共 ' + tempCount + ' 道题';
    } else {
      descEl.textContent = '选择的错题本为空';
    }
  }
  
  // 更新选择的错题本名称
  const nameEl = document.getElementById('wb-selected-name');
  if (nameEl) {
    nameEl.textContent = wb.name;
  }
  
  // 更新首页默认错题本徽章
  const homeBadge = document.getElementById('wb-default-badge-home');
  if (homeBadge) {
    const defaultId = getDefaultWrongBookId();
    if (defaultId && wrongBooks[defaultId]) {
      homeBadge.textContent = wrongBooks[defaultId].name;
    }
  }
}

// 更新闯关模式卡片显示
function updateChallengeCardText() {
  const includeSubjective = document.getElementById('challenge-include-subjective')?.checked ?? false;
  const descEl = document.getElementById('challenge-card-desc');

  // 保存设置
  localStorage.setItem('challengeIncludeSubjective', String(includeSubjective));

  if (descEl) {
    if (includeSubjective) {
      const allCount = ALL_QUESTIONS.length;
      const subjectiveCount = ALL_QUESTIONS.filter(q => q.type === 'subjective').length;
      descEl.textContent = '共 ' + allCount + ' 道题（含 ' + subjectiveCount + ' 道主观题）';
    } else {
      const nonSubjectiveCount = ALL_QUESTIONS.filter(q => q.type !== 'subjective').length;
      descEl.textContent = '共 ' + nonSubjectiveCount + ' 道题（不含主观题）';
    }
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

// 判断某题是否在"错题次数最多 Top 15"榜单内（用于紫光提示）
// 返回 true 表示该题位于全站错题次数前 15 名
function isTopWrongQuestion(key) {
  const byQuestion = quizAnalysis && quizAnalysis.byQuestion;
  if (!byQuestion) return false;
  const entries = Object.entries(byQuestion)
    .filter(([, v]) => v && v.countWrong > 0)
    .sort((a, b) => b[1].countWrong - a[1].countWrong);
  if (entries.length === 0) return false;
  const topN = Math.min(15, entries.length);
  for (let i = 0; i < topN; i++) {
    if (entries[i][0] === key) return true;
  }
  return false;
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
    correctTarget = correctTargetEl ? (parseInt(correctTargetEl.value, 10) || 160) : correctTarget;
    useTimer = useTimerEl?.checked ?? useTimer;
    timerSeconds = timerSecondsEl ? (parseInt(timerSecondsEl.value, 10) || 30) : timerSeconds;
    redEffect = redEffectEl?.checked ?? redEffect;
    combo = comboEl?.checked ?? combo;
    shake = shakeEl?.checked ?? shake;
    showNote = showNoteEl?.checked ?? showNote;
  }
  if (wrongLimit < 1) wrongLimit = 1;
  if (correctTarget < 1) correctTarget = 1;
  if (timerSeconds < 5) timerSeconds = 5;
  challengeSettings = { wrongLimit, correctTarget, useTimer, timerSeconds, redEffect, combo, shake, showNote };
  // 同步连击设置
  localStorage.setItem('comboEffectsEnabled', String(combo));
  effectsEnabled = combo;
  localStorage.setItem('effectsEnabled', String(effectsEnabled));
  saveChallengePrefs();
  console.log('[startChallenge] settings=', challengeSettings);

  mode = 'challenge';
  wrongCount = 0; correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];

  // 根据"启用主观题"开关过滤题目
  const includeSubjective = localStorage.getItem('challengeIncludeSubjective') === 'true';
  let questions = getActiveQuestions();
  if (!includeSubjective) {
    questions = questions.filter(q => q.type !== 'subjective');
  }

  quizQueue = shuffle(questions);
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
  const ce = document.getElementById('challenge-correct-target');
  const ute = document.getElementById('challenge-use-timer');
  const tse = document.getElementById('challenge-timer-seconds');
  const re = document.getElementById('challenge-red-effect');
  const coe = document.getElementById('challenge-combo');
  const se = document.getElementById('challenge-shake');
  const sne = document.getElementById('challenge-show-note');
  if (!we) return;
  const p = {
    wrongLimit: parseInt(we.value, 10) || 50,
    correctTarget: ce ? (parseInt(ce.value, 10) || 160) : 160,
    useTimer: ute?.checked ?? true,
    timerSeconds: tse ? (parseInt(tse.value, 10) || 30) : 30,
    redEffect: re?.checked ?? true,
    combo: coe?.checked ?? true,
    shake: se?.checked ?? false,
    showNote: sne?.checked ?? false,
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
    fb.innerHTML = '<div class="feedback wrong">时间已到！正确答案：' + correctText + '</div>';
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
  // 获取选择的错题本
  const selectedId = localStorage.getItem('selectedWBForRedo') || getDefaultWrongBookId();
  const wb = wrongBooks[selectedId];
  
  if (!wb) return;
  
  const includeLong = document.getElementById('wb-include-long')?.checked ?? true;
  const tempQ = Object.values(wb.temp);
  const longQ = includeLong ? Object.values(wb.long) : [];
  const all = tempQ.concat(longQ);
  if (all.length === 0) return;
  
  // 设置当前错题本为选择的那个
  currentWrongBookId = selectedId;
  
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
    wrongBooks: wrongBooks, // 新的多错题本格式
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
      // 支持新的多错题本结构导入
      if (data.wrongBooks) {
        wrongBooks = data.wrongBooks;
        saveWrongBooks();
      } else if (data.wrongBookTemp || data.wrongBookLong || data.wrongBook) {
        // 迁移旧格式数据
        const defaultBook = {
          name: '导入的错题本',
          temp: data.wrongBookTemp || data.wrongBook || {},
          long: data.wrongBookLong || {},
          notes: data.wrongBookNotes || {}
        };
        wrongBooks = { 'default': defaultBook };
        saveWrongBooks();
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
  // 重置错题本 - 保留默认错题本但清空内容
  wrongBooks = { 'default': { name: '默认错题本', temp: {}, long: {}, notes: {} } };
  currentWrongBookId = 'default';
  saveWrongBooks();
  localStorage.removeItem('infiniteProgress');
  localStorage.removeItem('infiniteStats');
  localStorage.removeItem('infiniteSession');
  localStorage.removeItem('customDifficulty');
  // 清除旧格式的数据
  localStorage.removeItem('wrongBookTemp');
  localStorage.removeItem('wrongBookLong');
  localStorage.removeItem('wrongBookNotes');
  localStorage.removeItem('wrongBooks');
  toggleSettings();
  if (mode === 'infinite') {
    quizQueue = shuffle(ALL_QUESTIONS);
    currentIndex = 0;
    renderQuestion();
  }
}

// ====== Streak Effects ======
// —— 连击设置 ——
function getComboEffectsEnabled() {
  const val = localStorage.getItem('comboEffectsEnabled');
  return val !== 'false'; // 默认 true
}
function getComboSoundEnabled() {
  const val = localStorage.getItem('comboSoundEnabled');
  return val !== 'false'; // 默认 true
}

function showComboSettings() {
  document.getElementById('combo-effects-toggle').checked = getComboEffectsEnabled();
  document.getElementById('combo-sound-toggle').checked = getComboSoundEnabled();
  document.getElementById('combo-settings-overlay').classList.remove('hidden');
}

function closeComboSettings() {
  document.getElementById('combo-settings-overlay').classList.add('hidden');
}

function saveComboSettings() {
  const effects = document.getElementById('combo-effects-toggle').checked;
  const sound = document.getElementById('combo-sound-toggle').checked;
  localStorage.setItem('comboEffectsEnabled', String(effects));
  localStorage.setItem('comboSoundEnabled', String(sound));
  effectsEnabled = effects;
  localStorage.setItem('effectsEnabled', String(effects));
}

// ====== Debug Panel（调试工具） ======
// 触发：10 秒内点击 #theme-toggle ≥10 下 → 齿轮集成调试入口（点击齿轮打开调试面板，面板内有"连击设置"入口）
let debugThemeClickTimes = [];   // 记录 #theme-toggle 的点击时间戳
let debugEntryRevealed = false;  // 是否已显示常驻调试入口
let debugEnabled = false;        // 调试总开关
let debugEffectsOverride = null; // null | true | false
let debugSoundOverride = null;   // null | true | false
let debugTimerPausedByUser = false; // 用户通过调试面板暂停计时
let debugPanelDragState = null;  // 拖动状态（{startX, startY, origLeft, origTop}）

// 齿轮点击：未解锁 → 打开连击设置；已解锁 → 打开调试面板
function onComboGearClick() {
  if (debugEntryRevealed) {
    openDebugPanel();
  } else {
    showComboSettings();
  }
}

// 初始化触发监听（在 DOM 加载后绑定）
function initDebugTrigger() {
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      const now = Date.now();
      debugThemeClickTimes = debugThemeClickTimes.filter(t => now - t < 10000);
      debugThemeClickTimes.push(now);
      if (debugThemeClickTimes.length >= 10 && !debugEntryRevealed) {
        revealDebugEntry();
      }
    });
  }
  initDebugPanelDrag();
  initDebugBall();
  restoreDebugBallPos();
}

// 解锁调试入口——改变齿轮外观（加边框/颜色），并自动启用总开关
function revealDebugEntry() {
  debugEntryRevealed = true;
  const gear = document.getElementById('combo-gear-btn');
  if (gear) {
    gear.title = '调试工具（已解锁）';
    gear.style.color = '#6c5ce7';
    gear.style.textShadow = '0 0 6px rgba(108,92,231,0.5)';
    // 短暂放大提示
    gear.style.transition = 'transform .3s';
    gear.style.transform = 'scale(1.6) rotate(90deg)';
    setTimeout(() => { gear.style.transform = ''; }, 600);
  }
  // 自动启用总开关（用户在解锁后即可使用）
  if (!debugEnabled) {
    debugEnabled = true;
    const panelSwitch = document.getElementById('debug-enabled-toggle');
    if (panelSwitch) {
      panelSwitch.checked = true;
      toggleDebugEnabled(true);
    }
  }
  // 移动端显示小球
  const ball = document.getElementById('debug-ball');
  if (ball) {
    ball.classList.remove('hidden');
    syncDebugBall();
    // 短暂放大提示
    const inner = document.getElementById('debug-ball-inner');
    if (inner) {
      inner.style.transition = 'transform .3s';
      inner.style.transform = 'scale(1.4)';
      setTimeout(() => { inner.style.transform = ''; }, 600);
    }
  }
  console.log('[Debug] 调试入口已解锁（移动端：点击小球 / 桌面端：点击 ⚙️）');
}

// 打开调试面板
function openDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  // 关闭小球浮块（如果已展开），避免冲突
  if (typeof closeDebugBallRadial === 'function') closeDebugBallRadial();
  panel.classList.remove('hidden');
  // 同步内嵌特效/音效开关状态（显示用户当前设置）
  const effToggle = document.getElementById('debug-inline-effects');
  const sndToggle = document.getElementById('debug-inline-sound');
  if (effToggle) effToggle.checked = getComboEffectsEnabled();
  if (sndToggle) sndToggle.checked = getComboSoundEnabled();
  // 默认关闭调试总开关
  if (!debugEnabled) {
    const toggle = document.getElementById('debug-enable-toggle');
    if (toggle) toggle.checked = false;
    const body = document.getElementById('debug-panel-body');
    if (body) body.style.opacity = '0.5';
    body && (body.style.pointerEvents = 'none');
  }
  refreshDebugWrongSelect();
}

// 关闭调试面板
function closeDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (panel) panel.classList.add('hidden');
}

// 调试总开关
function toggleDebugEnabled(checked) {
  debugEnabled = checked;
  const body = document.getElementById('debug-panel-body');
  if (body) {
    body.style.opacity = checked ? '1' : '0.5';
    body.style.pointerEvents = checked ? 'auto' : 'none';
  }
  // 同步小球状态
  syncDebugBall();
  if (!checked) {
    // 关闭时清空 override，恢复用户原设置
    debugEffectsOverride = null;
    debugSoundOverride = null;
    const effToggle = document.getElementById('debug-inline-effects');
    const sndToggle = document.getElementById('debug-inline-sound');
    if (effToggle) effToggle.checked = getComboEffectsEnabled();
    if (sndToggle) sndToggle.checked = getComboSoundEnabled();
    // 恢复计时
    if (debugTimerPausedByUser) {
      debugTimerPausedByUser = false;
      const pauseChk = document.getElementById('debug-pause-timer');
      if (pauseChk) pauseChk.checked = false;
      resumeTimersForDebug();
    }
    // 清空答案框
    const ansBox = document.getElementById('debug-answer-box');
    if (ansBox) { ansBox.classList.add('hidden'); ansBox.textContent = ''; }
  }
}

// —— 内嵌连击特效开关 ——
function debugToggleInlineEffects(checked) {
  debugEffectsOverride = checked;
  console.log('[Debug] 连击特效 override →', checked);
}

// —— 内嵌连击音效开关 ——
function debugToggleInlineSound(checked) {
  debugSoundOverride = checked;
  console.log('[Debug] 连击音效 override →', checked);
}

// —— 赋予已正确 X 题（同步累积 streak 并触发连击特效） ——
function debugAddCorrect() {
  if (!debugEnabled) return;
  const n = parseInt(document.getElementById('debug-add-correct').value, 10) || 0;
  correctCount = Math.max(0, (correctCount || 0) + n);
  // 同步累积连击数，让连击特效/音效生效
  streak = Math.max(0, (streak || 0) + n);
  refreshDebugInfo();
  console.log('[Debug] correctCount +=', n, '→', correctCount, '| streak →', streak);
  // 触发连击特效（与正常答对一致）
  if (n > 0) handleStreak();
}

// —— 赋予已错误 X 题（重置连击） ——
function debugAddWrong() {
  if (!debugEnabled) return;
  const n = parseInt(document.getElementById('debug-add-wrong').value, 10) || 0;
  wrongCount = Math.max(0, (wrongCount || 0) + n);
  // 答错重置连击
  streak = 0;
  refreshDebugInfo();
  console.log('[Debug] wrongCount +=', n, '→', wrongCount, '| streak →', streak);
}

// 刷新 quiz-info 显示（不触发 showResult，由用户继续答题时自然判断）
function refreshDebugInfo() {
  if (typeof mode === 'undefined' || !quizQueue) return;
  const q = quizQueue[currentIndex];
  if (!q) return;
  let info = '';
  if (mode === 'challenge') info = '闯关 | 对' + correctCount + ' 错' + wrongCount;
  else if (mode === 'infinite') {
    const mastered = getActiveQuestions().filter(x => infiniteMap[qKey(x)].correctCount >= 3).length;
    info = '无限 | 已掌握 ' + mastered + '/' + getActiveQuestions().length + ' | 已答题 ' + totalAnswered + '/∞';
  }
  else if (mode === 'timed') info = '限时 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  else if (mode === 'wrongbook') info = '错题本 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  const infoEl = document.getElementById('quiz-info');
  if (infoEl) infoEl.textContent = info;
}

// 覆盖 getComboEffectsEnabled / getComboSoundEnabled（在原函数定义之后重写）
// 注意：原函数已通过 function 声明，可在赋值前引用
getComboEffectsEnabled = function() {
  if (debugEnabled && debugEffectsOverride !== null) return debugEffectsOverride;
  return (function() {
    const val = localStorage.getItem('comboEffectsEnabled');
    return val !== 'false';
  })();
};
getComboSoundEnabled = function() {
  if (debugEnabled && debugSoundOverride !== null) return debugSoundOverride;
  return (function() {
    const val = localStorage.getItem('comboSoundEnabled');
    return val !== 'false';
  })();
};

// —— 调出错题（下拉来源：byQuestion 中 countWrong>0 的题，与紫光榜单一致） ——
function refreshDebugWrongSelect() {
  const sel = document.getElementById('debug-wrong-select');
  if (!sel) return;
  sel.innerHTML = '';
  const byQuestion = quizAnalysis && quizAnalysis.byQuestion;
  if (!byQuestion) {
    sel.innerHTML = '<option value="">（暂无错题记录）</option>';
    return;
  }
  const entries = Object.entries(byQuestion)
    .filter(([, v]) => v && v.countWrong > 0)
    .sort((a, b) => b[1].countWrong - a[1].countWrong);
  if (entries.length === 0) {
    sel.innerHTML = '<option value="">（暂无错题记录）</option>';
    return;
  }
  entries.forEach(([key, v]) => {
    const opt = document.createElement('option');
    opt.value = key;
    const preview = (v.question || '').replace(/\s+/g, ' ').slice(0, 30);
    opt.textContent = '[' + v.countWrong + '错] ' + preview;
    sel.appendChild(opt);
  });
}

function debugSummonWrong() {
  if (!debugEnabled) return;
  const sel = document.getElementById('debug-wrong-select');
  if (!sel || !sel.value) return;
  const key = sel.value;
  // 在 ALL_QUESTIONS 中查找该题
  const targetQ = ALL_QUESTIONS.find(q => qKey(q) === key);
  if (!targetQ) {
    console.warn('[Debug] 未找到题目:', key);
    return;
  }
  // 插入到当前位置，下一题即为该题
  quizQueue.splice(currentIndex, 0, targetQ);
  // 重新渲染当前题（即被调出的错题）
  renderQuestion();
  console.log('[Debug] 已调出错题:', key);
}

// —— 暂停计时 ——
function debugTogglePauseTimer(checked) {
  if (!debugEnabled) return;
  debugTimerPausedByUser = checked;
  if (checked) {
    // 暂停所有计时
    timerPaused = true;
    if (perQuestionTimerInterval) {
      clearInterval(perQuestionTimerInterval);
      perQuestionTimerInterval = null;
    }
    console.log('[Debug] 计时已暂停');
  } else {
    resumeTimersForDebug();
  }
  syncDebugBall();
}

function resumeTimersForDebug() {
  timerPaused = false;
  // 闯关模式：重新启动每题倒计时（用剩余时间）
  if (mode === 'challenge' && challengeSettings && challengeSettings.useTimer && perQuestionTimeLeft > 0) {
    const el = document.getElementById('quiz-timer');
    if (el) el.classList.remove('hidden');
    perQuestionTimerActive = true;
    perQuestionTimerInterval = setInterval(() => {
      if (timerPaused) return;
      perQuestionTimeLeft--;
      updatePerQuestionTimerDisplay();
      if (perQuestionTimeLeft <= 0) {
        clearPerQuestionTimer();
        // 时间到，按答错处理
        if (typeof onPerQuestionTimeout === 'function') onPerQuestionTimeout();
      }
    }, 1000);
  }
  console.log('[Debug] 计时已恢复');
}

// —— 显示该题目的答案（不提交） ——
function debugShowAnswer() {
  if (!debugEnabled) return;
  const q = quizQueue && quizQueue[currentIndex];
  if (!q) return;
  const ansBox = document.getElementById('debug-answer-box');
  if (!ansBox) return;
  let text = '';
  if (q.type === 'calculation') {
    const ans = q.answer || {};
    text = '【计算题答案】\n';
    Object.keys(ans).forEach(k => {
      const a = ans[k];
      if (a.scope) text += '第' + k + '问: ' + a.scope[0] + ' ~ ' + a.scope[1];
      else if (a.value !== undefined) text += '第' + k + '问: ' + a.value;
      else text += '第' + k + '问: ' + JSON.stringify(a);
      text += '\n';
    });
  } else if (q.type === 'subjective') {
    const ans = q.answer || {};
    text = '【主观题参考答案】\n' + (ans.reference || JSON.stringify(ans, null, 2));
  } else if (q.type === 'true_false') {
    // 判断题无 shuffle，直接显示
    text = '【答案】' + q.answer;
  } else {
    // 单选/多选：选项已被 shuffle，需显示映射后的答案（与当前屏幕选项一致）
    const fb = document.getElementById('answer-feedback');
    const mappedAnswer = fb && fb.dataset.mappedAnswer ? fb.dataset.mappedAnswer : q.answer;
    text = '【答案】' + mappedAnswer;
    // 附上当前屏幕上对应选项的文字（按 .option 的 data-label 查找）
    const optEls = document.querySelectorAll('.option');
    if (optEls.length) {
      const labels = String(mappedAnswer).split('');
      const matched = labels.map(l => {
        const el = Array.from(optEls).find(e => e.dataset.label === l);
        if (!el) return l;
        // 取 "A. xxx" 中 ". " 之后的内容
        const raw = el.textContent || '';
        const idx = raw.indexOf('. ');
        return idx >= 0 ? l + '. ' + raw.slice(idx + 2) : l + '. ' + raw;
      });
      text += '\n对应：\n' + matched.join('\n');
    }
  }
  ansBox.textContent = text;
  ansBox.classList.remove('hidden');
  console.log('[Debug] 显示答案（未提交）');
}

// —— 调试面板拖动（鼠标 + 触屏） ——
function initDebugPanelDrag() {
  const header = document.getElementById('debug-panel-header');
  const panel = document.getElementById('debug-panel');
  if (!header || !panel) return;

  function startDrag(clientX, clientY, target) {
    if (target.tagName === 'INPUT' || target.classList.contains('debug-panel-close')) return;
    const rect = panel.getBoundingClientRect();
    debugPanelDragState = {
      startX: clientX,
      startY: clientY,
      origLeft: rect.left,
      origTop: rect.top
    };
    panel.style.right = 'auto';
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
  }

  function moveDrag(clientX, clientY) {
    if (!debugPanelDragState) return;
    const dx = clientX - debugPanelDragState.startX;
    const dy = clientY - debugPanelDragState.startY;
    let newLeft = debugPanelDragState.origLeft + dx;
    let newTop = debugPanelDragState.origTop + dy;
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - 40;
    newLeft = Math.max(0, Math.min(maxLeft, newLeft));
    newTop = Math.max(0, Math.min(maxTop, newTop));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  function endDrag() {
    debugPanelDragState = null;
  }

  // 鼠标
  header.addEventListener('mousedown', function(e) {
    startDrag(e.clientX, e.clientY, e.target);
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) { moveDrag(e.clientX, e.clientY); });
  document.addEventListener('mouseup', endDrag);

  // 触屏
  header.addEventListener('touchstart', function(e) {
    const t = e.touches[0];
    if (!t) return;
    startDrag(t.clientX, t.clientY, e.target);
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', function(e) {
    const t = e.touches[0];
    if (!t) return;
    moveDrag(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', endDrag);
  document.addEventListener('touchcancel', endDrag);
}

// ====== Debug Ball（移动端浮动小球 + 放射菜单） ======
let debugBallDragState = null;  // 拖动状态
let debugBallExpanded = false;  // 浮块是否展开
let debugBallActiveParent = null; // 当前激活次级菜单的一级项 key
let debugRadialOffsets = [];     // 浮块相对小球的原始偏移量
let debugRadialOriginalCenter = { x: 0, y: 0 };  // 浮块展开时小球的位置
let debugSubOffsets = [];        // 次级浮块相对一级浮块的偏移量
let debugSubOriginalCenter = { x: 0, y: 0 };  // 次级浮块展开时一级浮块的位置
const DEBUG_RADIAL_ITEMS = [
  { key: 'correct', icon: '✓', label: '赋予对' },
  { key: 'wrong',   icon: '✗', label: '赋予错' },
  { key: 'summon',  icon: '🎯', label: '调出错题' },
  { key: 'effect',  icon: '✨', label: '调特效' },
  { key: 'sound',   icon: '🔔', label: '调音效' },
  { key: 'pause',   icon: '⏸', label: '暂停计时' },
  { key: 'answer',  icon: '👁', label: '答案' }
];

// 一级浮块对应的次级选项
const DEBUG_SUB_ITEMS = {
  correct: [1, 5, 10, 20, 50],
  wrong:   [1, 5, 10, 20, 50],
  summon:  [], // 动态生成：最近错题
  effect:  [
    { v: 3,  label: 'GOOD',     fn: () => debugPlayEffect('good') },
    { v: 10, label: 'PERFECT',  fn: () => debugPlayEffect('perfect') },
    { v: 20, label: 'AWESOME',  fn: () => debugPlayEffect('awesome') },
    { v: 30, label: 'UNBELIEV', fn: () => debugPlayEffect('unbelievable') },
    { v: 40, label: 'FABULOUS', fn: () => debugPlayEffect('fabulous') },
    { v: 50, label: 'MARVELOUS',fn: () => debugPlayEffect('marvelous') }
  ],
  sound:   [
    { label: 'good',        fn: () => playGood() },
    { label: 'wrong',       fn: () => playWrong() },
    { label: 'perfect',     fn: () => playPerfect() },
    { label: 'awesome',     fn: () => playAwesome() },
    { label: 'unbelievable',fn: () => playUnbelievable() },
    { label: 'fabulous',    fn: () => playFabulous() },
    { label: 'marvelous',   fn: () => playMarvelous() }
  ],
  pause:   null,  // 直动
  answer:  null   // 直动
};

// 初始化小球（拖动 + 点击展开）
function initDebugBall() {
  const ball = document.getElementById('debug-ball');
  if (!ball) return;
  let startX = 0, startY = 0, startTime = 0;
  let moved = false;
  const ballSize = 48;
  function clampPos(left, top) {
    const maxLeft = window.innerWidth - ballSize - 4;
    const maxTop = window.innerHeight - ballSize - 4;
    return { left: Math.max(4, Math.min(maxLeft, left)), top: Math.max(4, Math.min(maxTop, top)) };
  }
  function start(clientX, clientY) {
    const rect = ball.getBoundingClientRect();
    startX = clientX; startY = clientY; startTime = Date.now();
    moved = false;
    debugBallDragState = { startX, startY, origLeft: rect.left, origTop: rect.top };
    ball.style.bottom = 'auto';
    ball.style.right = 'auto';
    ball.style.left = rect.left + 'px';
    ball.style.top = rect.top + 'px';
    // 开始拖动时收起所有浮块（避免跟随造成的视觉混乱）
    if (debugBallExpanded) collapseAllDebugRadials();
  }
  function move(clientX, clientY) {
    if (!debugBallDragState) return;
    if (Math.abs(clientX - startX) + Math.abs(clientY - startY) > 6) moved = true;
    const dx = clientX - debugBallDragState.startX;
    const dy = clientY - debugBallDragState.startY;
    const pos = clampPos(debugBallDragState.origLeft + dx, debugBallDragState.origTop + dy);
    ball.style.left = pos.left + 'px';
    ball.style.top = pos.top + 'px';
  }
  function end() {
    if (debugBallDragState) {
      saveDebugBallPos();
      debugBallDragState = null;
    }
    // 拖动结束后，如果浮块原本是展开的则重新计算布局
    if (debugBallExpanded) {
      openDebugBallRadial();
    }
  }
  // 鼠标
  ball.addEventListener('mousedown', function(e) {
    e.preventDefault();
    start(e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', function(e) { if (debugBallDragState) move(e.clientX, e.clientY); });
  // 只有当 mouseup 在小球上时才算 end()，避免点击浮块时误触发
  document.addEventListener('mouseup', function(e) {
    if (debugBallDragState && (e.target === ball || ball.contains(e.target))) end();
  });
  // 触屏
  ball.addEventListener('touchstart', function(e) {
    const t = e.touches[0]; if (!t) return;
    e.preventDefault();
    start(t.clientX, t.clientY);
  }, { passive: false });
  document.addEventListener('touchmove', function(e) {
    if (!debugBallDragState) return;
    const t = e.touches[0]; if (!t) return;
    move(t.clientX, t.clientY);
    e.preventDefault();
  }, { passive: false });
  // 只有 touchend 在小球上时才 end()，避免点击浮块时误触
  document.addEventListener('touchend', function(e) {
    if (debugBallDragState && (e.target === ball || ball.contains(e.target))) {
      end();
      e.preventDefault();
    }
  });
  document.addEventListener('touchcancel', function(e) {
    if (debugBallDragState && (e.target === ball || ball.contains(e.target))) end();
  });
  // 点击（拖动位移 < 6px 才算点击）—— 使用 pointerup 统一处理
  ball.addEventListener('pointerup', function(e) {
    e.stopPropagation();
    if (moved) { moved = false; return; }
    if (Date.now() - startTime > 500) return; // 长按不算点击
    toggleDebugBallRadial();
  });
}

function saveDebugBallPos() {
  const ball = document.getElementById('debug-ball');
  if (!ball) return;
  const left = parseFloat(ball.style.left);
  const top = parseFloat(ball.style.top);
  if (isFinite(left) && isFinite(top)) {
    try { localStorage.setItem('debugBallPos', JSON.stringify({ left, top })); } catch (e) {}
  }
}
function restoreDebugBallPos() {
  try {
    const raw = localStorage.getItem('debugBallPos');
    if (!raw) return;
    const pos = JSON.parse(raw);
    const ball = document.getElementById('debug-ball');
    if (!ball || !pos) return;
    const maxLeft = window.innerWidth - 48 - 4;
    const maxTop = window.innerHeight - 48 - 4;
    const left = Math.max(4, Math.min(maxLeft, pos.left || 0));
    const top = Math.max(4, Math.min(maxTop, pos.top || 0));
    ball.style.bottom = 'auto';
    ball.style.right = 'auto';
    ball.style.left = left + 'px';
    ball.style.top = top + 'px';
  } catch (e) {}
}

// 同步小球状态（启用/暂停）
function syncDebugBall() {
  const ball = document.getElementById('debug-ball');
  if (!ball) return;
  ball.classList.toggle('is-enabled', debugEnabled);
  ball.classList.toggle('is-paused', debugTimerPausedByUser);
}

// 切换放射菜单
function toggleDebugBallRadial() {
  // 桌面端（>480px）：点击小球直接打开面板
  if (window.innerWidth > 480) {
    if (typeof openDebugPanel === 'function') openDebugPanel();
    return;
  }
  // 移动端：展开/收起放射菜单
  if (debugBallExpanded) closeDebugBallRadial();
  else openDebugBallRadial();
}

function openDebugBallRadial() {
  // 先关闭次级（避免在次级展开时重开一级）
  closeDebugSubRadial();
  const ball = document.getElementById('debug-ball');
  if (!ball) return;
  const rect = ball.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const container = document.getElementById('debug-radial');
  if (!container) return;
  // 关闭调试面板（避免与小球菜单冲突）
  const panel = document.getElementById('debug-panel');
  if (panel && !panel.classList.contains('hidden')) panel.classList.add('hidden');
  container.innerHTML = '';
  container.classList.remove('hidden');
  const itemSize = 56, itemRadius = itemSize / 2;
  const minDistBetween = itemSize + 6; // 浮块中心间距最小值（防止重叠）
  const margin = 8;
  const screenW = window.innerWidth, screenH = window.innerHeight;
  const n = DEBUG_RADIAL_ITEMS.length;
  // 1) 评估小球在视口的位置
  //    - 离最近边的距离
  //    - 离角落的距离
  const distToTop = cy;
  const distToBottom = screenH - cy;
  const distToLeft = cx;
  const distToRight = screenW - cx;
  const minDistToEdge = Math.min(distToTop, distToBottom, distToLeft, distToRight);
  const isCorner = (distToTop < screenH * 0.3 || distToBottom < screenH * 0.3) &&
                   (distToLeft < screenW * 0.3 || distToRight < screenW * 0.3);
  // 2) 决定扇形角度
  //    - 中央（minDistToEdge 大）→ 360° 全圆
  //    - 边缘（一边贴着边）→ 180° 半圆（朝开阔侧）
  //    - 角落 → 90° 扇形（朝对角）
  let arc, startAngle, baseRadius;
  if (!isCorner && minDistToEdge > Math.min(screenW, screenH) * 0.35) {
    // 中央区域 → 360° 全圆
    arc = Math.PI * 2;
    startAngle = -Math.PI / 2; // 顶部起
    baseRadius = Math.min(screenW, screenH) * 0.3;
  } else if (isCorner) {
    // 角落 → 90° 扇形，朝对角
    arc = Math.PI / 2;
    if (cx > screenW / 2 && cy > screenH / 2) startAngle = -Math.PI;       // 右下 → 扇形指向左上
    else if (cx < screenW / 2 && cy < screenH / 2) startAngle = 0;         // 左上 → 扇形指向右下
    else if (cx > screenW / 2 && cy < screenH / 2) startAngle = -Math.PI / 2; // 右上 → 扇形指向左下
    else startAngle = -Math.PI / 2;                                          // 左下 → 扇形指向右上
    baseRadius = 80;
  } else {
    // 边缘 → 180° 半圆，朝开阔侧
    arc = Math.PI;
    if (distToTop < distToBottom) {
      // 贴上边 → 向下半圆
      startAngle = 0;
    } else {
      // 贴下边 → 向上半圆
      startAngle = -Math.PI;
    }
    if (distToLeft < distToRight) {
      // 贴左边 → 弧度偏移
      startAngle += Math.PI / 2;
    } else {
      startAngle -= Math.PI / 2;
    }
    baseRadius = 80;
  }
  // 3) 排斥算法：先按理想位置放置，然后用基于距离的斥力做几次迭代
  // 初始角度分布
  let positions = [];
  if (arc >= Math.PI * 2 - 0.01) {
    // 360°：按 n 等分
    for (let i = 0; i < n; i++) {
      const a = startAngle + (arc / n) * i;
      positions.push({ x: cx + baseRadius * Math.cos(a), y: cy + baseRadius * Math.sin(a) });
    }
  } else {
    // 扇形/半圆
    for (let i = 0; i < n; i++) {
      const a = startAngle + (arc / (n - 1)) * i;
      positions.push({ x: cx + baseRadius * Math.cos(a), y: cy + baseRadius * Math.sin(a) });
    }
  }
  // 边界修正
  function clampToScreen(p) {
    return {
      x: Math.max(margin + itemRadius, Math.min(screenW - margin - itemRadius, p.x)),
      y: Math.max(margin + itemRadius, Math.min(screenH - margin - itemRadius, p.y))
    };
  }
  positions = positions.map(clampToScreen);
  // 排斥迭代：每个浮块相对其他浮块产生斥力
  const iters = 8;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDistBetween && d > 0.1) {
          const push = (minDistBetween - d) / 2;
          const nx = dx / d, ny = dy / d;
          positions[i].x -= nx * push;
          positions[i].y -= ny * push;
          positions[j].x += nx * push;
          positions[j].y += ny * push;
        }
      }
      // 也让浮块远离小球中心（避免遮住球）
      const dxc = positions[i].x - cx;
      const dyc = positions[i].y - cy;
      const dc = Math.sqrt(dxc * dxc + dyc * dyc);
      const minDC = 50;
      if (dc < minDC && dc > 0.1) {
        const push = (minDC - dc) / 2;
        positions[i].x += (dxc / dc) * push;
        positions[i].y += (dyc / dc) * push;
      }
      positions[i] = clampToScreen(positions[i]);
    }
  }
  // 4) 创建浮块——保存每个浮块相对小球的"原始相对位置"和"原始小球中心"
  debugRadialOffsets = positions.map(p => ({ dx: p.x - cx, dy: p.y - cy }));
  debugRadialOriginalCenter = { x: cx, y: cy };
  DEBUG_RADIAL_ITEMS.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'debug-radial-item';
    el.innerHTML = '<div class="ri-icon">' + item.icon + '</div><div class="ri-label">' + item.label + '</div>';
    el.style.left = positions[i].x + 'px';
    el.style.top = positions[i].y + 'px';
    el.style.pointerEvents = 'auto';
    el.dataset.debugKey = item.key;
    // pointerup 兼容触屏和鼠标
    el.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      e.preventDefault();
      onDebugRadialClick(item.key, el);
    });
    // click 阻止冒泡（防止触发 mask 关闭）
    el.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 30 + i * 25);
  });
  showDebugMask();
  debugBallExpanded = true;
  debugBallActiveParent = null;
}

// 浮块跟随小球移动：根据保存的偏移量 + 小球新位置
function updateDebugRadialPosition() {
  if (!debugBallExpanded) return;
  const ball = document.getElementById('debug-ball');
  const container = document.getElementById('debug-radial');
  if (!ball || !container) return;
  const rect = ball.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const screenW = window.innerWidth, screenH = window.innerHeight;
  const margin = 8, itemRadius = 28;
  const dx0 = cx - debugRadialOriginalCenter.x;
  const dy0 = cy - debugRadialOriginalCenter.y;
  const items = container.querySelectorAll('.debug-radial-item');
  items.forEach((el, i) => {
    const off = debugRadialOffsets[i];
    if (!off) return;
    let nx = debugRadialOriginalCenter.x + off.dx + dx0;
    let ny = debugRadialOriginalCenter.y + off.dy + dy0;
    // 边界修正（保证浮块不越出视口）
    nx = Math.max(margin + itemRadius, Math.min(screenW - margin - itemRadius, nx));
    ny = Math.max(margin + itemRadius, Math.min(screenH - margin - itemRadius, ny));
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
  });
}

function closeDebugBallRadial() {
  const container = document.getElementById('debug-radial');
  if (container) {
    Array.from(container.children).forEach(el => el.classList.remove('show'));
    setTimeout(() => { if (container) container.classList.add('hidden'); }, 200);
  }
  closeDebugSubRadial();
  hideDebugMask();
  debugBallExpanded = false;
  debugBallActiveParent = null;
}

// 只清空浮块 DOM（不修改 debugBallExpanded，用于拖动时临时收起）
function collapseAllDebugRadials() {
  const container = document.getElementById('debug-radial');
  if (container) {
    Array.from(container.children).forEach(el => el.classList.remove('show'));
    setTimeout(() => {
      if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
      }
    }, 150);
  }
  closeDebugSubRadial();
  hideDebugMask();
  debugBallActiveParent = null;
}

function showDebugMask() {
  let mask = document.getElementById('debug-radial-mask');
  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'debug-radial-mask';
    mask.className = 'debug-radial-mask';
    mask.addEventListener('click', closeDebugBallRadial);
    document.body.appendChild(mask);
  }
  mask.classList.add('show');
}
function hideDebugMask() {
  const mask = document.getElementById('debug-radial-mask');
  if (mask) mask.classList.remove('show');
}

function onDebugRadialClick(key, parentEl) {
  if (!debugEnabled) {
    // 提示：调试未启用
    const inner = document.getElementById('debug-ball-inner');
    if (inner) {
      const old = inner.textContent;
      inner.textContent = '!';
      setTimeout(() => { inner.textContent = old; }, 600);
    }
    return;
  }
  const sub = DEBUG_SUB_ITEMS[key];
  if (sub === null) {
    // 直动（pause/answer）：执行后不关闭浮块，让用户继续切换
    runDebugAction(key, null);
    return;
  }
  if (debugBallActiveParent === key) {
    closeDebugSubRadial();
    // 重新显示一级浮块
    showAllRadialItems();
    return;
  }
  // 隐藏一级浮块，再展开次级浮块（避免重叠）
  hideAllRadialItems();
  showDebugSubRadial(key, parentEl);
}

// 隐藏所有一级浮块（次级浮块展开时使用）
function hideAllRadialItems() {
  const container = document.getElementById('debug-radial');
  if (!container) return;
  const items = container.querySelectorAll('.debug-radial-item');
  items.forEach(el => {
    el.classList.add('hidden-by-sub');
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
  });
}
// 重新显示一级浮块（次级浮块关闭时使用）
function showAllRadialItems() {
  const container = document.getElementById('debug-radial');
  if (!container) return;
  const items = container.querySelectorAll('.debug-radial-item');
  items.forEach(el => {
    el.classList.remove('hidden-by-sub');
    el.style.opacity = '';
    el.style.pointerEvents = '';
  });
}

function showDebugSubRadial(key, parentEl) {
  const container = document.getElementById('debug-subradial');
  if (!container) return;
  container.innerHTML = '';
  container.classList.remove('hidden');
  debugBallActiveParent = key;
  let items;
  if (key === 'correct' || key === 'wrong') {
    items = DEBUG_SUB_ITEMS[key].map(n => ({
      icon: n >= 50 ? '🏆' : (n >= 20 ? '⭐' : (n >= 10 ? '✨' : '💯')),
      label: (key === 'correct' ? '+' : '-') + n,
      fn: () => {
        if (key === 'correct') { correctCount = Math.max(0, (correctCount || 0) + n); streak = Math.max(0, (streak || 0) + n); refreshDebugInfo(); if (n > 0) handleStreak(); }
        else { wrongCount = Math.max(0, (wrongCount || 0) + n); streak = 0; refreshDebugInfo(); }
        syncDebugBall();
      }
    }));
  } else if (key === 'summon') {
    // 动态生成：最近 5 道错题
    const byQuestion = (quizAnalysis && quizAnalysis.byQuestion) || {};
    const entries = Object.entries(byQuestion).filter(([, v]) => v && v.countWrong > 0)
      .sort((a, b) => b[1].countWrong - a[1].countWrong).slice(0, 5);
    if (entries.length === 0) {
      items = [{ icon: '😶', label: '暂无', fn: () => {} }];
    } else {
      items = entries.map(([k, v]) => ({
        icon: '📝',
        label: (v.question || '').replace(/\s+/g, ' ').slice(0, 4),
        fn: () => {
          const targetQ = ALL_QUESTIONS.find(q => qKey(q) === k);
          if (targetQ) { quizQueue.splice(currentIndex, 0, targetQ); renderQuestion(); }
        }
      }));
    }
  } else {
    // effect / sound：把原 label 转为 icon + label
    items = DEBUG_SUB_ITEMS[key].map(it => {
      const text = it.label;
      const isEffect = key === 'effect';
      // 取前 3-4 个字符作 label（图上 +1, +5, GOOD 等）
      let short = text;
      if (isEffect) {
        const map = { good: '👍', perfect: '🌟', awesome: '💥', unbelievable: '🔥', fabulous: '🎇', marvelous: '🎆' };
        return { icon: map[text] || '✨', label: text.slice(0, 4).toUpperCase(), fn: it.fn };
      } else {
        // sound
        const map = { good: '🔊', wrong: '🔉', perfect: '🎵', awesome: '🎶', unbelievable: '🎼', fabulous: '🎤', marvelous: '🎸' };
        return { icon: map[text] || '🔔', label: text.slice(0, 4), fn: it.fn };
      }
    });
  }
  // 一级浮块中心为锚点
  const parentRect = parentEl.getBoundingClientRect();
  const px = parentRect.left + parentRect.width / 2;
  const py = parentRect.top + parentRect.height / 2;
  const screenW = window.innerWidth, screenH = window.innerHeight;
  const margin = 8;
  const subW = 56, subH = 56, subRadius = subW / 2;
  const minDistBetween = subW + 6; // 浮块中心间距最小值
  const n = items.length;

  // 用小球中心作为圆心（次级浮块围着小球）
  const ball = document.getElementById('debug-ball');
  const bRect = ball ? ball.getBoundingClientRect() : null;
  const cx = bRect ? bRect.left + bRect.width / 2 : px;
  const cy = bRect ? bRect.top + bRect.height / 2 : py;

  // 检测圆心（小球）在视口的位置
  const distToTop = cy, distToBottom = screenH - cy;
  const distToLeft = cx, distToRight = screenW - cx;
  const minDistToEdge = Math.min(distToTop, distToBottom, distToLeft, distToRight);
  const isCorner = (distToTop < screenH * 0.3 || distToBottom < screenH * 0.3) &&
                   (distToLeft < screenW * 0.3 || distToRight < screenW * 0.3);
  // 决定扇形角度
  let arc, startAngle, baseRadius;
  if (!isCorner && minDistToEdge > Math.min(screenW, screenH) * 0.35) {
    arc = Math.PI * 2;
    startAngle = -Math.PI / 2;
    baseRadius = Math.min(screenW, screenH) * 0.3;
  } else if (isCorner) {
    arc = Math.PI / 2;
    if (cx > screenW / 2 && cy > screenH / 2) startAngle = -Math.PI;
    else if (cx < screenW / 2 && cy < screenH / 2) startAngle = 0;
    else if (cx > screenW / 2 && cy < screenH / 2) startAngle = -Math.PI / 2;
    else startAngle = -Math.PI / 2;
    baseRadius = 70;
  } else {
    arc = Math.PI;
    if (distToTop < distToBottom) startAngle = 0;
    else startAngle = -Math.PI;
    if (distToLeft < distToRight) startAngle += Math.PI / 2;
    else startAngle -= Math.PI / 2;
    baseRadius = 70;
  }
  // 初始位置（绕小球中心 cx,cy）
  let positions = [];
  if (arc >= Math.PI * 2 - 0.01) {
    for (let i = 0; i < n; i++) {
      const a = startAngle + (arc / n) * i;
      positions.push({ x: cx + baseRadius * Math.cos(a), y: cy + baseRadius * Math.sin(a) });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = startAngle + (arc / (n - 1)) * i;
      positions.push({ x: cx + baseRadius * Math.cos(a), y: cy + baseRadius * Math.sin(a) });
    }
  }
  // 边界修正
  function clampToScreen(p) {
    return {
      x: Math.max(margin + subRadius, Math.min(screenW - margin - subRadius, p.x)),
      y: Math.max(margin + subH/2, Math.min(screenH - margin - subH/2, p.y))
    };
  }
  positions = positions.map(clampToScreen);
  // 排斥迭代
  const iters = 8;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDistBetween && d > 0.1) {
          const push = (minDistBetween - d) / 2;
          const nx = dx / d, ny = dy / d;
          positions[i].x -= nx * push;
          positions[i].y -= ny * push;
          positions[j].x += nx * push;
          positions[j].y += ny * push;
        }
      }
      // 远离小球中心（不挡住球）
      const dxc = positions[i].x - cx;
      const dyc = positions[i].y - cy;
      const dc = Math.sqrt(dxc * dxc + dyc * dyc);
      const minDC = 60;
      if (dc < minDC && dc > 0.1) {
        const push = (minDC - dc) / 2;
        positions[i].x += (dxc / dc) * push;
        positions[i].y += (dyc / dc) * push;
      }
      positions[i] = clampToScreen(positions[i]);
    }
  }
  // 创建浮块
  items.forEach((it, i) => {
    const el = document.createElement('div');
    el.className = 'debug-subradial-item';
    el.innerHTML = '<div class="ri-icon">' + (it.icon || '•') + '</div><div class="ri-label">' + (it.label || '') + '</div>';
    el.style.left = positions[i].x + 'px';
    el.style.top = positions[i].y + 'px';
    el.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      e.preventDefault();
      try { it.fn(); } catch (err) { console.error(err); }
      // 只收起次级浮块，保留一级浮块，方便继续操作其他功能
      closeDebugSubRadial();
    });
    el.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    container.appendChild(el);
    setTimeout(() => el.classList.add('show'), 20 + i * 18);
  });
  // 保存偏移量供小球拖动时跟随
  const items2 = container.querySelectorAll('.debug-subradial-item');
  debugSubOffsets = Array.from(items2).map(el => {
    const rect = el.getBoundingClientRect();
    return { dx: rect.left + rect.width/2 - cx, dy: rect.top + rect.height/2 - cy };
  });
  debugSubOriginalCenter = { x: cx, y: cy };
}

// 浮块跟随小球移动：根据保存的偏移量 + 小球新位置
function updateDebugRadialPosition() {
  if (!debugBallExpanded) return;
  const ball = document.getElementById('debug-ball');
  const container = document.getElementById('debug-radial');
  if (!ball || !container) return;
  const rect = ball.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const screenW = window.innerWidth, screenH = window.innerHeight;
  const margin = 8, itemRadius = 28;
  const dx0 = cx - debugRadialOriginalCenter.x;
  const dy0 = cy - debugRadialOriginalCenter.y;
  const items = container.querySelectorAll('.debug-radial-item');
  items.forEach((el, i) => {
    const off = debugRadialOffsets[i];
    if (!off) return;
    let nx = debugRadialOriginalCenter.x + off.dx + dx0;
    let ny = debugRadialOriginalCenter.y + off.dy + dy0;
    // 边界修正（保证浮块不越出视口）
    nx = Math.max(margin + itemRadius, Math.min(screenW - margin - itemRadius, nx));
    ny = Math.max(margin + itemRadius, Math.min(screenH - margin - itemRadius, ny));
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
  });
  // 次级浮块跟着小球移动（偏移量已存为相对小球中心）
  if (debugBallActiveParent && debugSubOffsets.length > 0) {
    const subContainer = document.getElementById('debug-subradial');
    if (subContainer) {
      const subItems = subContainer.querySelectorAll('.debug-subradial-item');
      subItems.forEach((el, i) => {
        const off = debugSubOffsets[i];
        if (!off) return;
        const subW = 56, subH = 56;
        const halfW = subW / 2, halfH = subH / 2;
        // 用小球当前位置 + 原偏移
        let nx = cx + off.dx;
        let ny = cy + off.dy;
        nx = Math.max(margin + halfW, Math.min(screenW - margin - halfW, nx));
        ny = Math.max(margin + halfH, Math.min(screenH - margin - halfH, ny));
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
      });
    }
  }
}

function closeDebugSubRadial() {
  const container = document.getElementById('debug-subradial');
  if (container) {
    Array.from(container.children).forEach(el => el.classList.remove('show'));
    setTimeout(() => { if (container) container.classList.add('hidden'); }, 180);
  }
  debugBallActiveParent = null;
  // 重新显示一级浮块
  showAllRadialItems();
}

function runDebugAction(key, val) {
  if (key === 'pause') {
    debugTogglePauseTimer(!debugTimerPausedByUser);
    const pauseChk = document.getElementById('debug-pause-timer');
    if (pauseChk) pauseChk.checked = debugTimerPausedByUser;
  } else if (key === 'answer') {
    debugShowAnswer();
  }
}

// 调特效：按指定 streak 渲染对应效果（复用 triggerPerfect 内部逻辑）
function debugPlayEffect(kind) {
  if (getComboEffectsEnabled() === false) return;
  // 暂存并设置 streak
  const orig = streak;
  const map = { good: 3, perfect: 10, awesome: 20, unbelievable: 30, fabulous: 40, marvelous: 50 };
  streak = map[kind] || orig;
  // 创建文字
  const text = getComboText(streak);
  if (text) {
    const p = document.createElement('div');
    p.className = 'perfect-text';
    p.textContent = text;
    document.body.appendChild(p);
  }
  // 金光 / 掉落
  if (streak >= 30) {
    const card = document.querySelector('.quiz-card');
    if (card) {
      card.classList.remove('gold-glow');
      void card.offsetWidth;
      card.classList.add('gold-glow');
    }
    setTimeout(() => {
      if (card) card.classList.remove('gold-glow');
      const components = document.querySelectorAll('.quiz-header, .quiz-card, #quiz-btns, .answer-feedback.show');
      components.forEach((el, i) => {
        el.style.transition = 'none';
        el.classList.add('falling');
        el.style.animationDelay = (i * 0.08) + 's';
      });
      setTimeout(() => {
        components.forEach(el => {
          el.classList.remove('falling');
          el.style.transition = '';
          el.style.animationDelay = '';
        });
      }, 800);
    }, 800);
  } else if (streak >= 10) {
    const components = document.querySelectorAll('.quiz-header, .quiz-card, #quiz-btns, .answer-feedback.show');
    components.forEach((el, i) => {
      el.style.transition = 'none';
      el.classList.add('falling');
      el.style.animationDelay = (i * 0.08) + 's';
    });
    setTimeout(() => {
      components.forEach(el => {
        el.classList.remove('falling');
        el.style.transition = '';
        el.style.animationDelay = '';
      });
    }, 1500);
  } else if (streak >= 3) {
    const card = document.querySelector('.quiz-card');
    if (card) {
      card.classList.remove('streak-glow');
      void card.offsetWidth;
      card.classList.add('streak-glow');
      setTimeout(() => card.classList.remove('streak-glow'), 700);
    }
  }
  // 自动移除文字
  setTimeout(() => {
    document.querySelectorAll('.perfect-text').forEach(el => el.remove());
  }, streak >= 30 ? 2000 : 1500);
  // 恢复原 streak（避免影响正常答题判断）
  streak = orig;
}

// 根据连击次数获取显示文字
function getComboText(streakCount) {
  if (streakCount >= 50) return 'Marvelous!';
  if (streakCount >= 40) return 'Fabulous!';
  if (streakCount >= 30) return 'Unbelievable!';
  if (streakCount >= 20) return 'Awesome!';
  if (streakCount >= 10) return 'Perfect!';
  if (streakCount >= 3) return 'GOOD';
  return '';
}

function triggerPerfect() {
  // 只有在节点值才触发：3,10,20,30,40,50
  const triggers = [3, 10, 20, 30, 40, 50];
  if (!triggers.includes(streak)) return;

  const text = getComboText(streak);
  if (!text) return;
  const p = document.createElement('div');
  p.className = 'perfect-text';
  p.textContent = text;
  document.body.appendChild(p);

  // 30连及以上：先放金光，再掉落
  if (streak >= 30) {
    const card = document.querySelector('.quiz-card');
    if (card) {
      card.classList.remove('gold-glow');
      void card.offsetWidth;
      card.classList.add('gold-glow');
    }
    if (getComboSoundEnabled()) {
      if (streak >= 50) setTimeout(playMarvelous, 200);
      else if (streak >= 40) setTimeout(playFabulous, 200);
      else if (streak >= 30) setTimeout(playUnbelievable, 200);
    }
    setTimeout(() => {
      if (card) card.classList.remove('gold-glow');
      const components = document.querySelectorAll('.quiz-header, .quiz-card, #quiz-btns, .answer-feedback.show');
      components.forEach((el, i) => {
        el.style.transition = 'none';
        el.classList.add('falling');
        el.style.animationDelay = (i * 0.08) + 's';
      });
      setTimeout(() => {
        components.forEach(el => {
          el.classList.remove('falling');
          el.style.transition = '';
          el.style.animationDelay = '';
        });
      }, 800);
    }, 800);
  } else if (streak >= 10) {
    // 10-29连：直接掉落
    const components = document.querySelectorAll('.quiz-header, .quiz-card, #quiz-btns, .answer-feedback.show');
    components.forEach((el, i) => {
      el.style.transition = 'none';
      el.classList.add('falling');
      el.style.animationDelay = (i * 0.08) + 's';
    });
    if (getComboSoundEnabled()) {
      if (streak >= 20) setTimeout(playAwesome, 200);
      else if (streak >= 10) setTimeout(playPerfect, 200);
    }
    setTimeout(() => {
      components.forEach(el => {
        el.classList.remove('falling');
        el.style.transition = '';
        el.style.animationDelay = '';
      });
    }, 1500);
  } else {
    // 3连=GOOD，只放音效不掉落
    if (getComboSoundEnabled()) {
      playGood();
    }
  }

  if (streak < 30) {
    setTimeout(() => {
      p.remove();
    }, 1500);
  } else {
    setTimeout(() => {
      p.remove();
    }, 2000);
  }
}

function handleStreak() {
  if (getComboEffectsEnabled() === false) return;
  if (streak >= 3) {
    // 30连及以上：不闪绿光，交给triggerPerfect处理金光
    if (streak < 30) {
      const card = document.querySelector('.quiz-card');
      if (card) {
        card.classList.remove('streak-glow');
        void card.offsetWidth;
        card.classList.add('streak-glow');
        setTimeout(() => card.classList.remove('streak-glow'), 700);
      }
    }
    triggerPerfect();
  }
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

  // === 紫光提示：若该题在"错题次数最多 Top 15"榜单且连击特效开启，则卡片持续发紫光，直到作答完成 ===
  const cardEl = document.querySelector('.quiz-card');
  if (cardEl) {
    cardEl.classList.remove('purple-glow');
    if (getComboEffectsEnabled() !== false && isTopWrongQuestion(key)) {
      cardEl.classList.add('purple-glow');
    }
  }

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

  // 作答完成：移除紫光提示
  const judgedCard = document.querySelector('.quiz-card');
  if (judgedCard) judgedCard.classList.remove('purple-glow');

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
    if (getComboSoundEnabled()) playGood();
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '回答错误！正确答案：' + correctAnswer;
    if (getComboSoundEnabled()) playWrong();
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
  logQuizAnswer(q, isCorrect);

  if (isCorrect) {
    correctCount++;
    streak++;
    if (correctCount > 0 && correctCount % 10 === 0) {
      if (getComboSoundEnabled()) setTimeout(playAwesome, 200);
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
    // 多错题本：按当前答题的错题本 (currentWrongBookId) 删除，避免删错其他本
    if (mode === 'wrongbook') {
      const curWb = wrongBooks[currentWrongBookId];
      if (curWb && curWb.temp[key]) {
        delete curWb.temp[key];
        saveWrongBooks();
      }
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
    if (mode === 'wrongbook') {
      // 多错题本：答错 → 写进当前答题的错题本 (currentWrongBookId)
      const curWb = wrongBooks[currentWrongBookId];
      if (curWb && !curWb.long[key] && !curWb.temp[key]) {
        curWb.temp[key] = qObj(q);
        saveWrongBooks();
      }
    } else if (!wrongBookLong[key] && !wrongBookTemp[key]) {
      wrongBookTemp[key] = qObj(q);
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

  // 作答完成：移除紫光提示
  const judgedCard = document.querySelector('.quiz-card');
  if (judgedCard) judgedCard.classList.remove('purple-glow');

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
    if (getComboSoundEnabled()) playGood();
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '部分或全部错误，请查看各问反馈';
    if (getComboSoundEnabled()) playWrong();
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
  logQuizAnswer(q, allCorrect);

  if (allCorrect) {
    correctCount++;
    if (correctCount > 0 && correctCount % 10 === 0) if (getComboSoundEnabled()) setTimeout(playAwesome, 200);
    // 多错题本：答对 → 只移除 temp，保留 long
    if (mode === 'wrongbook') {
      const curWb = wrongBooks[currentWrongBookId];
      if (curWb && curWb.temp[key]) {
        delete curWb.temp[key];
        saveWrongBooks();
      }
    }
  } else {
    wrongCount++;
    wrongList.push({question: q, selectedAnswer: JSON.stringify(Array.from(inputs).map(i => ({qid:i.dataset.qid, val:i.value})))
    });
    // 多错题本：答错 → 写到当前答题的错题本
    if (mode === 'wrongbook') {
      const curWb = wrongBooks[currentWrongBookId];
      if (curWb && !curWb.long[key] && !curWb.temp[key]) {
        curWb.temp[key] = qObj(q);
        saveWrongBooks();
      }
    } else if (!wrongBookLong[key] && !wrongBookTemp[key]) {
      wrongBookTemp[key] = qObj(q);
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

  // 作答完成：移除紫光提示
  const judgedCard = document.querySelector('.quiz-card');
  if (judgedCard) judgedCard.classList.remove('purple-glow');

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
    if (getComboSoundEnabled()) playGood();
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '匹配度 ' + pct + '%';
    if (getComboSoundEnabled()) playWrong();
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
  logQuizAnswer(q, isCorrect);

  if (isCorrect) {
    correctCount++;
    if (correctCount > 0 && correctCount % 10 === 0) if (getComboSoundEnabled()) setTimeout(playAwesome, 200);
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
  if (mode === 'infinite') saveInfiniteProgress();
  if (totalAnswered > 0) showResult();
  else showHome();
}

// ====== Result ======
function showResult() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);
  clearPerQuestionTimer();
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
      // 多选题：检查是否有多选（选了非正确答案）
      const isMulti = q.type === 'multiple_choice';
      let hasExtraSelection = false;
      if (isMulti) {
        for (const opt of (q.options || [])) {
          const label = opt.label || '';
          if (sel.includes(label) && !ans.includes(label)) {
            hasExtraSelection = true;
            break;
          }
        }
      }
      (q.options || []).forEach(opt => {
        const label = opt.label || '';
        const text = opt.text || '';
        const isCorrectOpt = isMulti ? ans.includes(label) : label === ans;
        const isSelected = isMulti ? sel.includes(label) : label === sel;
        let cls = 'detail-opt';
        if (isCorrectOpt) cls += ' correct';
        if (isSelected && !isCorrectOpt) cls += ' wrong';
        // 漏选标记：多选题、是正确答案、没被选中、且用户没有多选
        const isMissing = isMulti && isCorrectOpt && !isSelected && !hasExtraSelection;
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
    // 多选题：检查是否有多选（选了非正确答案）
    const isMulti = q.type === 'multiple_choice';
    let hasExtraSelection = false;
    if (isMulti) {
      for (const opt of (q.options || [])) {
        const label = opt.label || '';
        if (selected.includes(label) && !q.answer.includes(label)) {
          hasExtraSelection = true;
          break;
        }
      }
    }
    (q.options || []).forEach(opt => {
      const label = opt.label || '';
      const text = opt.text || '';
      const isCorrectOpt = isMulti ? q.answer.includes(label) : label === q.answer;
      const isSelected = isMulti ? selected.includes(label) : label === selected;
      let cls = 'review-option';
      if (isCorrectOpt) cls += ' correct';
      else if (isSelected) cls += ' wrong';
      else cls += ' neutral';
      // 漏选标记：多选题、是正确答案、没被选中、且用户没有多选
      const isMissing = isMulti && isCorrectOpt && !isSelected && !hasExtraSelection;
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

// 切换到下一个错题本（按创建时间顺序）
function switchToNextWrongBook() {
  const ids = Object.keys(wrongBooks);
  if (ids.length <= 1) return; // 只有一个或没有，不切换

  // 找到当前索引
  const currentIndex = ids.indexOf(currentWrongBookId);
  // 下一个，循环
  const nextIndex = (currentIndex + 1) % ids.length;
  const nextId = ids[nextIndex];

  // 切换到下一个错题本
  openWrongBook(nextId);
}

function openWrongBook(wbId) {
  // 设置当前错题本
  if (wbId && wrongBooks[wbId]) {
    currentWrongBookId = wbId;
  }

  // 确保有当前错题本
  if (!currentWrongBookId || !wrongBooks[currentWrongBookId]) {
    const ids = Object.keys(wrongBooks);
    if (ids.length === 0) return;
    currentWrongBookId = ids[0];
  }
  
  const wb = getCurrentWB();
  const tempCount = Object.keys(wb.temp).length;
  const longCount = Object.keys(wb.long).length;
  if (tempCount + longCount === 0 && wbId) {
    // 如果是点击特定错题本但为空，仍然打开
  } else if (tempCount + longCount === 0) {
    return;
  }
  
  // 更新页面标题
  const nameEl = document.getElementById('wb-current-name');
  if (nameEl) nameEl.textContent = wb.name;
  
  // 更新默认错题本徽章
  const defaultId = getDefaultWrongBookId();
  const badge = document.getElementById('wb-default-badge');
  if (badge && defaultId && wrongBooks[defaultId]) {
    badge.textContent = wrongBooks[defaultId].name;
  }
  
  wbFilter = 'all';
  wbIndex = 0;
  wbExpanded = { source: {}, cat: {} };
  document.querySelectorAll('.wb-global-tabs .chip').forEach(c => {
    c.classList.remove('active');
  });
  const allChip = document.querySelector('.wb-global-tabs .chip[data-filter="all"]');
  if (allChip) allChip.classList.add('active');
  buildWbGrouped();
  show('page-wrongbook');
  renderWbView();
}

// 按"题库 → 暂时/长期"分组构造数据
function buildWbGrouped() {
  // result: { sources: [{name, temp:[{key,q}], long:[{key,q}], totalCount}] }
  const wb = getCurrentWB();
  const map = new Map();
  function addToMap(q, key, cat) {
    const s = q.source || '未分类';
    if (!map.has(s)) map.set(s, { name: s, temp: [], long: [] });
    const entry = map.get(s);
    entry[cat].push({ key, q });
  }
  Object.entries(wb.temp).forEach(([key, q]) => addToMap(q, key, 'temp'));
  Object.entries(wb.long).forEach(([key, q]) => addToMap(q, key, 'long'));
  const sources = Array.from(map.values())
    .map(s => ({ ...s, totalCount: s.temp.length + s.long.length }))
    .sort((a, b) => b.totalCount - a.totalCount);
  wbGrouped = sources;
}
let wbGrouped = [];

function buildWbList() {
  wbList = [];
  const wb = getCurrentWB();
  const sourceFilter = wbSourceFilter !== 'all' ? wbSourceFilter : null;
  function matches(q) { return !sourceFilter || (q.source || '未分类') === sourceFilter; }
  if (wbFilter === 'all' || wbFilter === 'temp') {
    Object.entries(wb.temp).forEach(([key, q]) => {
      if (matches(q)) wbList.push({ key, q, cat: 'temp' });
    });
  }
  if (wbFilter === 'all' || wbFilter === 'long') {
    Object.entries(wb.long).forEach(([key, q]) => {
      if (matches(q)) wbList.push({ key, q, cat: 'long' });
    });
  }
}

function setWbFilter(el) {
  wbFilter = el.dataset.filter;
  document.querySelectorAll('.wb-global-tabs .chip').forEach(c => {
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
  // analysisEl 必须在 try 之前声明：后续事件委托注册在 try/catch 外面，
  // 若在这里面用 const/let，外面访问会抛 ReferenceError
  const analysisEl = document.getElementById('wb-analysis');
  if (!analysisEl) return;

  try {
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
  function buildBarRow(row, maxVal, color, dataAttr) {
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

    // 把 data-* 同时写到 <div> 和 <svg> 上（SVG 命名空间节点的 closest 在某些内核上有兼容性问题，双层保险）
    const extraHtml = dataAttr ? (' ' + dataAttr) : '';
    const titleHtml = row.title ? ' title="' + escapeAttr(row.title) + '"' : '';

    let svg = '<svg viewBox="0 0 ' + totalWidth + ' ' + totalHeight + '" class="analysis-svg"' + extraHtml + '>';
    svg += '<text class="analysis-svg-label" x="' + (labelWidth - 10) + '" y="' + (barHeight/2 + 4 + 4) + '" text-anchor="end" font-size="14" fill="#333"' + extraHtml + '>' + escapeXml(label) + '</text>';
    svg += '<rect class="analysis-svg-bar" x="' + labelWidth + '" y="4" width="' + barW + '" height="' + barHeight + '" fill="' + color + '" rx="4" ry="4"' + extraHtml + '></rect>';
    svg += '<text class="analysis-svg-value" x="' + (labelWidth + barW + 8) + '" y="' + (barHeight/2 + 4 + 4) + '" font-size="14" fill="#555"' + extraHtml + '>' + escapeXml(valueText) + '</text>';
    svg += '</svg>';

    return '<div class="analysis-row"' + extraHtml + titleHtml + '>' + svg + '</div>';
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
    const slowestOnClick = 'data-analysis-key="' + escapeAttr(slowest.key) + '"';
    slowestHtml = '最久迟疑的题目：<b style="color:#f39c12;cursor:pointer" ' + slowestOnClick + ' title="' + escapeAttr(label) + '">' +
      escapeXml(label.substring(0, 30)) + (label.length > 30 ? '…' : '') + '</b>（最长 ' + slowest.maxHesitation.toFixed(1) + ' 秒）<br>';
  }

  // —— 错题次数最多 Top 10（点击行 → 跳到该题浮窗） ——
  // byQuestion 是其它位置（最久迟疑）已经用过的结构，里面有 {key, chapter, question, countWrong?, maxHesitation}
  // 用 countWrong 排序后取前 10（如果某些题没有 countWrong 字段，视为 0，会自动沉到末尾）
  let mostWrongChart;
  // 取一份只含 (key, chapter, question, countWrong) 的副本，按错次降序
  const mostWrongRows = (byQuestion || [])
    .map(q => ({ key: q.key, chapter: q.chapter, question: q.question, countWrong: q.countWrong || 0 }))
    .filter(q => q.countWrong > 0)
    .sort((a, b) => b.countWrong - a.countWrong)
    .slice(0, 40);
  if (mostWrongRows.length === 0) {
    mostWrongChart = '<div style="color:#999;text-align:center;padding:30px">暂无错题记录</div>';
  } else {
    const maxC = Math.max(...mostWrongRows.map(q => q.countWrong), 1);
    mostWrongChart = mostWrongRows.map(q => {
      const label = (q.chapter ? q.chapter + '·' : '') + q.question;
      const dataAttr = 'data-analysis-key="' + escapeAttr(q.key) + '"';
      return buildBarRow({label: label, value: q.countWrong, title: '错题次数最多：' + label + '（点击查看原题）'}, maxC, '#e74c3c', dataAttr);
    }).join('');
  }

  // —— 迟疑 Top 10 图（每行可点击） ——
  let questionChart;
  const qRows = byQuestion.filter(q => q.maxHesitation > 0).slice(0, 40);
  if (qRows.length === 0) {
    questionChart = '<div style="color:#999;text-align:center;padding:30px">暂无迟疑记录</div>';
  } else {
    const maxH = Math.max(...qRows.map(q => q.maxHesitation), 1);
    questionChart = qRows.map(q => {
      const label = (q.chapter ? q.chapter + '·' : '') + q.question;
      const dataAttr = 'data-analysis-key="' + escapeAttr(q.key) + '"';
      return buildBarRow({label: label, value: q.maxHesitation, title: label}, maxH, '#f39c12', dataAttr);
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
      '<h5 style="margin:8px 0 12px 0;font-size:14px">① 错题次数最多 Top 40（点击可查看原题）</h5>' + mostWrongChart +
    '</div>' +
    '<div style="padding:10px 18px 18px;border-top:1px solid #eee">' +
      '<h5 style="margin:8px 0 12px 0;font-size:14px">② 迟疑最久的题目（Top 40，单位：秒，点击可查看原题）</h5>' + questionChart +
    '</div>' +
    '<div style="padding:6px 18px 18px;text-align:right;border-top:1px solid #eee">' +
    '<button class="btn btn-secondary" onclick="if(confirm(\'确认清空所有分析数据和答题记录？\')){resetAllStats();renderAnalysis();}">清空所有数据</button>' +
    '</div>';
  } catch(e) { console.error('renderAnalysis error:', e); }

  // 事件委托：注册在 analysisEl 上，点击任何带 data-analysis-chapter / data-analysis-key 的节点即跳转。
  // 注意必须放在 try/catch 外面，否则前面任何报错都会导致"不能点"。
  if (analysisEl && !analysisEl.dataset.analysisClickBound) {
    analysisEl.dataset.analysisClickBound = '1';
    console.log('[analysis] 事件委托已注册');

    analysisEl.addEventListener('click', function(e) {
      let node = null;
      let cur = e.target;
      const maxDepth = 20;
      for (let i = 0; i < maxDepth && cur && cur !== analysisEl.parentNode; i++) {
        if (cur.nodeType === 1) {
          const ch = cur.dataset && cur.dataset.analysisChapter;
          const ck = cur.dataset && cur.dataset.analysisKey;
          if (ch || ck) { node = cur; break; }
          const gch = cur.getAttribute && cur.getAttribute('data-analysis-chapter');
          const gck = cur.getAttribute && cur.getAttribute('data-analysis-key');
          if (gch || gck) { node = cur; break; }
        }
        cur = cur.parentNode;
      }
      console.log('[analysis] 点击, target=', e.target, '命中节点=', node);
      if (!node) return;

      const chapterVal = node.getAttribute('data-analysis-chapter');
      const keyVal = node.getAttribute('data-analysis-key');
      try {
        const flashTarget = node.closest ? node.closest('.analysis-row, .analysis-svg') : node;
        if (flashTarget && flashTarget.classList) {
          flashTarget.classList.add('is-flash');
          setTimeout(() => flashTarget.classList.remove('is-flash'), 200);
        }
        console.log('[analysis] 准备跳转, chapter=', chapterVal, 'key=', keyVal);
        if (chapterVal) {
          jumpToAnalysisQuestion({ chapter: chapterVal });
        } else if (keyVal) {
          jumpToAnalysisQuestion(keyVal);
        }
      } catch (err) {
        console.error('[analysis click] 跳转失败:', err);
      }
    });
  }

  // 兜底：也绑一个在 document.body 上的事件委托，
  // 万一 analysisEl 被 innerHTML 覆盖后原监听器也丢了（dataset 被重置），
  // 全局委托仍然能工作。命中条件同上。
  if (!document.body.dataset.analysisGlobalClickBound) {
    document.body.dataset.analysisGlobalClickBound = '1';
    document.body.addEventListener('click', function(e) {
      let node = null;
      let cur = e.target;
      const maxDepth = 20;
      for (let i = 0; i < maxDepth && cur && cur !== document.body.parentNode; i++) {
        if (cur.nodeType === 1) {
          // 只在分析区域内才响应（wb-analysis 容器内）
          if (cur.closest && cur.closest('#wb-analysis') == null) { cur = cur.parentNode; continue; }
          const ch = cur.dataset && cur.dataset.analysisChapter;
          const ck = cur.dataset && cur.dataset.analysisKey;
          if (ch || ck) { node = cur; break; }
          const gch = cur.getAttribute && cur.getAttribute('data-analysis-chapter');
          const gck = cur.getAttribute && cur.getAttribute('data-analysis-key');
          if (gch || gck) { node = cur; break; }
        }
        cur = cur.parentNode;
      }
      if (!node) return;

      const chapterVal = node.getAttribute('data-analysis-chapter');
      const keyVal = node.getAttribute('data-analysis-key');
      try {
        const flashTarget = node.closest ? node.closest('.analysis-row, .analysis-svg') : node;
        if (flashTarget && flashTarget.classList) {
          flashTarget.classList.add('is-flash');
          setTimeout(() => flashTarget.classList.remove('is-flash'), 200);
        }
        if (chapterVal) {
          jumpToAnalysisQuestion({ chapter: chapterVal });
        } else if (keyVal) {
          jumpToAnalysisQuestion(keyVal);
        }
      } catch (err) {
        console.error('[analysis global click] 跳转失败:', err);
      }
    });
  }
}

// 点击分析页某行 → 切到"全部" tab → 展开对应题库+分组 → 打开题目浮窗
// 支持两种调用形式：
//   jumpToAnalysisQuestion('source::seq')          —— 按题目 key 跳
//   jumpToAnalysisQuestion({ chapter: '导论·…' }) —— 按章节名跳（章节图用）
function jumpToAnalysisQuestion(arg) {
  console.log('[jumpToAnalysisQuestion] 入参:', arg, 'typeof:', typeof arg);
  try {
  // 0. 当前打开的错题本兜底
  if (!currentWrongBookId || !wrongBooks[currentWrongBookId]) {
    const ids = Object.keys(wrongBooks);
    if (ids.length > 0) {
      currentWrongBookId = ids[0];
    } else {
      wrongBooks['默认'] = { name: '默认', temp: {}, long: {}, notes: {} };
      currentWrongBookId = '默认';
      saveWrongBooks();
    }
  }

  // 解析 key / 章节
  let qKeyVal = null;
  let q = null;
  if (typeof arg === 'string') {
    qKeyVal = arg;
    // 容错：先按原 key 找；如果 ALL_QUESTIONS 里没有，再去掉"双冒号"和"单冒号"两种格式都试
    q = ALL_QUESTIONS.find(x => qKey(x) === qKeyVal);
    if (!q) {
      // 把形如 "src::seq" 拆成 src 和 seq，模糊匹配
      const parts = qKeyVal.split(':').filter(Boolean);
      if (parts.length >= 2) {
        const seq = parts[parts.length - 1].trim();
        const src = parts.slice(0, parts.length - 1).join(':').trim();
        q = ALL_QUESTIONS.find(x => (x.source || '').trim() === src && String(x.seq) === seq);
        if (q) qKeyVal = qKey(q);
      }
    }
    if (!q) {
      // 最后一档：按章节（key 里章节信息）模糊找
      q = ALL_QUESTIONS.find(x => (qKeyVal + '').includes(x.chapter || '__nope__'));
    }
  } else if (arg && typeof arg === 'object') {
    if (arg.chapter) {
      q = ALL_QUESTIONS.find(x => x.chapter === arg.chapter);
      if (q) qKeyVal = qKey(q);
    } else if (arg.key) {
      qKeyVal = arg.key;
      q = ALL_QUESTIONS.find(x => qKey(x) === qKeyVal);
    }
  }
  console.log('[jumpToAnalysisQuestion] 解析结果 q=', q, 'qKeyVal=', qKeyVal);

  // 最终兜底：如果连题也找不到，就塞一个空题到 temp，保证浮窗一定能打开
  if (!q) {
    q = {
      question: (typeof arg === 'string' ? arg : (arg && arg.chapter ? arg.chapter : '题目')) + '（分析页跳转）',
      chapter: (typeof arg === 'string' ? '' : (arg && arg.chapter ? arg.chapter : '')),
      type: 'single_choice',
      answer: '',
      options: []
    };
    if (!qKeyVal) qKeyVal = 'analysis_fallback_' + Date.now();
  }

  // 1. 把题目塞到当前本的 temp（如果本来不在 temp/long 里）
  const curWb = getCurrentWB();
  let targetCat = 'temp';
  if (curWb.long[qKeyVal]) targetCat = 'long';
  else if (!curWb.temp[qKeyVal]) {
    curWb.temp[qKeyVal] = qObj(q);
    saveWrongBooks();
  }

  // 2. 切到错题本浏览页 → 切到"全部" tab
  show('page-wrongbook');
  console.log('[jumpToAnalysisQuestion] show(page-wrongbook) 完成, 容器class=', document.getElementById('page-wrongbook') && document.getElementById('page-wrongbook').className);
  wbFilter = 'all';
  document.querySelectorAll('.wb-global-tabs .chip').forEach(c => c.classList.remove('active'));
  const allChip = document.querySelector('.wb-global-tabs .chip[data-filter="all"]');
  if (allChip) allChip.classList.add('active');

  // 3. 基于最新 data 重建三级列表
  buildWbGrouped();

  // 4. 展开它所在的题库 + 分组（如果找不到就全部展开）
  const foundItem = findWbGroup(qKeyVal, targetCat);
  console.log('[jumpToAnalysisQuestion] findWbGroup 结果:', foundItem);
  if (foundItem) {
    wbExpanded.source[foundItem.sourceName] = true;
    wbExpanded.cat[foundItem.sourceName + ':' + targetCat] = true;
  } else {
    wbGrouped.forEach(src => {
      wbExpanded.source[src.name] = true;
      wbExpanded.cat[src.name + ':temp'] = true;
      wbExpanded.cat[src.name + ':long'] = true;
    });
  }
  renderWbThreeLevel();

  // 5. 打开浮窗
  console.log('[jumpToAnalysisQuestion] 调用 wbOpenDetail, key=', qKeyVal, 'cat=', targetCat);
  wbOpenDetail(qKeyVal, targetCat);
  console.log('[jumpToAnalysisQuestion] 完成');
  } catch (e) {
    console.error('[jumpToAnalysisQuestion] 出错:', e);
  }
}
// 挂到 window 上，保证 inline onclick 能找到
window.jumpToAnalysisQuestion = jumpToAnalysisQuestion;

// 辅助：在 wbGrouped 中找到 key 所在的 source + 分类
function findWbGroup(key, cat) {
  for (let i = 0; i < wbGrouped.length; i++) {
    const src = wbGrouped[i];
    if (src[cat] && src[cat].some(it => it.key === key)) {
      return { sourceName: src.name, cat: cat };
    }
  }
  return null;
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
  cardEl.innerHTML = html;
  // 注意：#wb-detail 必须挂在 wb-card 外面（page-wrongbook 里），所以这里不再 append 到 cardEl。
  // wbOpenDetail 自己会负责创建/迁移这个节点。
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
  // 多错题本：始终从当前打开的错题本 (currentWrongBookId) 取，避免"选了A本打开B本却找不到题"
  const curWb = getCurrentWB();
  const tempStore = curWb.temp;
  const longStore = curWb.long;
  const notesStore = curWb.notes;
  const cardEl = document.getElementById('wb-card');

  let q = (cat === 'long' ? longStore[key] : tempStore[key]);
  console.log('[wbOpenDetail] 拿题, key=', key, 'cat=', cat, '当前temp有数据:', Object.keys(tempStore).length, 'long有数据:', Object.keys(longStore).length, '拿到q:', q);
  if (!q) {
    // 兜底：当前错题本里没有这道题（可能跳转来自分析页 / 来自其他本 / temp 刚被清空），
    // 直接从 ALL_QUESTIONS 找原题；若仍然没有，再尝试用 key 模糊匹配。
    if (typeof ALL_QUESTIONS !== 'undefined' && Array.isArray(ALL_QUESTIONS)) {
      q = ALL_QUESTIONS.find(x => {
        try { return qKey(x) === key; } catch(e) { return false; }
      });
      if (!q) {
        // 模糊：按 source/seq 拆解 key
        const parts = (key || '').split(':').filter(Boolean);
        if (parts.length >= 2) {
          const seq = parts[parts.length - 1].trim();
          const src = parts.slice(0, parts.length - 1).join(':').trim();
          q = ALL_QUESTIONS.find(x => (x.source || '').trim() === src && String(x.seq) === seq);
        }
      }
    }
    if (!q) {
      console.warn('[wbOpenDetail] 找不到题目 key=', key, 'cat=', cat);
      return;
    }
    // 顺手把题塞到当前本的 temp，方便下次从三级列表也能打开
    if (cat !== 'long' && curWb && curWb.temp) {
      curWb.temp[key] = qObj(q);
      saveWrongBooks();
    }
    console.log('[wbOpenDetail] 从 ALL_QUESTIONS 兜底拿到题, key=', key);
  }
  let detail = document.getElementById('wb-detail');
  // 详情容器必须挂在 wb-card 之外，否则 renderWbThreeLevel 重写 wb-card.innerHTML 时会把它覆盖掉
  if (!detail || (cardEl && detail.parentNode === cardEl)) {
    detail = document.createElement('div');
    detail.id = 'wb-detail';
    detail.className = 'wb-detail hidden';
    const target = (cardEl && cardEl.parentNode) || document.body;
    target.appendChild(detail);
  }
  // 注释：去掉"点同一 key 就关闭浮窗"的逻辑。浮窗由 wbCloseDetail() 显式关闭，
  // 否则委托的 click 冒泡可能让用户感觉"一闪就消失"。
  // if (detail.dataset.key === key && detail.dataset.cat === cat) {
  //   detail.classList.add('hidden');
  //   detail.dataset.key = '';
  //   return;
  // }
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

  // 备注显示（来自当前错题本的 notes）
  const noteKey = key;
  const noteVal = notesStore[noteKey];
  if (noteVal) {
    html += '<div class="note-display">📝 ' + escHtml(noteVal) + '</div>';
  }

  // 按钮行：纯图标 + 增加备注
  const isLongTerm = (cat === 'long');
  html += '<div class="wb-detail-btn-row">' +
    '<button class="wb-icon-btn wb-icon-star' + (isLongTerm ? ' is-long' : '') + '" onclick="wbToggleCategory(\'' + escAttr(key) + '\',\'' + cat + '\')" title="' + (cat === 'temp' ? '转为长期记忆' : '转回暂时错题') + '">' + (isLongTerm ? '★' : '☆') + '</button>' +
    '<button class="wb-icon-btn wb-icon-remove" onclick="wbRemove(\'' + escAttr(key) + '\',\'' + cat + '\')" title="移除">✈</button>' +
    '<button class="wb-icon-btn wb-icon-move" onclick="showMoveQuestionDialog(\'' + escAttr(key) + '\',\'' + cat + '\')" title="移动到其他错题本">☇</button>' +
    '<button class="wb-icon-btn wb-icon-note" onclick="wbToggleNoteInput()" title="增加备注">📝</button>' +
    '</div>';

  // 备注输入区（默认隐藏）
  html += '<div id="wb-note-editor" class="wb-note-editor hidden">' +
    '<textarea id="wb-note-text" placeholder="输入备注内容…" maxlength="500"></textarea>' +
    '<div class="wb-note-editor-actions">' +
    '<button class="btn btn-primary btn-sm" onclick="wbSaveDetailNote(\'' + escAttr(noteKey) + '\')">保存</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="wbCancelNote()">关闭</button>' +
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
  // 关键诊断：浮层在屏幕内是否真正可见
  const rect = detail.getBoundingClientRect();
  const style = window.getComputedStyle(detail);
  console.log('[wbOpenDetail] 写入并显示, parent=', detail.parentNode && detail.parentNode.id, 'detail class=', detail.className, 'isInDocument=', document.body.contains(detail));
  console.log('[wbOpenDetail] 浮层rect:', {top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right}, '视口高:', window.innerHeight);
  console.log('[wbOpenDetail] 浮层css:', {position: style.position, bottom: style.bottom, transform: style.transform, display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex});
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
  // 多错题本：备注写入当前打开的错题本 (currentWrongBookId)
  const curWb = currentWrongBookId && wrongBooks[currentWrongBookId]
    ? wrongBooks[currentWrongBookId]
    : getTargetWB();
  if (val) {
    curWb.notes[noteKey] = val;
  } else {
    delete curWb.notes[noteKey];
  }
  // 加了备注 → 自动把当前题目从 temp 转成 long（若存在于 temp）
  const q = curWb.temp[noteKey];
  if (q) {
    curWb.long[noteKey] = q;
    delete curWb.temp[noteKey];
  }
  saveWrongBooks();
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
  // 计算所有错题本的总数
  let totalTemp = 0, totalLong = 0;
  Object.values(wrongBooks).forEach(wb => {
    totalTemp += Object.keys(wb.temp).length;
    totalLong += Object.keys(wb.long).length;
  });
  const totalCount = totalTemp + totalLong;
  
  const card = document.getElementById('card-wrongbook');
  if (!card) return;
  if (totalCount === 0) {
    card.classList.add('disabled');
    card.querySelector('p').textContent = '错题本为空';
  } else {
    card.classList.remove('disabled');
    const includeLong = document.getElementById('wb-include-long')?.checked;
    card.querySelector('p').textContent = includeLong
      ? '错题本共 ' + totalCount + ' 道题（暂' + totalTemp + ' + 长' + totalLong + '）'
      : '暂时错题共 ' + totalTemp + ' 道题';
  }
}

// 支持两种调用：
// 1) wbRemove(key, cat) —— 新版（从三级列表详情）
// 2) wbRemove() —— 老版（基于 wbIndex/wbList）
function wbRemove(key, cat) {
  let removed = false;
  const curWb = getCurrentWB();
  if (key && cat) {
    if (cat === 'temp') {
      if (curWb.temp[key]) { delete curWb.temp[key]; removed = true; }
    } else if (cat === 'long') {
      if (curWb.long[key]) { delete curWb.long[key]; removed = true; }
    }
  } else if (wbList.length > 0) {
    const item = wbList[wbIndex];
    const k = item.key;
    if (item.cat === 'temp') {
      if (curWb.temp[k]) { delete curWb.temp[k]; removed = true; }
    } else if (item.cat === 'long') {
      if (curWb.long[k]) { delete curWb.long[k]; removed = true; }
    }
  }
  if (!removed) return;
  saveWrongBooks();
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
  const curWb = getCurrentWB();
  if (key && cat) {
    if (cat === 'temp') {
      if (!curWb.temp[key]) return;
      q = curWb.temp[key];
      delete curWb.temp[key];
      curWb.long[key] = q;
    } else if (cat === 'long') {
      if (!curWb.long[key]) return;
      q = curWb.long[key];
      delete curWb.long[key];
      curWb.temp[key] = q;
    }
  } else if (wbList.length > 0) {
    const item = wbList[wbIndex];
    const k = item.key;
    q = item.q;
    if (item.cat === 'temp') {
      delete curWb.temp[k];
      curWb.long[k] = q;
    } else if (item.cat === 'long') {
      delete curWb.long[k];
      curWb.temp[k] = q;
    }
  } else {
    return;
  }
  saveWrongBooks();
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
let statsTime = 'day';

function renderStatsPage(container) {
  let html = '<div class="stats-filter-row">';
  html += '<span class="chip' + (statsTime === 'day' ? ' active' : '') + '" onclick="setStatsTime(this,\'day\')">按天</span>';
  html += '<span class="chip' + (statsTime === 'week' ? ' active' : '') + '" onclick="setStatsTime(this,\'week\')">按周</span>';
  html += '</div><div class="stats-charts" id="stats-charts"></div>';
  container.innerHTML = html;
  renderAllCharts(document.getElementById('stats-charts'), statsTime);
}

function setStatsTime(el, val) {
  statsTime = val;
  document.querySelectorAll('#wb-stats .stats-filter-row .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderAllCharts(document.getElementById('stats-charts'), statsTime);
}

// —— 读取原始数据并分组 ——
function loadStatsData(filterTime) {
  let history = getQuizDetailHistory();
  if (history.length === 0) return null;

  // 按题库筛选
  const activeSources = new Set(Object.keys(sourceData).filter(s => sourceSelection[s] !== false));
  if (activeSources.size > 0) {
    history = history.filter(h => activeSources.has(h.source));
  }
  if (history.length === 0) return null;

  // 生成时间键
  history.forEach(h => {
    h.timeKey = filterTime === 'week' ? getWeekKey(h.date) : h.date;
  });

  return history;
}

// —— 获取所有章节排序 ——
function getChapterOrder(history) {
  // 首次出现的顺序
  const seen = new Set();
  const order = [];
  history.forEach(h => {
    if (!seen.has(h.chapter)) { seen.add(h.chapter); order.push(h.chapter); }
  });
  return order;
}

// —— 渲染所有图表 ——
function renderAllCharts(container, filterTime) {
  if (!container) return;
  const history = loadStatsData(filterTime);
  if (!history) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:40px">暂无答题记录</div>';
    return;
  }

  // 预计算"每章/每题库内错题次数最多的题"，渲染时塞到 data-* 上，tooltip 直接读
  const mostWrongIndex = buildChartMostWrongIndex();

  let html = '';

  // 1. 各章节学习次数（堆积百分比柱状图）
  html += renderChapterStudyChart(history, filterTime, mostWrongIndex);

  // 2. 各题型做题次数
  html += renderTypeCountChart(history);

  // 3. 各章节总正确次数
  html += renderChapterCorrectChart(history, mostWrongIndex);

  // 4. 各章节总错误次数
  html += renderChapterWrongChart(history, mostWrongIndex);

  // 5. 各题库做题次数
  html += renderSourceCountChart(history, mostWrongIndex);

  container.innerHTML = html;

  // 安装 chart-tooltip 事件委托（mouseover/click 触发；空白处点击关闭）
  installChartTooltip(container);
}

// —— 构建"每章/每题库内错题次数最多题"的索引 ——
// 用 quizAnalysis.byQuestion（结构: {key: {question, chapter, source?, countWrong, countCorrect, ...}}）
// 兼容 source 字段可能缺失：从 ALL_QUESTIONS 兜底补
function buildChartMostWrongIndex() {
  const result = { overall: null, byChapter: {}, bySource: {} };
  try {
    const bq = (typeof quizAnalysis !== 'undefined' && quizAnalysis && quizAnalysis.byQuestion) || {};
    const items = Object.keys(bq).map(k => ({
      key: k,
      question: bq[k].question,
      chapter: bq[k].chapter,
      source: bq[k].source || (typeof qKey === 'function' && typeof ALL_QUESTIONS !== 'undefined'
        ? ((ALL_QUESTIONS.find(x => qKey(x) === k) || {}).source)
        : null) || '未知',
      countWrong: bq[k].countWrong || 0
    })).filter(x => x.countWrong > 0);

    if (items.length) {
      items.sort((a, b) => b.countWrong - a.countWrong);
      result.overall = items[0];
      items.forEach(it => {
        if (!result.byChapter[it.chapter] || it.countWrong > result.byChapter[it.chapter].countWrong) {
          result.byChapter[it.chapter] = it;
        }
        if (!result.bySource[it.source] || it.countWrong > result.bySource[it.source].countWrong) {
          result.bySource[it.source] = it;
        }
      });
    }
  } catch (e) { /* 静默：tooltip 在没数据时显示"暂无错题" */ }
  return result;
}

// 把数据属性写到 <rect> 上：chapter/source/timeKey/wrongCount/worstKey/worstQuestion
// 顶层 escapeHtmlAttr / escapeXml —— 这两个函数原本定义在 renderAnalysis 内部，统计页 tooltip 也是顶层调用，所以提到顶层
function escapeHtmlAttr(s) {
  s = (s == null ? '' : String(s));
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeXml(s) {
  s = (s == null ? '' : String(s));
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// showChartTooltipNear 等旧代码用 escapeAttr 这个名字
var escapeAttr = escapeHtmlAttr;
function chartBarAttrs(scope, item, mostWrongIndex) {
  let attrs = ' class="chart-bar"';
  if (!item) return attrs;
  attrs += ' data-chart-scope="' + escapeHtmlAttr(scope) + '"';
  if (item.chapter) attrs += ' data-chart-chapter="' + escapeHtmlAttr(item.chapter) + '"';
  if (item.source)  attrs += ' data-chart-source="'  + escapeHtmlAttr(item.source)  + '"';
  if (item.timeKey) attrs += ' data-chart-timekey="' + escapeHtmlAttr(item.timeKey) + '"';
  if (item.cnt != null) attrs += ' data-chart-wrongcount="' + item.cnt + '"';
  if (item.total != null) attrs += ' data-chart-total="' + item.total + '"';
  // 找"本章/本题库内错题最多题"
  let worst = null;
  if (mostWrongIndex) {
    if (item.chapter && mostWrongIndex.byChapter[item.chapter]) worst = mostWrongIndex.byChapter[item.chapter];
    else if (item.source && mostWrongIndex.bySource[item.source]) worst = mostWrongIndex.bySource[item.source];
    else if (mostWrongIndex.overall) worst = mostWrongIndex.overall;
  }
  if (worst) {
    attrs += ' data-chart-worst-key="' + escapeHtmlAttr(worst.key) + '"';
    attrs += ' data-chart-worst-question="' + escapeHtmlAttr(worst.question || '') + '"';
    attrs += ' data-chart-worst-count="' + worst.countWrong + '"';
  }
  return attrs;
}

// —— 图表 tooltip 浮层（单例） ——
// 鼠标悬停：mouseover/mouseout 触发；触屏点击：click 触发；点击空白处/再点同一色块：关闭
let _chartTooltipEl = null;
function getChartTooltipEl() {
  if (_chartTooltipEl && document.body.contains(_chartTooltipEl)) return _chartTooltipEl;
  let el = document.getElementById('chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chart-tooltip';
    el.className = 'chart-tooltip hidden';
    document.body.appendChild(el);
  }
  _chartTooltipEl = el;
  return el;
}
function hideChartTooltip() {
  const el = getChartTooltipEl();
  el.classList.add('hidden');
}
function showChartTooltipNear(target) {
  const el = getChartTooltipEl();
  const scope = target.dataset.chartScope;
  const chapter = target.dataset.chartChapter || '';
  const source  = target.dataset.chartSource  || '';
  const timeKey = target.dataset.chartTimekey || '';
  const wrongCount = parseInt(target.dataset.chartWrongcount || '0', 10);
  const total = parseInt(target.dataset.chartTotal || '0', 10);
  const worstKey = target.dataset.chartWorstKey || '';
  const worstQ   = target.dataset.chartWorstQuestion || '';
  const worstCnt = parseInt(target.dataset.chartWorstCount || '0', 10);

  let title = '';
  if (scope === 'chapter-study' || scope === 'chapter-correct' || scope === 'chapter-wrong') {
    title = chapter;
  } else if (scope === 'source') {
    title = source;
  } else if (scope === 'type') {
    title = target.dataset.chartTypeLabel || scope;
  } else {
    title = chapter || source || scope;
  }

  // 构造 HTML
  let html = '<div class="ct-title">' + escapeXml(title) + '</div>';
  let metaParts = [];
  if (scope === 'chapter-study') {
    metaParts.push('做题次数：' + total);
    metaParts.push('错题数：' + wrongCount);
    if (timeKey) metaParts.push('时段：' + timeKey);
  } else if (scope === 'chapter-correct' || scope === 'chapter-wrong') {
    metaParts.push(scope === 'chapter-correct' ? '正确次数' : '错误次数');
    metaParts.push(wrongCount + ' 次');
  } else if (scope === 'source') {
    metaParts.push('做题次数：' + total);
  } else if (scope === 'type') {
    metaParts.push('做题次数：' + total);
  }
  if (metaParts.length) html += '<div class="ct-meta">' + metaParts.join(' · ') + '</div>';

  if (worstKey) {
    const qtext = (worstQ || '').substring(0, 40) + ((worstQ || '').length > 40 ? '…' : '');
    html += '<a class="ct-wrong-q" data-worst-key="' + escapeAttr(worstKey) + '" href="javascript:void(0)">'
      + '<div class="ct-q-title">📌 ' + escapeXml(qtext) + '</div>'
      + '<div class="ct-q-meta">本章/本库内错题最多：' + worstCnt + ' 次 · 点击查看原题</div>'
      + '</a>';
  } else {
    html += '<div class="ct-empty">该范围内暂无错题记录</div>';
  }

  el.innerHTML = html;
  el.classList.remove('hidden');

  // 定位：靠近点击点 / 鼠标位置
  let cx, cy;
  if (window._lastChartEvent && window._lastChartEvent.clientX) {
    cx = window._lastChartEvent.clientX;
    cy = window._lastChartEvent.clientY;
  } else {
    const r = target.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top;
  }
  const elW = el.offsetWidth || 240;
  const elH = el.offsetHeight || 100;
  let left = cx + 12;
  let top  = cy + 12;
  if (left + elW > window.innerWidth - 8)  left = window.innerWidth - elW - 8;
  if (top  + elH > window.innerHeight - 8) top  = window.innerHeight - elH - 8;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;
  el.style.left = left + 'px';
  el.style.top  = top  + 'px';
}

function installChartTooltip(container) {
  if (container._chartTooltipBound) return;
  container._chartTooltipBound = true;

  container.addEventListener('mouseover', function(e) {
    const bar = e.target && e.target.closest && e.target.closest('rect.chart-bar');
    if (!bar) return;
    window._lastChartEvent = e;
    showChartTooltipNear(bar);
  });
  container.addEventListener('mouseout', function(e) {
    const bar = e.target && e.target.closest && e.target.closest('rect.chart-bar');
    if (!bar) return;
    // 移入到 tooltip 内部不关闭
    const related = e.relatedTarget;
    if (related && _chartTooltipEl && _chartTooltipEl.contains(related)) return;
    hideChartTooltip();
  });
  // 触屏：click 切换（点同一色块关闭，点其它色块切换，点空白关闭）
  container.addEventListener('click', function(e) {
    const bar = e.target && e.target.closest && e.target.closest('rect.chart-bar');
    if (bar) {
      window._lastChartEvent = e;
      const el = getChartTooltipEl();
      if (!el.classList.contains('hidden') && el._lastBar === bar) {
        hideChartTooltip();
        el._lastBar = null;
      } else {
        showChartTooltipNear(bar);
        el._lastBar = bar;
      }
      e.stopPropagation();
    }
  });
}

// 空白处点击关闭
document.addEventListener('click', function(e) {
  if (!_chartTooltipEl) return;
  if (_chartTooltipEl.classList.contains('hidden')) return;
  // 点击 tooltip 内部的"错题最多题"链接 → 跳转
  const qLink = e.target.closest && e.target.closest('.ct-wrong-q');
  if (qLink) {
    const k = qLink.dataset.worstKey;
    if (k) {
      hideChartTooltip();
      // 复用你已经验证的跳转路径
      if (typeof jumpToAnalysisQuestion === 'function') jumpToAnalysisQuestion(k);
      e.stopPropagation();
      e.preventDefault();
    }
    return;
  }
  if (e.target.closest('rect.chart-bar')) return;
  if (e.target.closest('.chart-tooltip')) return;
  hideChartTooltip();
});

// —— 调色板 ——
const STATS_COLORS = ['#4a90d9','#27ae60','#e74c3c','#f39c12','#8e44ad','#1abc9c','#e67e22','#2c3e50','#16a085','#c0392b','#2980b9','#8e44ad','#d35400','#7f8c8d','#3498db','#2ecc71'];
function getColor(idx) { return STATS_COLORS[idx % STATS_COLORS.length]; }

// —— 1. 堆积百分比柱状图：各章节学习次数 ——
function renderChapterStudyChart(history, filterTime, mostWrongIndex) {
  // 按时间键 + 章节分组
  const timeKeys = [...new Set(history.map(h => h.timeKey))].sort();
  const chapters = getChapterOrder(history);

  // 统计每个时间键内各章节的做题次数
  const data = {}; // timeKey -> { chapter: count }
  const timeTotals = {}; // timeKey -> total
  timeKeys.forEach(tk => {
    data[tk] = {};
    chapters.forEach(ch => data[tk][ch] = 0);
  });
  history.forEach(h => {
    if (!data[h.timeKey]) data[h.timeKey] = {};
    if (data[h.timeKey][h.chapter] === undefined) data[h.timeKey][h.chapter] = 0;
    data[h.timeKey][h.chapter]++;
    timeTotals[h.timeKey] = (timeTotals[h.timeKey] || 0) + 1;
  });

  // 错题数（按章节累加，不限时间）
  const wrongByChapter = {};
  if (typeof quizAnalysis !== 'undefined' && quizAnalysis && quizAnalysis.byChapter) {
    Object.keys(quizAnalysis.byChapter).forEach(ch => {
      wrongByChapter[ch] = quizAnalysis.byChapter[ch].wrong || 0;
    });
  }

  const W = 600, H = 520, PAD = { top: 30, right: 20, bottom: 170, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = Math.max(14, Math.min(50, chartW / Math.max(timeKeys.length,1) * 0.7));
  const gap = chartW / Math.max(timeKeys.length, 1);

  // 用 viewBox，让 SVG 在窄屏时自动缩放；容器 max-width:100%
  let svg = `<h4 style="margin:12px 0 6px;color:var(--text,#333)">📊 各章节学习次数</h4>
    <div style="max-width:100%;overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
      <g transform="translate(${PAD.left},${PAD.top})">`;

  // Y轴网格（百分比）
  for (let pct = 0; pct <= 100; pct += 20) {
    const y = chartH - (pct / 100) * chartH;
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#ddd" stroke-dasharray="3,3"/>`;
    svg += `<text x="-6" y="${y+5}" text-anchor="end" font-size="14" fill="#999">${pct}%</text>`;
  }

  // 每个时间点绘制堆积柱
  timeKeys.forEach((tk, i) => {
    const cx = i * gap + gap / 2;
    const total = timeTotals[tk] || 1;
    let stackBottom = 0;

    const sortedChapters = chapters.filter(ch => (data[tk][ch] || 0) > 0);
    sortedChapters.forEach((ch, si) => {
      const cnt = data[tk][ch] || 0;
      const pct = cnt / total;
      const barH = pct * chartH;
      const y = chartH - stackBottom - barH;
      const wrongCount = wrongByChapter[ch] || 0;
      const item = { chapter: ch, timeKey: tk, cnt: wrongCount, total: total };
      const extraAttrs = chartBarAttrs('chapter-study', item, mostWrongIndex);
      svg += `<rect x="${cx - barW/2}" y="${y}" width="${barW}" height="${Math.max(barH, 0.5)}" fill="${getColor(chapters.indexOf(ch))}" opacity=".85" rx="1"${extraAttrs}/>`;
      // 只有当柱内剩余高度 > 18 时，才把百分比写进柱内；否则省略，避免小屏拥挤
      if (pct > 0.08 && barH > 18) {
        svg += `<text x="${cx}" y="${y + barH/2 + 5}" text-anchor="middle" font-size="14" fill="#fff" font-weight="600">${Math.round(pct*100)}%</text>`;
      }
      stackBottom += barH;
    });

    // 总做题数标注
    svg += `<text x="${cx}" y="${chartH + 20}" text-anchor="middle" font-size="14" fill="#999">${total}</text>`;

    // X轴标签 - 旋转25度，位置下移
    const label = filterTime === 'week' ? tk.replace('W','') : tk.slice(5);
    svg += `<text x="${cx}" y="${chartH + 52}" text-anchor="end" font-size="12" fill="#888" transform="rotate(-25,${cx},${chartH + 52})">${label}</text>`;
  });

  // 图例
  const legendChapters = chapters.filter(ch => history.some(h => h.chapter === ch));
  svg += '</g></svg></div>';
  svg += '<div class="legend-row">';
  legendChapters.forEach((ch, i) => {
    svg += `<span class="legend-item">
      <span class="legend-dot" style="background:${getColor(i)}"></span>${ch}</span>`;
  });
  svg += '</div>';

  return svg;
}

// —— 2. 各题型做题次数 ——
function renderTypeCountChart(history, mostWrongIndex) {
  const typeMap = {};
  history.forEach(h => {
    typeMap[h.type] = (typeMap[h.type] || 0) + 1;
  });
  const types = Object.keys(typeMap);
  if (types.length === 0) return '';

  const TYPE_LABELS = { single_choice: '单选', multiple_choice: '多选', true_false: '判断', calculation: '计算', subjective: '主观' };
  const W = 600, H = 480, PAD = { top: 40, right: 20, bottom: 110, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const gap = chartW / Math.max(types.length,1);
  const maxVal = Math.max(...types.map(t => typeMap[t]), 1);

  let svg = `<h4 style="margin:16px 0 6px;color:var(--text,#333)">📊 各题型做题次数</h4>
    <div style="max-width:100%;overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
      <g transform="translate(${PAD.left},${PAD.top})">`;

  // Y轴
  const yStep = Math.max(1, Math.ceil(maxVal / 5));
  for (let v = 0; v <= maxVal + yStep; v += yStep) {
    const y = chartH - (v / (maxVal || 1)) * chartH;
    if (y < 0) continue;
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#ddd" stroke-dasharray="3,3"/>`;
    svg += `<text x="-6" y="${y+5}" text-anchor="end" font-size="14" fill="#999">${v}</text>`;
  }

  types.forEach((t, i) => {
    const cnt = typeMap[t];
    const barH = (cnt / (maxVal || 1)) * chartH;
    const cx = i * gap + gap / 2;
    const bw = Math.max(18, Math.min(60, gap * 0.6));
    const item = { cnt: cnt, total: cnt };
    // 题型不绑定 chapter/source，额外用 chartTypeLabel 让 tooltip 标题显示"单选/多选/..."
    let extraAttrs = chartBarAttrs('type', item, mostWrongIndex);
    extraAttrs = extraAttrs.replace('class="chart-bar"', 'class="chart-bar" data-chart-type-label="' + escapeHtmlAttr(TYPE_LABELS[t] || t) + '"');
    svg += `<rect x="${cx - bw/2}" y="${chartH - barH}" width="${bw}" height="${Math.max(barH, 1)}" fill="${getColor(i)}" opacity=".8" rx="2"${extraAttrs}/>`;
    // 数值标在柱顶
    svg += `<text x="${cx}" y="${chartH - barH - 8}" text-anchor="middle" font-size="14" fill="${getColor(i)}" font-weight="600">${cnt}</text>`;
    const label = TYPE_LABELS[t] || t;
    svg += `<text x="${cx}" y="${chartH + 35}" text-anchor="middle" font-size="14" fill="#333">${label}</text>`;
  });

  svg += '</g></svg></div>';
  return svg;
}

// —— 3. 各章节总正确次数 ——
function renderChapterCorrectChart(history, mostWrongIndex) {
  const chMap = {};
  history.forEach(h => {
    if (h.correct) chMap[h.chapter] = (chMap[h.chapter] || 0) + 1;
  });
  const chapters = Object.keys(chMap).filter(ch => chMap[ch] > 0);
  if (chapters.length === 0) return '';

  const W = 600, H = 420, PAD = { top: 40, right: 20, bottom: 130, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const gap = chartW / Math.max(chapters.length,1);
  const maxVal = Math.max(...chapters.map(ch => chMap[ch]), 1);

  let svg = `<h4 style="margin:16px 0 6px;color:var(--text,#333)">📊 各章节正确次数</h4>
    <div style="max-width:100%;overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
      <g transform="translate(${PAD.left},${PAD.top})">`;

  const yStep = Math.max(1, Math.ceil(maxVal / 5));
  for (let v = 0; v <= maxVal + yStep; v += yStep) {
    const y = chartH - (v / (maxVal || 1)) * chartH;
    if (y < 0) continue;
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#ddd" stroke-dasharray="3,3"/>`;
    svg += `<text x="-6" y="${y+5}" text-anchor="end" font-size="14" fill="#999">${v}</text>`;
  }

  chapters.forEach((ch, i) => {
    const cnt = chMap[ch];
    const barH = (cnt / (maxVal || 1)) * chartH;
    const cx = i * gap + gap / 2;
    const bw = Math.max(14, Math.min(60, gap * 0.6));
    const item = { chapter: ch, cnt: cnt };
    const extraAttrs = chartBarAttrs('chapter-correct', item, mostWrongIndex);
    svg += `<rect x="${cx - bw/2}" y="${chartH - barH}" width="${bw}" height="${Math.max(barH, 1)}" fill="#27ae60" opacity=".8" rx="2"${extraAttrs}/>`;
    svg += `<text x="${cx}" y="${chartH - barH - 8}" text-anchor="middle" font-size="14" fill="#27ae60" font-weight="600">${cnt}</text>`;
    svg += `<text x="${cx}" y="${chartH + 42}" text-anchor="end" font-size="12" fill="#333" transform="rotate(-22,${cx},${chartH + 42})">${ch}</text>`;
  });

  svg += '</g></svg></div>';
  return svg;
}

// —— 4. 各章节总错误次数 ——
function renderChapterWrongChart(history, mostWrongIndex) {
  const chMap = {};
  history.forEach(h => {
    if (!h.correct) chMap[h.chapter] = (chMap[h.chapter] || 0) + 1;
  });
  const chapters = Object.keys(chMap).filter(ch => chMap[ch] > 0);
  if (chapters.length === 0) return '';

  const W = 600, H = 420, PAD = { top: 40, right: 20, bottom: 130, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const gap = chartW / Math.max(chapters.length,1);
  const maxVal = Math.max(...chapters.map(ch => chMap[ch]), 1);

  let svg = `<h4 style="margin:16px 0 6px;color:var(--text,#333)">📊 各章节错误次数</h4>
    <div style="max-width:100%;overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
      <g transform="translate(${PAD.left},${PAD.top})">`;

  const yStep = Math.max(1, Math.ceil(maxVal / 5));
  for (let v = 0; v <= maxVal + yStep; v += yStep) {
    const y = chartH - (v / (maxVal || 1)) * chartH;
    if (y < 0) continue;
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#ddd" stroke-dasharray="3,3"/>`;
    svg += `<text x="-6" y="${y+5}" text-anchor="end" font-size="14" fill="#999">${v}</text>`;
  }

  chapters.forEach((ch, i) => {
    const cnt = chMap[ch];
    const barH = (cnt / (maxVal || 1)) * chartH;
    const cx = i * gap + gap / 2;
    const bw = Math.max(14, Math.min(60, gap * 0.6));
    const item = { chapter: ch, cnt: cnt };
    const extraAttrs = chartBarAttrs('chapter-wrong', item, mostWrongIndex);
    svg += `<rect x="${cx - bw/2}" y="${chartH - barH}" width="${bw}" height="${Math.max(barH, 1)}" fill="#e74c3c" opacity=".8" rx="2"${extraAttrs}/>`;
    svg += `<text x="${cx}" y="${chartH - barH - 8}" text-anchor="middle" font-size="14" fill="#e74c3c" font-weight="600">${cnt}</text>`;
    svg += `<text x="${cx}" y="${chartH + 42}" text-anchor="end" font-size="12" fill="#333" transform="rotate(-22,${cx},${chartH + 42})">${ch}</text>`;
  });

  svg += '</g></svg></div>';
  return svg;
}

// —— 5. 各题库做题次数 ——
function renderSourceCountChart(history, mostWrongIndex) {
  const srcMap = {};
  history.forEach(h => {
    srcMap[h.source] = (srcMap[h.source] || 0) + 1;
  });
  const sources = Object.keys(srcMap).filter(s => srcMap[s] > 0);
  if (sources.length === 0) return '';

  const W = 600, H = 460, PAD = { top: 40, right: 20, bottom: 170, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const gap = chartW / Math.max(sources.length,1);
  const maxVal = Math.max(...sources.map(s => srcMap[s]), 1);

  let svg = `<h4 style="margin:16px 0 6px;color:var(--text,#333)">📊 各题库做题次数</h4>
    <div style="max-width:100%;overflow-x:auto">
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">
      <g transform="translate(${PAD.left},${PAD.top})">`;

  const yStep = Math.max(1, Math.ceil(maxVal / 5));
  for (let v = 0; v <= maxVal + yStep; v += yStep) {
    const y = chartH - (v / (maxVal || 1)) * chartH;
    if (y < 0) continue;
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#ddd" stroke-dasharray="3,3"/>`;
    svg += `<text x="-6" y="${y+5}" text-anchor="end" font-size="14" fill="#999">${v}</text>`;
  }

  sources.forEach((s, i) => {
    const cnt = srcMap[s];
    const barH = (cnt / (maxVal || 1)) * chartH;
    const cx = i * gap + gap / 2;
    const bw = Math.max(18, Math.min(100, gap * 0.6));
    const item = { source: s, cnt: cnt, total: cnt };
    const extraAttrs = chartBarAttrs('source', item, mostWrongIndex);
    svg += `<rect x="${cx - bw/2}" y="${chartH - barH}" width="${bw}" height="${Math.max(barH, 1)}" fill="${getColor(i)}" opacity=".8" rx="2"${extraAttrs}/>`;
    svg += `<text x="${cx}" y="${chartH - barH - 8}" text-anchor="middle" font-size="14" fill="${getColor(i)}" font-weight="600">${cnt}</text>`;
    // 题库名称较长，用旋转 - 位置下移
    svg += `<text x="${cx}" y="${chartH + 52}" text-anchor="end" font-size="12" fill="#333" transform="rotate(-22,${cx},${chartH + 52})">${s}</text>`;
  });

  svg += '</g></svg></div>';
  return svg;
}

// —— 旧函数保留用于兼容，但不使用 ——
// —— 按题记录答题详情 ——
function logQuizAnswer(q, correct) {
  if (!q) return;
  const record = {
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    source: q.source || '未知',
    chapter: q.chapter || '未分类',
    type: q.type || 'unknown',
    correct: !!correct,
    mode: mode || 'unknown'
  };
  let history = [];
  try { history = JSON.parse(localStorage.getItem('quizDetailHistory') || '[]'); } catch(e) {}
  history.push(record);
  // 只保留最近 50000 条
  if (history.length > 50000) history = history.slice(-50000);
  localStorage.setItem('quizDetailHistory', JSON.stringify(history));
}

// —— 读取答题详情 ——
function getQuizDetailHistory() {
  try { return JSON.parse(localStorage.getItem('quizDetailHistory') || '[]'); } catch(e) { return []; }
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
    // Render list first, then enable cylinder with a microtask delay
    // to avoid scrollIntoView during initial render
    renderPreviewList();
    if (cylinderModeEnabled) {
      requestAnimationFrame(() => enableCylinderMode());
    }
  }
  document.getElementById('preview-info').textContent = '预览模式';
  updatePreviewCounter();
}

function updatePreviewCounter() {
  const el = document.getElementById('preview-counter');
  if (!el) return;
  const total = previewList.length;
  if (previewViewMode === 'card') {
    el.innerHTML = '<span id="jump-counter" style="cursor:pointer;color:#4a90d9" title="点击跳转">' + (previewIndex + 1) + '</span> / ' + total;
  } else if (cylinderModeEnabled) {
    el.innerHTML = '<span id="jump-counter" style="cursor:pointer;color:#4a90d9" title="点击跳转">?</span> / ' + total;
  } else {
    el.textContent = total + ' 题';
  }
  const jumpEl = document.getElementById('jump-counter');
  if (jumpEl) jumpEl.onclick = jumpToQuestion;
}

// ====== Cylinder Mode ======
// Phase 1 (scroll): all items collapsed → equal heights → stable layout.
//   Only scale/opacity animate based on distance from viewport center.
// Phase 2 (stop): find item closest to center → expand it → wait layout →
//   calculate exact scroll position → instant scrollTo to center.

let cylinderModeEnabled = false;
let cylinderRafId = null;
let cylinderSettleTimer = null;
let cylinderLocked = false;        // blocks ALL handlers during step/initial
let cylinderKeyState = { ArrowUp: false, ArrowDown: false, ArrowRight: false, ArrowLeft: false };
let cylinderAutoScrollId = null;

function toggleCylinderMode(enabled) {
  cylinderModeEnabled = enabled;
  savePreviewViewState();
  if (enabled) {
    virtualListState.enabled = false;
    renderPreviewList();
    enableCylinderMode();
  } else {
    disableCylinderMode();
    renderPreviewList();
  }
}

function enableCylinderMode() {
  const listEl = document.getElementById('preview-list');
  if (!listEl) return;
  listEl.classList.add('cylinder-mode');

  // Collapse all, clear inline styles
  listEl.querySelectorAll('.pv-list-detail').forEach(d => d.classList.remove('show', 'half-show'));
  listEl.querySelectorAll('.pv-list-arrow').forEach(a => a.style.transform = '');
  listEl.querySelectorAll('.pv-list-item').forEach(item => {
    item.style.transform = '';
    item.style.opacity = '';
    item.classList.remove('focused', 'adjacent', 'far');
  });

  window.addEventListener('scroll', onCylinderScroll, { passive: true });
  window.addEventListener('keydown', onCylinderKeyDown);
  window.addEventListener('keyup', onCylinderKeyUp);
  cylinderLocked = false;

  // Initial: center first item
  requestAnimationFrame(() => {
    cylinderLocked = true;
    const firstHeader = listEl.querySelector('.pv-list-header');
    if (firstHeader) firstHeader.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => { cylinderScrollFx(); });
    setTimeout(() => {
      cylinderLocked = false;
      if (cylinderModeEnabled) cylinderSettle();
    }, 400);
  });
}

function disableCylinderMode() {
  const listEl = document.getElementById('preview-list');
  if (!listEl) return;
  listEl.classList.remove('cylinder-mode');

  listEl.querySelectorAll('.pv-list-item').forEach(item => {
    item.style.transform = '';
    item.style.opacity = '';
    item.classList.remove('focused', 'adjacent', 'far');
  });
  listEl.querySelectorAll('.pv-list-detail').forEach(d => d.classList.remove('show', 'half-show'));
  listEl.querySelectorAll('.pv-list-arrow').forEach(a => a.style.transform = '');

  window.removeEventListener('scroll', onCylinderScroll);
  window.removeEventListener('keydown', onCylinderKeyDown);
  window.removeEventListener('keyup', onCylinderKeyUp);
  if (cylinderRafId) { cancelAnimationFrame(cylinderRafId); cylinderRafId = null; }
  if (cylinderSettleTimer) { clearTimeout(cylinderSettleTimer); cylinderSettleTimer = null; }
  if (cylinderAutoScrollId) { cancelAnimationFrame(cylinderAutoScrollId); cylinderAutoScrollId = null; }
  cylinderLocked = false;
  cylinderKeyState = { ArrowUp: false, ArrowDown: false, ArrowRight: false, ArrowLeft: false };
}

// ---- Scroll handler ----

function onCylinderScroll() {
  if (!cylinderModeEnabled || cylinderLocked) return;
  // rAF throttle: scale/opacity effect, no expand/collapse
  if (cylinderRafId) return;
  cylinderRafId = requestAnimationFrame(() => {
    cylinderRafId = null;
    cylinderScrollFx();
  });
  // Debounce settle: when scrolling stops, expand + center
  if (cylinderSettleTimer) clearTimeout(cylinderSettleTimer);
  cylinderSettleTimer = setTimeout(cylinderSettle, 200);
}

// ---- Phase 1: scroll-time — only scale/opacity, all items collapsed ----

function cylinderScrollFx() {
  const listEl = document.getElementById('preview-list');
  if (!listEl || !listEl.classList.contains('cylinder-mode')) return;
  const items = listEl.querySelectorAll('.pv-list-item');
  if (items.length === 0) return;

  const viewCenter = window.innerHeight / 2;
  const radius = viewCenter * 0.8;

  items.forEach(item => {
    const rc = item.getBoundingClientRect();
    const itemCenter = rc.top + rc.height / 2;
    const dist = Math.abs(itemCenter - viewCenter);
    const t = Math.min(1, dist / radius);
    const e = t * t;
    item.style.transform = `scale(${(1 - e * 0.22).toFixed(3)})`;
    item.style.opacity = (1 - e * 0.72).toFixed(3);
  });
}

// ---- Phase 2: stop-time — expand closest + center ----

function cylinderSettle() {
  if (!cylinderModeEnabled || cylinderLocked) return;
  const listEl = document.getElementById('preview-list');
  if (!listEl) return;
  const items = Array.from(listEl.querySelectorAll('.pv-list-item'));
  if (items.length === 0) return;

  const viewCenter = window.innerHeight / 2;

  // Find closest header
  let closestIdx = 0, closestDist = Infinity;
  items.forEach((item, i) => {
    const hdr = item.querySelector('.pv-list-header');
    if (!hdr) return;
    const rc = hdr.getBoundingClientRect();
    const dist = Math.abs(rc.top + rc.height / 2 - viewCenter);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });

  // Kill transitions for instant expand, then restore after calculation
  items.forEach(item => {
    const d = item.querySelector('.pv-list-detail');
    const a = item.querySelector('.pv-list-arrow');
    if (d) d.style.transition = 'none';
    if (a) a.style.transition = 'none';
  });

  // Expand target, collapse others (instant)
  items.forEach((item, i) => {
    const d = item.querySelector('.pv-list-detail');
    const a = item.querySelector('.pv-list-arrow');
    if (i === closestIdx) {
      if (d) d.classList.add('show');
      if (a) a.style.transform = 'rotate(180deg)';
    } else {
      if (d) d.classList.remove('show', 'half-show');
      if (a) a.style.transform = '';
    }
  });

  // Force reflow for stable layout
  void items[closestIdx].offsetHeight;

  const targetItem = items[closestIdx];
  const targetHeader = targetItem.querySelector('.pv-list-header');
  const hdrRc = targetHeader.getBoundingClientRect();
  const expandedRc = targetItem.getBoundingClientRect();
  // Center the whole item (not just header) in viewport
  const ideal = Math.round(window.scrollY + expandedRc.top + expandedRc.height / 2 - viewCenter);
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

  if (expandedRc.height > window.innerHeight * 0.85) {
    const topAlign = Math.round(window.scrollY + hdrRc.top - 48);
    window.scrollTo({ top: Math.max(0, Math.min(maxScroll, topAlign)), behavior: 'auto' });
  } else {
    window.scrollTo({ top: Math.max(0, Math.min(maxScroll, ideal)), behavior: 'auto' });
  }

  // Restore CSS transitions
  items.forEach(item => {
    const d = item.querySelector('.pv-list-detail');
    const a = item.querySelector('.pv-list-arrow');
    if (d) d.style.transition = '';
    if (a) a.style.transition = '';
  });

  cylinderScrollFx();
}

// ---- Keyboard shortcuts ----
// ↓/↑ : step one item, expand, center
// →/← : hold to auto-scroll (collapsed)

function onCylinderKeyDown(e) {
  if (!cylinderModeEnabled) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  const key = e.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'].includes(key)) return;
  e.preventDefault();

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (cylinderKeyState[key]) return;
    cylinderKeyState[key] = true;
    cylinderStepTo(key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    if (cylinderKeyState[key]) return;
    cylinderKeyState[key] = true;
    cylinderAutoScrollStart(key === 'ArrowRight' ? 1 : -1);
  }
}

function onCylinderKeyUp(e) {
  if (!cylinderModeEnabled) return;
  const key = e.key;
  if (!['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'].includes(key)) return;
  cylinderKeyState[key] = false;
  if (key === 'ArrowRight' || key === 'ArrowLeft') cylinderAutoScrollStop();
}

// ---- Step: one item, force expand + center via settle ----

function cylinderStepTo(offset) {
  const listEl = document.getElementById('preview-list');
  if (!listEl) return;
  const items = Array.from(listEl.querySelectorAll('.pv-list-item'));
  if (items.length === 0) return;

  cylinderLocked = true;
  if (cylinderSettleTimer) { clearTimeout(cylinderSettleTimer); cylinderSettleTimer = null; }

  const viewCenter = window.innerHeight / 2;
  let closestIdx = 0, closestDist = Infinity;
  items.forEach((item, i) => {
    const hdr = item.querySelector('.pv-list-header');
    if (!hdr) return;
    const rc = hdr.getBoundingClientRect();
    const dist = Math.abs(rc.top + rc.height / 2 - viewCenter);
    if (dist < closestDist) { closestDist = dist; closestIdx = i; }
  });

  const targetIdx = Math.max(0, Math.min(items.length - 1, closestIdx + offset));
  if (targetIdx === closestIdx) { cylinderLocked = false; return; }

  // Kill CSS transitions on detail/arrow so layout settles instantly
  items.forEach(item => {
    const d = item.querySelector('.pv-list-detail');
    const a = item.querySelector('.pv-list-arrow');
    if (d) d.style.transition = 'none';
    if (a) a.style.transition = 'none';
  });

  // Expand target, collapse others (instant — no CSS transition running)
  items.forEach((item, i) => {
    const d = item.querySelector('.pv-list-detail');
    const a = item.querySelector('.pv-list-arrow');
    if (i === targetIdx) {
      if (d) d.classList.add('show');
      if (a) a.style.transform = 'rotate(180deg)';
    } else {
      if (d) d.classList.remove('show', 'half-show');
      if (a) a.style.transform = '';
    }
  });

  // Force reflow — browser now has final layout
  void items[targetIdx].offsetHeight;

  // Calculate exact center position with stable layout
  const targetItem = items[targetIdx];
  const targetHeader = targetItem.querySelector('.pv-list-header');
  const hdrRc = targetHeader.getBoundingClientRect();
  const expandedRc = targetItem.getBoundingClientRect();
  // Center the whole item (not just header) in viewport
  const ideal = Math.round(window.scrollY + expandedRc.top + expandedRc.height / 2 - viewCenter);
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

  if (expandedRc.height > window.innerHeight * 0.85) {
    const topAlign = Math.round(window.scrollY + hdrRc.top - 48);
    window.scrollTo({ top: Math.max(0, Math.min(maxScroll, topAlign)), behavior: 'auto' });
  } else {
    window.scrollTo({ top: Math.max(0, Math.min(maxScroll, ideal)), behavior: 'auto' });
  }

  // Restore CSS transitions for future smooth animations
  items.forEach(item => {
    const d = item.querySelector('.pv-list-detail');
    const a = item.querySelector('.pv-list-arrow');
    if (d) d.style.transition = '';
    if (a) a.style.transition = '';
  });

  cylinderLocked = false;
  cylinderScrollFx();
}

// ---- Auto-scroll (→/← hold) ----

function cylinderAutoScrollStart(dir) {
  const listEl = document.getElementById('preview-list');
  if (!listEl) return;
  // Collapse all, clear inline styles
  listEl.querySelectorAll('.pv-list-detail').forEach(d => d.classList.remove('show', 'half-show'));
  listEl.querySelectorAll('.pv-list-arrow').forEach(a => a.style.transform = '');
  listEl.querySelectorAll('.pv-list-item').forEach(item => {
    item.style.transform = '';
    item.style.opacity = '';
  });

  const speed = 8;
  function tick() {
    if (!cylinderKeyState['ArrowRight'] && !cylinderKeyState['ArrowLeft']) {
      cylinderAutoScrollId = null;
      if (cylinderModeEnabled) cylinderSettle();
      return;
    }
    window.scrollBy(0, dir * speed);
    cylinderAutoScrollId = requestAnimationFrame(tick);
  }
  cylinderAutoScrollId = requestAnimationFrame(tick);
}

function cylinderAutoScrollStop() {
  // tick detects key release and auto-settles
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

  updatePreviewCounter();

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

// Virtual list for preview mode
let virtualListState = {
  enabled: false,
  startIndex: 0,
  endIndex: 0,
  itemHeight: 70,
  buffer: 10,
  scrollTimer: null
};

function renderPreviewList() {
  const typeLabels = {single_choice:'单选',multiple_choice:'多选',true_false:'判断',calculation:'计算',subjective:'主观'};

  virtualListState.enabled = previewList.length > 80 && !cylinderModeEnabled;

  if (!virtualListState.enabled) {
    let html = '';
    previewList.forEach((q, i) => {
      html += buildPreviewListItemHTML(q, i, typeLabels);
    });
    document.getElementById('preview-list').innerHTML = html;
    return;
  }

  const totalHeight = previewList.length * virtualListState.itemHeight;
  virtualListState.buffer = 8;

  const wrapperHtml = `<div id="virtual-list-wrapper" style="height:${totalHeight}px;position:relative"></div>`;
  document.getElementById('preview-list').innerHTML = wrapperHtml;

  const listEl = document.getElementById('preview-list');
  listEl.addEventListener('scroll', onVirtualScroll, { passive: true });

  // Force reflow so clientHeight is valid, then populate virtual list
  void listEl.offsetHeight;
  updateVirtualList();
}

function buildPreviewListItemHTML(q, i, typeLabels) {
  const typeLabel = typeLabels[q.type] || '';
  let metaParts = [];
  if (q.chapter) metaParts.push(q.chapter);
  if (typeLabel) metaParts.push(typeLabel);
  if (Object.keys(sourceData).length > 1) metaParts.push(q.source);
  const brief = q.question.length > 50 ? q.question.substring(0, 50) + '...' : q.question;

  const listItemNoteKey = qKey(q);
  const listItemHasNote = !!wrongBookNotes[listItemNoteKey];

  let html = '<div class="pv-list-item' + (listItemHasNote ? ' has-note' : '') + '" data-index="' + i + '" onclick="togglePreviewListItem(this)">';
  html += '<div class="pv-list-header">';
  html += '<span class="pv-list-num">' + (i + 1) + '</span>';
  html += '<span class="pv-list-meta">' + escHtml(metaParts.join(' · ')) + '</span>';
  html += '<span class="pv-list-brief">' + escHtml(brief) + '</span>';
  html += '<span class="pv-list-arrow">&#9662;</span>';
  html += '</div>';
  html += '<div class="pv-list-detail">';

  let listAnswerTag = '';
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    listAnswerTag = ' <span class="preview-answer-tag">' + (q.answer || '') + '</span>';
  } else if (q.type === 'true_false') {
    listAnswerTag = ' <span class="preview-answer-tag">' + (q.answer === '正确' ? '正确' : q.answer === '错误' ? '错误' : '') + '</span>';
  }
  html += '<div class="question-text" style="font-size:15px;margin-bottom:12px">' + formatQuestionQuotes(escHtml(q.question)) + listAnswerTag + '</div>';

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

  if (q.type === 'calculation' || q.type === 'subjective') {
    html += buildPreviewAnswerHtml(q);
  }

  const listNoteKey = qKey(q);
  const listNote = wrongBookNotes[listNoteKey];
  if (listNote) {
    html += '<div class="note-display">📝 备注：' + escHtml(listNote) + '</div>';
  }

  html += '</div></div>';
  return html;
}

function onVirtualScroll() {
  if (!virtualListState.enabled) return;
  if (virtualListState.scrollTimer) clearTimeout(virtualListState.scrollTimer);
  virtualListState.scrollTimer = setTimeout(() => {
    updateVirtualList();
  }, 16);
}

function updateVirtualList() {
  if (!virtualListState.enabled) return;

  const listEl = document.getElementById('preview-list');
  const wrapperEl = document.getElementById('virtual-list-wrapper');
  if (!wrapperEl) return;

  const scrollTop = listEl.scrollTop;
  const viewHeight = listEl.clientHeight;

  const startIdx = Math.max(0, Math.floor(scrollTop / virtualListState.itemHeight) - virtualListState.buffer);
  const endIdx = Math.min(previewList.length - 1, Math.ceil((scrollTop + viewHeight) / virtualListState.itemHeight) + virtualListState.buffer);

  if (startIdx === virtualListState.startIndex && endIdx === virtualListState.endIndex) return;
  virtualListState.startIndex = startIdx;
  virtualListState.endIndex = endIdx;

  const typeLabels = {single_choice:'单选',multiple_choice:'多选',true_false:'判断',calculation:'计算',subjective:'主观'};

  let html = '';
  html += `<div style="height:${startIdx * virtualListState.itemHeight}px"></div>`;

  for (let i = startIdx; i <= endIdx && i < previewList.length; i++) {
    html += buildPreviewListItemHTML(previewList[i], i, typeLabels);
  }

  const remaining = previewList.length - endIdx - 1;
  if (remaining > 0) {
    html += `<div style="height:${remaining * virtualListState.itemHeight}px"></div>`;
  }

  wrapperEl.innerHTML = html;

  if (cylinderModeEnabled) {
    setTimeout(() => { cylinderSettle(); }, 0);
  }
}

function togglePreviewListItem(el) {
  if (cylinderModeEnabled) {
    // In cylinder mode: just toggle expand/collapse directly
    const detail = el.querySelector('.pv-list-detail');
    const arrow = el.querySelector('.pv-list-arrow');
    const isOpen = detail.classList.contains('show');
    if (isOpen) {
      detail.classList.remove('show');
      if (arrow) arrow.style.transform = '';
    } else {
      detail.classList.add('show');
      if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
    return;
  }
  const detail = el.querySelector('.pv-list-detail');
  const arrow = el.querySelector('.pv-list-arrow');
  const isOpen = detail.classList.contains('show');
  detail.classList.toggle('show', !isOpen);
  arrow.innerHTML = isOpen ? '&#9662;' : '&#9662;';
  arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// Jump to question by number (click on counter)
function jumpToQuestion() {
  if (!previewList.length) return;
  showJumpDialog();
}

function showJumpDialog() {
  // Remove existing dialog if any
  const existing = document.getElementById('jump-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'jump-dialog';
  dialog.innerHTML = `
    <div class="jump-dialog-overlay"></div>
    <div class="jump-dialog-box">
      <div class="jump-dialog-title">跳转到题目</div>
      <div class="jump-dialog-hint">输入题号 (1-${previewList.length})</div>
      <input type="number" class="jump-dialog-input" min="1" max="${previewList.length}" value="${previewIndex + 1}">
      <div class="jump-dialog-btns">
        <button class="jump-dialog-btn cancel">取消</button>
        <button class="jump-dialog-btn confirm">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const input = dialog.querySelector('.jump-dialog-input');
  const cancelBtn = dialog.querySelector('.jump-dialog-btn.cancel');
  const confirmBtn = dialog.querySelector('.jump-dialog-btn.confirm');
  const overlay = dialog.querySelector('.jump-dialog-overlay');

  function close() { dialog.remove(); }
  function doJump() {
    const n = parseInt(input.value, 10);
    if (isNaN(n) || n < 1 || n > previewList.length) {
      input.style.borderColor = '#d73522ff';
      input.focus();
      return;
    }
    close();
    const targetIdx = n - 1;
    if (previewViewMode === 'list' && cylinderModeEnabled) {
      const listEl = document.getElementById('preview-list');
      if (!listEl) return;
      const items = listEl.querySelectorAll('.pv-list-item');
      if (items[targetIdx]) {
        cylinderLocked = true;
        if (cylinderSettleTimer) { clearTimeout(cylinderSettleTimer); cylinderSettleTimer = null; }
        const hdr = items[targetIdx].querySelector('.pv-list-header');
        if (hdr) hdr.scrollIntoView({ block: 'center' });
        requestAnimationFrame(() => { cylinderScrollFx(); });
        setTimeout(() => { cylinderLocked = false; cylinderSettle(); }, 400);
      }
    } else {
      previewIndex = targetIdx;
      renderPreviewItem();
    }
  }

  cancelBtn.onclick = close;
  overlay.onclick = close;
  confirmBtn.onclick = doJump;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') doJump();
    else if (e.key === 'Escape') close();
  };
  input.focus();
  input.select();
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
// 确保DOM加载完成后再进行初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 初始化调试工具触发监听（独立于 init，确保 DOM 就绪即可）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDebugTrigger);
} else {
  initDebugTrigger();
}
