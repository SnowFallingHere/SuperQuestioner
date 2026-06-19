// 综合 HTTPS 服务器：静态文件 + 日志中继（零依赖、Windows 一键）
// 用法: node server.js
// 手机访问 https://<电脑IP>:8080

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const crypto = require('crypto');

const PORT = 8080;
const DIR = path.join(__dirname, '..');
const PFX_PATH = path.join(os.tmpdir(), 'quiz-server.pfx');
const PFX_PASS = 'quiz123';

// ========== 用 PowerShell 生成证书（PFX 格式） ==========
function ensureCertificate() {
  if (fs.existsSync(PFX_PATH)) return true;
  console.log('  正在生成自签名证书...');

  // 把 PowerShell 脚本写到临时文件，避免转义问题
  const psScript = path.join(os.tmpdir(), 'gen-cert.ps1');
  const psContent = `
$cert = New-SelfSignedCertificate -Subject "CN=10.230.157.187" -CertStoreLocation Cert:\\CurrentUser\\My -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(10) 2>null
$bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, "${PFX_PASS}")
[System.IO.File]::WriteAllBytes("${PFX_PATH}", $bytes)
`;
  try {
    fs.writeFileSync(psScript, psContent, 'utf8');
    cp.execSync('powershell -ExecutionPolicy Bypass -File "' + psScript + '"', { timeout: 15000 });
    if (!fs.existsSync(PFX_PATH)) throw new Error('PFX 未生成');
    console.log('  证书已生成');
  } catch(e) {
    console.error('  证书生成失败:', e.message.substring(0, 80));
    return false;
  } finally {
    try { fs.unlinkSync(psScript); } catch(e) {}
  }
  return true;
}

// ========== MIME ==========
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8', '.mjs': 'application/javascript',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico':  'image/x-icon', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.tflite': 'application/octet-stream',
};

// ========== 状态行 + 日志缓存 + 摄像头代理 ==========
var panelState = { type: '-', cursor: '-', confirmed: '-', beta: 0 };
var logBuffer = [];
var camFrameBuffer = null; // 最新摄像头帧 (Buffer)
var gestureBuffer = null;  // 最新手势指令
var camFrameCount = 0;

function renderPanel() {
  var s = panelState;
  var line = 'motion β: ' + s.beta.toFixed(1) + '°  type: ' + s.type + '  cursor: ' + s.cursor + '  confirmed: ' + s.confirmed;
  process.stdout.write('\r\x1b[K' + line);
}
function pad(v, n) { v = String(v); while (v.length < n) v += ' '; return v; }

// ========== 请求处理 ==========
function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 状态面板 (POST: 手机上报 | GET: 面板拉取)
  if (req.url === '/state' || req.url === '/state/') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.type) panelState.type = data.type;
          if (data.cursor) panelState.cursor = data.cursor;
          if (data.confirmed) panelState.confirmed = data.confirmed;
          if (data.beta) panelState.beta = data.beta;
          renderPanel();
        } catch(e) {}
        res.writeHead(200);
        res.end('ok');
      });
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(panelState));
      return;
    }
  }

  // 日志中继
  if (req.method === 'POST' && (req.url === '/log' || req.url === '/log/')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('[%s] %s', new Date().toLocaleTimeString(), data.msg || body);
        logBuffer.push({t:Date.now(),m:data.msg||body});
        if(logBuffer.length>50)logBuffer=logBuffer.slice(-50);
      } catch(e) { console.log('[手机]', body); }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  // 日志拉取 (GET /logs)
  if (req.method === 'GET' && (req.url === '/logs' || req.url === '/logs/')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(logBuffer));
    return;
  }

  // 摄像头帧: POST from phone, GET for panel
  if (req.url === '/camframe' || req.url === '/camframe/') {
    if (req.method === 'POST') {
       let body = [];
       req.on('data', c => body.push(c));
       req.on('end', () => {
         camFrameBuffer = Buffer.concat(body);
         camFrameCount++;
         if (camFrameCount % 10 === 1) console.log('[camframe] 收到第 '+camFrameCount+' 帧, 大小='+camFrameBuffer.length);
         res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
        res.end('ok');
      });
      return;
    }
    if (req.method === 'GET') {
      if (camFrameBuffer) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
        res.end(camFrameBuffer);
      } else {
        res.writeHead(404);
        res.end('no frame');
      }
      return;
    }
  }

  // 手势指令: POST from panel (计算机), GET for phone
  if (req.url === '/gesture' || req.url === '/gesture/') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try { gestureBuffer = JSON.parse(body); } catch(e) { gestureBuffer = { gesture: body }; }
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
        res.end('ok');
      });
      return;
    }
    if (req.method === 'GET') {
      const g = gestureBuffer || { gesture: 'none' };
      gestureBuffer = null; // 一次性读取
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(g));
      return;
    }
  }

  // 静态文件
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(DIR, urlPath);
  if (!filePath.startsWith(DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

// ========== 启动 ==========
const ip = getLocalIP();
const hasCert = ensureCertificate();

if (hasCert) {
  // HTTPS 模式
  const opts = {
    pfx: fs.readFileSync(PFX_PATH),
    passphrase: PFX_PASS
  };
  https.createServer(opts, handleRequest).listen(PORT, () => {
    startLog(ip, true);
  });
  // HTTP 重定向到 HTTPS
  http.createServer((req, res) => {
    res.writeHead(301, { Location: 'https://' + (req.headers.host ? req.headers.host.split(':')[0] : 'localhost') + ':' + PORT + req.url });
    res.end();
  }).listen(PORT + 1);
  // HTTP 面板端口（纯本地，无证书限制）
  http.createServer(handleRequest).listen(PORT + 2, () => {
    console.log('  本机面板: http://127.0.0.1:' + (PORT + 2) + '/motion-panel.html');
  });
} else {
  // HTTP 降级
  http.createServer(handleRequest).listen(PORT, () => {
    startLog(ip, false);
  });
}

function startLog(ip, isHttps) {
  renderPanel();
  console.log('');
  console.log('='.repeat(55));
  console.log('  服务器已启动' + (isHttps ? ' (HTTPS)' : ' (HTTP，陀螺仪可能不可用)'));
  console.log('  端口: ' + PORT);
  console.log('  手机访问:');
  console.log('    ' + (isHttps ? 'https' : 'http') + '://' + ip + ':' + PORT);
  if (isHttps) {
    console.log('');
    console.log('  ⚠ 首次访问浏览器会提示"不安全"');
    console.log('     点"高级"→"继续前往"即可');
  }
  console.log('  ===============================');
  console.log('  日志中继已内置，motion.js 自动发送');
  console.log('='.repeat(55));
  console.log('');
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces))
    for (const iface of ifaces[name])
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
  return '127.0.0.1';
}
