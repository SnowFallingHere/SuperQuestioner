import json
import html

with open(r"h:\tencent\download\24-25-1题库\questions.json", "r", encoding="utf-8") as f:
    data = json.load(f)

json_str = json.dumps(data, ensure_ascii=False)

page = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>题库练习</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, "Microsoft YaHei", sans-serif; background: #f5f5f5; color: #333; min-height: 100vh; }
.container { max-width: 640px; margin: 0 auto; padding: 20px; }

/* Home */
.home-title { text-align: center; font-size: 24px; margin: 40px 0 30px; font-weight: 600; }
.mode-cards { display: flex; flex-direction: column; gap: 16px; }
.mode-card { background: #fff; border-radius: 12px; padding: 24px; cursor: pointer; border: 2px solid #e8e8e8; transition: border-color .2s, box-shadow .2s; }
.mode-card:hover { border-color: #4a90d9; box-shadow: 0 2px 12px rgba(74,144,217,.15); }
.mode-card h2 { font-size: 18px; margin-bottom: 8px; }
.mode-card p { font-size: 14px; color: #888; line-height: 1.5; }

/* Config */
.config-section { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.config-section h3 { font-size: 16px; margin-bottom: 12px; }
.chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 14px; border-radius: 20px; border: 1px solid #ddd; font-size: 14px; cursor: pointer; user-select: none; transition: all .15s; }
.chip.active { background: #4a90d9; color: #fff; border-color: #4a90d9; }
.btn { display: inline-block; padding: 10px 28px; border-radius: 8px; border: none; font-size: 16px; cursor: pointer; transition: opacity .15s; }
.btn-primary { background: #4a90d9; color: #fff; }
.btn-primary:hover { opacity: .85; }
.btn-primary:disabled { opacity: .4; cursor: default; }
.btn-secondary { background: #e8e8e8; color: #333; }
.btn-secondary:hover { background: #ddd; }
.btn-row { display: flex; gap: 12px; justify-content: center; margin-top: 20px; }

/* Quiz */
.quiz-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 14px; color: #888; }
.quiz-header .timer { font-size: 18px; font-weight: 600; color: #e74c3c; }
.quiz-card { background: #fff; border-radius: 12px; padding: 24px; }
.question-text { font-size: 17px; line-height: 1.7; margin-bottom: 20px; font-weight: 500; }
.question-meta { font-size: 12px; color: #aaa; margin-bottom: 8px; }
.options { display: flex; flex-direction: column; gap: 10px; }
.option { padding: 12px 16px; border-radius: 8px; border: 1px solid #e0e0e0; cursor: pointer; font-size: 15px; line-height: 1.5; transition: all .15s; user-select: none; }
.option:hover { background: #f8f8f8; }
.option.selected { border-color: #4a90d9; background: #eef4fb; }
.option.correct { border-color: #27ae60; background: #eafaf1; color: #1e8449; }
.option.wrong { border-color: #e74c3c; background: #fdf0ef; color: #c0392b; }
.option.disabled { pointer-events: none; }
.tf-buttons { display: flex; gap: 12px; }
.tf-btn { flex: 1; padding: 14px; border-radius: 8px; border: 1px solid #e0e0e0; cursor: pointer; font-size: 16px; text-align: center; transition: all .15s; user-select: none; }
.tf-btn:hover { background: #f8f8f8; }
.tf-btn.correct { border-color: #27ae60; background: #eafaf1; color: #1e8449; }
.tf-btn.wrong { border-color: #e74c3c; background: #fdf0ef; color: #c0392b; }
.tf-btn.disabled { pointer-events: none; }
.answer-feedback { margin-top: 16px; padding: 12px 16px; border-radius: 8px; font-size: 14px; display: none; }
.answer-feedback.show { display: block; }
.answer-feedback.correct-fb { background: #eafaf1; color: #1e8449; }
.answer-feedback.wrong-fb { background: #fdf0ef; color: #c0392b; }

/* Result */
.result-card { background: #fff; border-radius: 12px; padding: 32px; text-align: center; }
.result-card h2 { font-size: 22px; margin-bottom: 16px; }
.result-stats { display: flex; justify-content: center; gap: 32px; margin: 20px 0; }
.stat { text-align: center; }
.stat-num { font-size: 32px; font-weight: 700; }
.stat-label { font-size: 13px; color: #888; margin-top: 4px; }
.stat-num.green { color: #27ae60; }
.stat-num.red { color: #e74c3c; }

.hidden { display: none !important; }
</style>
</head>
<body>
<div class="container">

<!-- Home -->
<div id="page-home">
  <div class="home-title">题库练习</div>
  <div class="mode-cards">
    <div class="mode-card" onclick="startChallenge()">
      <h2>闯关模式</h2>
      <p>答错100道即失败，看你能坚持多久</p>
    </div>
    <div class="mode-card" onclick="startInfinite()">
      <h2>无限模式</h2>
      <p>答对3次的题不再出现，错题会反复出现直到掌握</p>
    </div>
    <div class="mode-card" onclick="showTimedConfig()">
      <h2>限时模式</h2>
      <p>选择章节和难度，10分钟内答完50题</p>
    </div>
  </div>
</div>

<!-- Timed Config -->
<div id="page-config" class="hidden">
  <div class="config-section">
    <h3>选择章节</h3>
    <div class="chip-group" id="chapter-chips"></div>
  </div>
  <div class="config-section">
    <h3>选择难度</h3>
    <div class="chip-group" id="difficulty-chips"></div>
  </div>
  <div class="btn-row">
    <button class="btn btn-secondary" onclick="showHome()">返回</button>
    <button class="btn btn-primary" id="btn-start-timed" onclick="startTimed()" disabled>开始</button>
  </div>
</div>

<!-- Quiz -->
<div id="page-quiz" class="hidden">
  <div class="quiz-header">
    <span id="quiz-info"></span>
    <span id="quiz-timer" class="timer hidden"></span>
  </div>
  <div class="quiz-card">
    <div class="question-meta" id="question-meta"></div>
    <div class="question-text" id="question-text"></div>
    <div id="options-area"></div>
    <div class="answer-feedback" id="answer-feedback"></div>
  </div>
  <div class="btn-row" id="quiz-btns">
    <button class="btn btn-secondary" onclick="quitQuiz()">退出</button>
  </div>
</div>

<!-- Result -->
<div id="page-result" class="hidden">
  <div class="result-card">
    <h2 id="result-title"></h2>
    <div class="result-stats" id="result-stats"></div>
    <button class="btn btn-primary" onclick="showHome()">返回首页</button>
  </div>
</div>

</div>

<script>
const QUESTIONS = ''' + json_str + ''';

const CHAPTERS = [...new Set(QUESTIONS.map(q => q.chapter))];
const DIFFICULTIES = ['easy','medium','hard','unknown'];
const DIFF_LABELS = {easy:'易',medium:'中',hard:'难',unknown:'未知'};

let mode, quizQueue, currentIndex, wrongCount, correctCount, totalAnswered;
let timerInterval, timeLeft, timerPaused;
let infiniteMap; // seq -> {correctCount:0}
let timedQuestions;

function show(id) {
  ['page-home','page-config','page-quiz','page-result'].forEach(p => {
    document.getElementById(p).classList.toggle('hidden', p !== id);
  });
}
function showHome() { clearInterval(timerInterval); show('page-home'); }

// --- Shuffle ---
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Challenge Mode ---
function startChallenge() {
  mode = 'challenge';
  wrongCount = 0; correctCount = 0; totalAnswered = 0;
  quizQueue = shuffle(QUESTIONS);
  currentIndex = 0;
  show('page-quiz');
  renderQuestion();
}

// --- Infinite Mode ---
function startInfinite() {
  mode = 'infinite';
  correctCount = 0; totalAnswered = 0;
  infiniteMap = {};
  QUESTIONS.forEach(q => infiniteMap[q.sequence] = {correctCount: 0});
  quizQueue = shuffle(QUESTIONS);
  currentIndex = 0;
  show('page-quiz');
  renderQuestion();
}

function infiniteNextIndex() {
  // Find next question that hasn't been mastered (correctCount < 3)
  for (let i = currentIndex; i < quizQueue.length; i++) {
    if (infiniteMap[quizQueue[i].sequence].correctCount < 3) return i;
  }
  // Wrap around, filter out mastered
  const remaining = quizQueue.filter(q => infiniteMap[q.sequence].correctCount < 3);
  if (remaining.length === 0) return -1; // all mastered
  // Re-shuffle remaining and append
  const shuffled = shuffle(remaining);
  quizQueue = quizQueue.concat(shuffled);
  return currentIndex;
}

// --- Timed Mode ---
function showTimedConfig() {
  show('page-config');
  const cc = document.getElementById('chapter-chips');
  const dc = document.getElementById('difficulty-chips');
  cc.innerHTML = CHAPTERS.map(ch => '<div class="chip" data-val="'+ch+'" onclick="toggleChip(this)">'+ch+'</div>').join('');
  dc.innerHTML = DIFFICULTIES.map(d => '<div class="chip" data-val="'+d+'" onclick="toggleChip(this)">'+DIFF_LABELS[d]+'</div>').join('');
  checkTimedReady();
}

function toggleChip(el) {
  el.classList.toggle('active');
  checkTimedReady();
}

function checkTimedReady() {
  const ch = document.querySelectorAll('#chapter-chips .chip.active');
  const df = document.querySelectorAll('#difficulty-chips .chip.active');
  document.getElementById('btn-start-timed').disabled = (ch.length === 0 && df.length === 0);
}

function startTimed() {
  const chSelected = [...document.querySelectorAll('#chapter-chips .chip.active')].map(e => e.dataset.val);
  const dfSelected = [...document.querySelectorAll('#difficulty-chips .chip.active')].map(e => e.dataset.val);

  let pool = QUESTIONS;
  if (chSelected.length > 0) pool = pool.filter(q => chSelected.includes(q.chapter));
  if (dfSelected.length > 0) pool = pool.filter(q => dfSelected.includes(q.difficulty));

  if (pool.length === 0) { alert('没有符合条件的题目'); return; }

  mode = 'timed';
  timedQuestions = shuffle(pool).slice(0, 50);
  quizQueue = timedQuestions;
  currentIndex = 0;
  wrongCount = 0; correctCount = 0; totalAnswered = 0;
  timeLeft = 600; timerPaused = false;

  show('page-quiz');
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
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        showResult();
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  document.getElementById('quiz-timer').textContent = m + ':' + String(s).padStart(2, '0');
}

// --- Render Question ---
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
  if (currentIndex >= quizQueue.length) {
    // For challenge, reshuffle if we run out
    quizQueue = quizQueue.concat(shuffle(QUESTIONS));
  }

  const q = quizQueue[currentIndex];

  // Header
  let info = '';
  if (mode === 'challenge') info = '闯关 | 对' + correctCount + ' 错' + wrongCount;
  else if (mode === 'infinite') {
    const mastered = QUESTIONS.filter(x => infiniteMap[x.sequence].correctCount >= 3).length;
    info = '无限 | 已掌握 ' + mastered + '/' + QUESTIONS.length;
  }
  else if (mode === 'timed') info = '限时 | ' + (currentIndex + 1) + '/' + quizQueue.length;
  document.getElementById('quiz-info').textContent = info;

  // Meta
  const typeLabel = {single_choice:'单选',multiple_choice:'多选',true_false:'判断'}[q.type];
  document.getElementById('question-meta').textContent = q.chapter + ' · ' + typeLabel + ' · ' + DIFF_LABELS[q.difficulty];

  // Question
  document.getElementById('question-text').textContent = q.question;

  // Options
  const area = document.getElementById('options-area');
  area.innerHTML = '';

  if (q.type === 'true_false') {
    area.innerHTML = '<div class="tf-buttons">' +
      '<div class="tf-btn" onclick="answerTF(true)">正确</div>' +
      '<div class="tf-btn" onclick="answerTF(false)">错误</div>' +
      '</div>';
  } else {
    const isMulti = q.type === 'multiple_choice';
    let html = '<div class="options">';
    q.options.forEach(opt => {
      html += '<div class="option" data-label="'+opt.label+'" onclick="clickOption(this,'+isMulti+')">' +
        opt.label + '. ' + opt.text + '</div>';
    });
    html += '</div>';
    if (isMulti) {
      html += '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" id="btn-confirm-multi" onclick="confirmMulti()">确认</button></div>';
    }
    area.innerHTML = html;
  }

  // Feedback
  const fb = document.getElementById('answer-feedback');
  fb.className = 'answer-feedback';
  fb.textContent = '';
}

function clickOption(el, isMulti) {
  if (answered) return;
  if (!isMulti) {
    // Single choice: immediate judge
    const q = quizQueue[currentIndex];
    const selected = el.dataset.label;
    const isCorrect = selected === q.answer;
    judge(isCorrect, q.answer, selected);
  } else {
    // Multi: toggle selection
    el.classList.toggle('selected');
  }
}

function confirmMulti() {
  if (answered) return;
  const q = quizQueue[currentIndex];
  const selected = [...document.querySelectorAll('.option.selected')].map(e => e.dataset.label).sort().join('');
  const correct = q.answer.split('').sort().join('');
  const isCorrect = selected === correct;
  judge(isCorrect, q.answer, selected);
}

function answerTF(val) {
  if (answered) return;
  const q = quizQueue[currentIndex];
  const selected = val ? '正确' : '错误';
  const isCorrect = selected === q.answer;
  judge(isCorrect, q.answer, selected);
}

function judge(isCorrect, correctAnswer, selectedAnswer) {
  answered = true;
  const q = quizQueue[currentIndex];

  // Pause timer for timed mode
  if (mode === 'timed') timerPaused = true;

  // Highlight
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
    // Hide multi confirm button
    const btn = document.getElementById('btn-confirm-multi');
    if (btn) btn.style.display = 'none';
  }

  // Feedback
  const fb = document.getElementById('answer-feedback');
  if (isCorrect) {
    fb.className = 'answer-feedback show correct-fb';
    fb.textContent = '回答正确！答案：' + correctAnswer;
  } else {
    fb.className = 'answer-feedback show wrong-fb';
    fb.textContent = '回答错误！正确答案：' + correctAnswer;
  }

  // Update stats
  totalAnswered++;
  if (isCorrect) {
    correctCount++;
    if (mode === 'infinite') {
      infiniteMap[q.sequence].correctCount++;
    }
  } else {
    wrongCount++;
    if (mode === 'infinite') {
      infiniteMap[q.sequence].correctCount = 0;
      // Re-add this question to queue
      quizQueue.push(q);
    }
  }

  currentIndex++;

  // Auto next
  autoNextTimeout = setTimeout(() => {
    if (mode === 'timed') timerPaused = false;
    renderQuestion();
  }, 1500);
}

function quitQuiz() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);
  if (totalAnswered > 0) showResult();
  else showHome();
}

// --- Result ---
function showResult() {
  clearTimeout(autoNextTimeout);
  clearInterval(timerInterval);

  show('page-result');
  const title = document.getElementById('result-title');
  const stats = document.getElementById('result-stats');

  if (mode === 'challenge') {
    title.textContent = wrongCount >= 100 ? '闯关失败' : '已退出';
    stats.innerHTML =
      '<div class="stat"><div class="stat-num green">' + correctCount + '</div><div class="stat-label">答对</div></div>' +
      '<div class="stat"><div class="stat-num red">' + wrongCount + '</div><div class="stat-label">答错</div></div>' +
      '<div class="stat"><div class="stat-num">' + totalAnswered + '</div><div class="stat-label">总计</div></div>';
  } else if (mode === 'infinite') {
    const mastered = QUESTIONS.filter(q => infiniteMap[q.sequence].correctCount >= 3).length;
    const allDone = mastered === QUESTIONS.length;
    title.textContent = allDone ? '全部掌握！' : '已退出';
    stats.innerHTML =
      '<div class="stat"><div class="stat-num green">' + mastered + '</div><div class="stat-label">已掌握</div></div>' +
      '<div class="stat"><div class="stat-num red">' + (QUESTIONS.length - mastered) + '</div><div class="stat-label">未掌握</div></div>' +
      '<div class="stat"><div class="stat-num">' + totalAnswered + '</div><div class="stat-label">总答题</div></div>';
  } else if (mode === 'timed') {
    title.textContent = '限时结束';
    stats.innerHTML =
      '<div class="stat"><div class="stat-num green">' + correctCount + '</div><div class="stat-label">答对</div></div>' +
      '<div class="stat"><div class="stat-num red">' + wrongCount + '</div><div class="stat-label">答错</div></div>' +
      '<div class="stat"><div class="stat-num">' + totalAnswered + '</div><div class="stat-label">总计</div></div>';
  }

  document.getElementById('quiz-timer').classList.add('hidden');
}
</script>
</body>
</html>'''

with open(r"h:\tencent\download\24-25-1题库\index.html", "w", encoding="utf-8") as f:
    f.write(page)

print("Generated index.html (%d bytes)" % len(page))
