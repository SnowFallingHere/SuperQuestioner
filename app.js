// ====== 题库配置：新增题库只需在此添加一行 ======
const QUIZ_SOURCES = [
  { file: 'Marxism.json', name: '马克思主义基本原理' },
  // { file: 'math.json', name: '高等数学' },
];

const DIFFICULTIES = ['easy','medium','hard','unknown'];
const DIFF_LABELS = {easy:'易',medium:'中',hard:'难',unknown:'未知'};

let ALL_QUESTIONS = [];
let sourceData = {};

let mode, quizQueue, currentIndex, wrongCount, correctCount, totalAnswered;
let timerInterval, timeLeft, timerPaused;
let infiniteMap;
let timedQuestions;
let customDifficulty = {};
let wrongList = [];
let wrongBookTemp = {};   // temporary wrong - auto added, cleared on correct
let wrongBookLong = {};   // long-term memory - user added, manual remove only
let wrongBookNotes = {};
let streak = 0;
let effectsEnabled = null; // null = not asked yet, true/false
let wrongSummaryCollapsed = false;

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
    const count = sourceData[s.name] ? sourceData[s.name].length : 0;
    html += '<div class="source-chip active" data-idx="'+i+'" data-type="source" onclick="toggleSource(this)">' +
      s.name + '<span class="count">(' + count + '题)</span></div>';
  });
  // Wrong book chip - green, clickable to browse
  html += '<div class="source-chip green' + (totalCount > 0 ? ' active' : '') + '" data-type="wrongbook" onclick="openWrongBook()">' +
    '错题本<span class="count">(' + totalCount + '题)</span>' +
    '<span class="count-detail">暂' + tempCount + '/长' + longCount + '</span></div>';
  html += '</div></div>';
  area.innerHTML = html;
  document.getElementById('mode-area').classList.remove('hidden');
  updateActiveQuestions();
}

function toggleSource(el) {
  el.classList.toggle('active');
  updateActiveQuestions();
}

