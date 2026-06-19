var https = require('https');
var fs = require('fs');

var files = [
  // 1. WASM (non-SIMD) - 8.94MB
  { name: 'assets/wasm/vision_wasm_nosimd_internal.wasm', url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm/vision_wasm_nosimd_internal.wasm' },
  // 2. JS glue code - 199KB
  { name: 'assets/wasm/vision_wasm_nosimd_internal.js', url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm/vision_wasm_nosimd_internal.js' },
  // 3. main bundle - 140KB (re-download to fresh location)
  { name: 'assets/lib/vision_bundle.js', url: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.cjs' },
  // 4. hand landmarker model (task file) - from Google Storage
  { name: 'assets/wasm/hand_landmarker_lite.task', url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker_lite/float16/latest/hand_landmarker.task' }
];

function download(i) {
  if (i >= files.length) { console.log('ALL DOWNLOADS COMPLETE'); process.exit(0); return; }
  var f = files[i];
  console.log('[' + (i+1) + '/' + files.length + '] Downloading: ' + f.name);
  var file = fs.createWriteStream(f.name);
  var req = https.get(f.url, function(res) {
    if (res.statusCode !== 200 && res.statusCode !== 302) {
      console.log('  HTTP ' + res.statusCode + ' - FAILED');
      res.resume();
      fs.unlink(f.name, function(){});
      download(i+1);
      return;
    }
    var len = 0;
    res.on('data', function(c) { len += c.length; });
    res.pipe(file);
    file.on('finish', function() {
      file.close();
      console.log('  OK: ' + len + ' bytes');
      download(i+1);
    });
  });
  req.setTimeout(60000, function() {
    console.log('  TIMEOUT - failed');
    req.destroy();
    fs.unlink(f.name, function(){});
    download(i+1);
  });
  req.on('error', function(e) {
    console.log('  ERROR: ' + e.message);
    fs.unlink(f.name, function(){});
    download(i+1);
  });
}

download(0);
