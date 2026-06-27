# start.ps1 — 一键启动开发服务器（双端口）
param(
  [int]$Port1 = 8080,
  [int]$Port2 = 9000
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== 配置防火墙规则 ===" -ForegroundColor Cyan
$rules = @(
  @{Name="SuperQuestioner-HTTPS-$Port1"; Port=$Port1; Proto='TCP'},
  @{Name="SuperQuestioner-HTTP-$Port2"; Port=$Port2; Proto='TCP'}
)
foreach ($r in $rules) {
  $existing = netsh advfirewall firewall show rule name="$($r.Name)" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  规则已存在: $($r.Name)" -ForegroundColor Yellow
  } else {
    New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Protocol $r.Proto -LocalPort $r.Port -Action Allow
    Write-Host "  已添加: $($r.Name) :$($r.Port)" -ForegroundColor Green
  }
}

Write-Host "=== 启动服务器 ===" -ForegroundColor Cyan

# 服务器 1: HTTPS (server.js)
Write-Host "  启动 服务器 1 (HTTPS) :$Port1 ..." -ForegroundColor Gray
$p1 = Start-Process -FilePath "node" -ArgumentList "scripts/server.js" -WorkingDirectory $Root -NoNewWindow -PassThru

# 服务器 2: HTTP (简易)
Write-Host "  启动 服务器 2 (HTTP)  :$Port2 ..." -ForegroundColor Gray
$code = @"
const h=require('http'),f=require('fs'),p=require('path');
const M={
  '.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8',
  '.css':'text/css;charset=utf-8','.json':'application/json','.svg':'image/svg+xml',
  '.ogg':'audio/ogg','.wasm':'application/wasm','.png':'image/png'
};
h.createServer((q,r)=>{
  let u=q.url.split('?')[0];if(u=='/')u='/index.html';
  let fp=p.join('$($Root.Replace('\','\\'))',u);
  f.readFile(fp,(e,d)=>{
    if(e){r.writeHead(404);r.end('Not Found')}
    else{r.writeHead(200,{'Content-Type':M[p.extname(fp).toLowerCase()]||'application/octet-stream','Access-Control-Allow-Origin':'*'});r.end(d)}
  });
}).listen($Port2,()=>console.log('Server 2: http://localhost:'+$Port2));
"@
$p2 = Start-Process -FilePath "node" -ArgumentList "-e", $code -NoNewWindow -PassThru

Write-Host ""
Write-Host "=== 就绪 ===" -ForegroundColor Cyan
Write-Host "  服务器 1: https://localhost:$Port1"
Write-Host "  服务器 2: http://localhost:$Port2"
Write-Host ""
Write-Host "  手机访问（同一局域网）:"
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -ne 'Loopback' -and $_.PrefixOrigin -eq 'Dhcp'}).IPAddress | Select-Object -First 1
if ($ip) {
  Write-Host "    https://$ip`:$Port1"
  Write-Host "    http://$ip`:$Port2"
}
Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Yellow

# 等待进程结束
$p1.WaitForExit()
$p2.WaitForExit()