function updateActiveQuestions() {
  ALL_QUESTIONS = [];
  document.querySelectorAll('.source-chip.active').forEach(chip => {
    if (chip.dataset.type === 'wrongbook') return; // skip wrongbook chip
    const idx = parseInt(chip.dataset.idx);
    const name = QUIZ_SOURCES[idx].name;
    ALL_QUESTIONS = ALL_QUESTIONS.concat(sourceData[name]);
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
const PAGES = ['page-home','page-config','page-quiz','page-result','page-wrong-review','page-wrongbook'];
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
function startChallenge() {
  if (ALL_QUESTIONS.length === 0) return;
  mode = 'challenge';
  wrongCount = 0; correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  quizQueue = shuffle(ALL_QUESTIONS);
  currentIndex = 0;
  show('page-quiz');
  document.getElementById('gear-btn').classList.add('hidden');
  renderQuestion();
}

// ====== Infinite Mode ======
function startInfinite() {
  if (ALL_QUESTIONS.length === 0) return;
  mode = 'infinite';
  correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  infiniteMap = {};
  const savedProgress = localStorage.getItem('infiniteProgress');
  if (savedProgress) {
    try {
      const parsed = JSON.parse(savedProgress);
      const savedKeys = Object.keys(parsed).sort();
      const currentKeys = ALL_QUESTIONS.map(q => qKey(q)).sort();
      if (savedKeys.join(',') === currentKeys.join(',')) {
        infiniteMap = parsed;
      } else {
        ALL_QUESTIONS.forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
      }
    } catch(e) {
      ALL_QUESTIONS.forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
    }
  } else {
    ALL_QUESTIONS.forEach(q => infiniteMap[qKey(q)] = {correctCount: 0});
  }
  quizQueue = shuffle(ALL_QUESTIONS);
  currentIndex = 0;
  show('page-quiz');
  document.getElementById('gear-btn').classList.remove('hidden');
  renderQuestion();
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

function saveInfiniteProgress() {
  if (mode === 'infinite' && infiniteMap) {
    localStorage.setItem('infiniteProgress', JSON.stringify(infiniteMap));
  }
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
  const chapters = [...new Set(ALL_QUESTIONS.map(q => q.chapter).filter(Boolean))];
  const chapterSection = document.getElementById('config-chapter-section');
  if (chapters.length > 0) {
    chapterSection.classList.remove('hidden');
    document.getElementById('chapter-chips').innerHTML =
      chapters.map(ch => '<div class="chip" data-val="'+ch+'" onclick="toggleChip(this)">'+ch+'</div>').join('');
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
  checkTimedReady();
}

function toggleChip(el) {
  el.classList.toggle('active');
  checkTimedReady();
}

function checkTimedReady() {
  const ch = document.querySelectorAll('#chapter-chips .chip.active');
  const df = document.querySelectorAll('#difficulty-chips .chip.active');
  const hasChapters = !document.getElementById('config-chapter-section').classList.contains('hidden');
  const hasDiff = !document.getElementById('config-difficulty-section').classList.contains('hidden');
  if (!hasChapters && !hasDiff) {
    document.getElementById('btn-start-timed').disabled = false;
  } else {
    document.getElementById('btn-start-timed').disabled = (ch.length === 0 && df.length === 0);
  }
}

function startTimed() {
  const chSelected = [...document.querySelectorAll('#chapter-chips .chip.active')].map(e => e.dataset.val);
  const dfSelected = [...document.querySelectorAll('#difficulty-chips .chip.active')].map(e => e.dataset.val);
  let pool = ALL_QUESTIONS;
  if (chSelected.length > 0) pool = pool.filter(q => chSelected.includes(q.chapter));
  if (dfSelected.length > 0) pool = pool.filter(q => dfSelected.includes(getDifficulty(q)));
  if (pool.length === 0) { alert('没有符合条件的题目'); return; }
  mode = 'timed';
  timedQuestions = shuffle(pool).slice(0, 50);
  quizQueue = timedQuestions;
  currentIndex = 0;
  wrongCount = 0; correctCount = 0; totalAnswered = 0; streak = 0;
  wrongList = [];
  timeLeft = 600; timerPaused = false;
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
function toggleNoteArea() {
  const panel = document.getElementById('note-panel');
  const toggle = document.getElementById('note-toggle');
  panel.classList.toggle('hidden');
  toggle.classList.toggle('active');
}

function saveNote() {
  const q = quizQueue[currentIndex];
  const key = qKey(q);
  const val = document.getElementById('note-input').value.trim();
  if (val) {
    wrongBookNotes[key] = val;
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
  catEl.innerHTML =
    '<span class="cat-label">分类：</span>' +
    '<span class="cat-chip' + (inTemp ? ' active' : '') + '" onclick="setWrongCategory(\'temp\')">暂时错题</span>' +
    '<span class="cat-chip' + (inLong ? ' active-long' : '') + '" onclick="setWrongCategory(\'long\')">长期记忆</span>' +
    '<span class="cat-label" style="margin-left:8px">特效：</span>' +
    '<span class="cat-chip' + (effectsEnabled !== false ? ' active' : '') + '" onclick="toggleEffects()">连击</span>';

  // Note
  document.getElementById('note-input').value = wrongBookNotes[key] || '';

  // Auto-show if in any book or has note
  const panel = document.getElementById('note-panel');
  const toggle = document.getElementById('note-toggle');
  if (inTemp || inLong || wrongBookNotes[key]) {
    panel.classList.remove('hidden');
    toggle.classList.add('active');
  } else {
    panel.classList.add('hidden');
    toggle.classList.remove('active');
  }
}

function toggleEffects() {
  effectsEnabled = effectsEnabled === false ? true : false;
  localStorage.setItem('effectsEnabled', String(effectsEnabled));
  const q = quizQueue[currentIndex];
  renderNotePanel(q);
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

  if (mode === 'challenge' && wrongCount >= 100) { showResult(); return; }
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

  let info = '';
  if (mode === 'challenge') info = '闯关 | 对' + correctCount + ' 错' + wrongCount;
  else if (mode === 'infinite') {
    const mastered = ALL_QUESTIONS.filter(x => infiniteMap[qKey(x)].correctCount >= 3).length;
    info = '无限 | 已掌握 ' + mastered + '/' + ALL_QUESTIONS.length;
  }
  else if (mode === 'timed') info = '限时 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  else if (mode === 'wrongbook') info = '错题本 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  document.getElementById('quiz-info').textContent = info;

  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断'}[q.type] || '';
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

  document.getElementById('question-text').textContent = q.question;

  const area = document.getElementById('options-area');
  area.innerHTML = '';

  if (q.type === 'true_false') {
    area.innerHTML = '<div class="tf-buttons">' +
      '<div class="tf-btn" onclick="answerTF(true)">正确</div>' +
      '<div class="tf-btn" onclick="answerTF(false)">错误</div></div>';
  } else {
    const isMulti = q.type === 'multiple_choice';
    let html = '<div class="options">';
    (q.options || []).forEach(opt => {
      const label = opt.label || '';
      const text = opt.text || '';
      html += '<div class="option" data-label="'+label+'" onclick="clickOption(this,'+isMulti+')">' +
        label + (label ? '. ' : '') + text + '</div>';
    });
    html += '</div>';
    if (isMulti) {
      html += '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="btn-confirm-multi" onclick="confirmMulti()">确认</button></div>';
    }
    area.innerHTML = html;
  }

  const fb = document.getElementById('answer-feedback');
  fb.className = 'answer-feedback';
  fb.textContent = '';

  // Note panel
  renderNotePanel(q);
}

function clickOption(el, isMulti) {
  if (answered) return;
  if (!isMulti) {
    const q = quizQueue[currentIndex];
    const selected = el.dataset.label;
    judge(selected === q.answer, q.answer, selected);
  } else {
    el.classList.toggle('selected');
  }
}

function confirmMulti() {
  if (answered) return;
  const q = quizQueue[currentIndex];
  const selected = [...document.querySelectorAll('.option.selected')].map(e => e.dataset.label).sort().join('');
  const correct = q.answer.split('').sort().join('');
  judge(selected === correct, q.answer, selected);
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
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '回答错误！正确答案：' + correctAnswer;
  }

  totalAnswered++;
  const key = qKey(q);

  if (isCorrect) {
    correctCount++;
    streak++;
    if (mode === 'infinite') infiniteMap[qKey(q)].correctCount++;
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
      infiniteMap[qKey(q)].correctCount = 0;
      quizQueue.push(q);
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

  autoNextTimeout = setTimeout(() => {
    if (mode === 'timed') timerPaused = false;
    renderQuestion();
  }, 1500);
}

function quitQuiz() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);
  if (mode === 'infinite') saveInfiniteProgress();
  if (totalAnswered > 0) showResult();
  else showHome();
}

// ====== Result ======
function showResult() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);
  if (mode === 'infinite') saveInfiniteProgress();

  show('page-result');
  const title = document.getElementById('result-title');
  const stats = document.getElementById('result-stats');

  const rate = totalAnswered > 0 ? Math.round(correctCount / totalAnswered * 100) : 0;

  if (mode === 'challenge') {
    title.textContent = wrongCount >= 100 ? '闯关失败' : '已退出';
  } else if (mode === 'infinite') {
    const mastered = ALL_QUESTIONS.filter(q => infiniteMap[qKey(q)].correctCount >= 3).length;
    title.textContent = mastered === ALL_QUESTIONS.length ? '全部掌握！' : '已退出';
    stats.innerHTML =
      '<div class="stat"><div class="stat-num green">' + mastered + '</div><div class="stat-label">已掌握</div></div>' +
      '<div class="stat"><div class="stat-num red">' + (ALL_QUESTIONS.length - mastered) + '</div><div class="stat-label">未掌握</div></div>' +
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
function renderWrongSummary() {
  const list = document.getElementById('wrong-summary-list');
  let html = '';
  wrongList.forEach((item, i) => {
    const q = item.question;
    const sel = item.selectedAnswer;
    const ans = q.answer;
    const brief = q.question.length > 30 ? q.question.substring(0, 30) + '...' : q.question;
    html += '<div class="wrong-item">' +
      '<div class="wrong-item-header" onclick="toggleWrongItem(this)">' +
      '<span class="wrong-item-num">' + (i+1) + '</span>' +
      '<span class="wrong-item-brief">' + escHtml(brief) + '</span>' +
      '<span class="wrong-item-ans"><span class="wrong-sel">选 ' + escHtml(sel) + '</span> → <span class="correct-ans">答 ' + escHtml(ans) + '</span></span>' +
      '</div>' +
      '<div class="wrong-item-detail">' +
      '<div class="detail-q">' + escHtml(q.question) + '</div>';

    if (q.type === 'true_false') {
      html += '<div class="detail-opt' + (sel === '正确' ? ' wrong' : '') + '">正确' + (sel === '正确' ? ' ← 你的选择' : '') + '</div>';
      html += '<div class="detail-opt' + (sel === '错误' ? ' wrong' : '') + '">错误' + (sel === '错误' ? ' ← 你的选择' : '') + '</div>';
      html += '<div class="detail-opt correct">正确答案：' + ans + '</div>';
    } else {
      (q.options || []).forEach(opt => {
        const label = opt.label || '';
        const text = opt.text || '';
        const isCorrectOpt = q.type === 'multiple_choice' ? ans.includes(label) : label === ans;
        const isSelected = q.type === 'multiple_choice' ? sel.includes(label) : label === sel;
        let cls = 'detail-opt';
        if (isCorrectOpt) cls += ' correct';
        if (isSelected && !isCorrectOpt) cls += ' wrong';
        html += '<div class="' + cls + '">' + label + (label ? '. ' : '') + escHtml(text) +
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
  html += '<div class="question-text">' + escHtml(q.question) + '</div>';

  if (q.type === 'true_false') {
    html += '<div class="review-option' + (selected === '正确' ? ' wrong' : '') + '">正确' + (selected === '正确' ? ' (你的选择)' : '') + '</div>';
    html += '<div class="review-option' + (selected === '错误' ? ' wrong' : '') + '">错误' + (selected === '错误' ? ' (你的选择)' : '') + '</div>';
    html += '<div class="review-answer correct-ans">正确答案：' + q.answer + '</div>';
  } else {
    (q.options || []).forEach(opt => {
      const label = opt.label || '';
      const text = opt.text || '';
      const isCorrectOpt = q.type === 'multiple_choice' ? q.answer.includes(label) : label === q.answer;
      const isSelected = q.type === 'multiple_choice' ? selected.includes(label) : label === selected;
      let cls = 'review-option';
      if (isCorrectOpt) cls += ' correct';
      else if (isSelected) cls += ' wrong';
      else cls += ' neutral';
      html += '<div class="' + cls + '">' + label + (label ? '. ' : '') + escHtml(text) +
        (isSelected ? ' (你的选择)' : '') + (isCorrectOpt && !isSelected ? ' (正确)' : '') + '</div>';
    });
    html += '<div class="review-answer correct-ans">正确答案：' + q.answer + '</div>';
  }

  const key = qKey(q);
  const note = wrongBookNotes[key];
  if (note) {
    html += '<div style="margin-top:12px;padding:8px 12px;background:#fff8e1;border-radius:6px;font-size:13px;color:#8d6e00;">备注：' + escHtml(note) + '</div>';
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

function openWrongBook() {
  const tempCount = Object.keys(wrongBookTemp).length;
  const longCount = Object.keys(wrongBookLong).length;
  if (tempCount + longCount === 0) return;
  wbFilter = 'all';
  wbIndex = 0;
  buildWbList();
  show('page-wrongbook');
  renderWbView();
}

function buildWbList() {
  wbList = [];
  if (wbFilter === 'all' || wbFilter === 'temp') {
    Object.entries(wrongBookTemp).forEach(([key, q]) => {
      wbList.push({ key, q, cat: 'temp' });
    });
  }
  if (wbFilter === 'all' || wbFilter === 'long') {
    Object.entries(wrongBookLong).forEach(([key, q]) => {
      wbList.push({ key, q, cat: 'long' });
    });
  }
}

function setWbFilter(el) {
  wbFilter = el.dataset.filter;
  document.querySelectorAll('#wb-filter-row .chip').forEach(c => {
    c.classList.remove('active', 'active-green');
    c.style.background = ''; c.style.color = ''; c.style.borderColor = '';
  });
  el.classList.add('active');
  wbIndex = 0;
  buildWbList();
  renderWbView();
}

function renderWbView() {
  if (wbFilter === 'all') {
    renderWbList();
  } else {
    renderWbItem();
  }
}

// List view for "all" filter
function renderWbList() {
  const cardEl = document.getElementById('wb-card');
  const counterEl = document.getElementById('wb-counter');
  const btnAction = document.getElementById('btn-wb-action');
  const btnPrev = document.getElementById('btn-wb-prev');
  const btnNext = document.getElementById('btn-wb-next');

  counterEl.textContent = '共 ' + wbList.length + ' 题';
  btnPrev.classList.add('hidden');
  btnNext.classList.add('hidden');
  btnAction.classList.add('hidden');
  document.getElementById('btn-wb-remove').classList.add('hidden');

  if (wbList.length === 0) {
    cardEl.innerHTML = '<div style="text-align:center;color:#999;padding:40px">暂无错题</div>';
    return;
  }

  let html = '<div class="wb-list">';
  wbList.forEach((item, i) => {
    const q = item.q;
    const brief = q.question.length > 28 ? q.question.substring(0, 28) + '...' : q.question;
    const catTag = item.cat === 'temp'
      ? '<span class="wb-cat-temp">暂</span>'
      : '<span class="wb-cat-long">长</span>';
    html += '<div class="wb-list-item" onclick="wbOpenItem(' + i + ')">' +
      catTag +
      '<span class="wb-list-num">' + (i + 1) + '</span>' +
      '<span class="wb-list-text">' + escHtml(brief) + '</span>' +
      '<span class="wb-list-ans">答案：' + escHtml(q.answer) + '</span>' +
      '</div>';
  });
  html += '</div>';
  cardEl.innerHTML = html;
}

// Card view for temp/long filter
function renderWbItem() {
  const cardEl = document.getElementById('wb-card');
  const counterEl = document.getElementById('wb-counter');
  const btnAction = document.getElementById('btn-wb-action');
  const btnPrev = document.getElementById('btn-wb-prev');
  const btnNext = document.getElementById('btn-wb-next');

  btnPrev.classList.remove('hidden');
  btnNext.classList.remove('hidden');
  btnAction.classList.remove('hidden');
  document.getElementById('btn-wb-remove').classList.remove('hidden');

  if (wbList.length === 0) {
    counterEl.textContent = '0 / 0';
    cardEl.innerHTML = '<div style="text-align:center;color:#999;padding:40px">暂无错题</div>';
    btnAction.textContent = '无操作';
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
  metaParts.push(item.cat === 'temp' ? '暂时错题' : '长期记忆');

  let html = '<div class="question-meta">' + metaParts.join(' · ') + '</div>';
  html += '<div class="question-text">' + escHtml(q.question) + '</div>';

  if (q.type === 'true_false') {
    html += '<div class="review-option' + (q.answer === '正确' ? ' correct' : ' neutral') + '">正确' + (q.answer === '正确' ? ' (答案)' : '') + '</div>';
    html += '<div class="review-option' + (q.answer === '错误' ? ' correct' : ' neutral') + '">错误' + (q.answer === '错误' ? ' (答案)' : '') + '</div>';
  } else {
    (q.options || []).forEach(opt => {
      const label = opt.label || '';
      const text = opt.text || '';
      const isCorrectOpt = q.type === 'multiple_choice' ? q.answer.includes(label) : label === q.answer;
      let cls = 'review-option';
      if (isCorrectOpt) cls += ' correct';
      else cls += ' neutral';
      html += '<div class="' + cls + '">' + label + (label ? '. ' : '') + escHtml(text) +
        (isCorrectOpt ? ' (答案)' : '') + '</div>';
    });
  }

  const note = wrongBookNotes[item.key];
  if (note) {
    html += '<div style="margin-top:12px;padding:8px 12px;background:#fff8e1;border-radius:6px;font-size:13px;color:#8d6e00;">备注：' + escHtml(note) + '</div>';
  }

  cardEl.innerHTML = html;

  if (item.cat === 'temp') {
    btnAction.textContent = '转为长期记忆';
    btnAction.className = 'btn btn-book-green';
  } else {
    btnAction.textContent = '转为暂时错题';
    btnAction.className = 'btn btn-primary';
  }
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

function wbRemove() {
  if (wbList.length === 0) return;
  const item = wbList[wbIndex];
  const key = item.key;
  if (item.cat === 'temp') {
    delete wrongBookTemp[key];
  } else {
    delete wrongBookLong[key];
  }
  localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
  localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  buildWbList();
  if (wbIndex >= wbList.length) wbIndex = wbList.length - 1;
  renderWbItem();
}

function wbToggleCategory() {
  if (wbList.length === 0) return;
  const item = wbList[wbIndex];
  const key = item.key;
  const q = item.q;
  if (item.cat === 'temp') {
    delete wrongBookTemp[key];
    wrongBookLong[key] = q;
  } else {
    delete wrongBookLong[key];
    wrongBookTemp[key] = q;
  }
  localStorage.setItem('wrongBookTemp', JSON.stringify(wrongBookTemp));
  localStorage.setItem('wrongBookLong', JSON.stringify(wrongBookLong));
  buildWbList();
  renderWbItem();
}

// ====== Start ======
init();
