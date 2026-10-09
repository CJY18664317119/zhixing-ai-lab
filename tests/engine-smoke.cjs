// B. Engine smoke test — run on the Windows desktop after the installer is built.
// Verifies the packaged engine actually serves /health with weights present and
// rejects malformed requests. Does NOT fabricate training results.
// Usage: node tests/engine-smoke.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

// Packaged location (electron-builder extraResources -> resources/engine).
const candidates = [
  path.join(ROOT, 'desktop-runtime', 'zhixing-engine', 'zhixing-engine.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', '智行 AI Lab', 'resources', 'engine', 'zhixing-engine.exe'),
];
const exe = candidates.find(c => fs.existsSync(c));
if (!exe) {
  console.log('未执行：未找到打包引擎 ' + candidates.join(' 或 '));
  console.log('请先运行 scripts/build-windows.ps1 安装后重试。');
  process.exit(2); // 2 == "未执行"（区别于失败 1）
}

const token = require('crypto').randomBytes(16).toString('hex');
const proc = spawn(exe, [], { cwd: path.dirname(exe), env: { ...process.env, YOLO_OFFLINE: 'true', ZHIXING_TOKEN: token } });
let url = null;
proc.stdout.on('data', d => { for (const l of d.toString().split('\n')) if (l.startsWith('ZHIXING_READY ')) url = l.trim().slice(14); });
proc.stderr.on('data', d => process.stderr.write('[engine] ' + d));

function get(path_) {
  return fetch(url + path_, { headers: { 'X-Zhixing-Token': token } }).then(r => r.json().then(j => ({ status: r.status, body: j })));
}
(async () => {
  let ok = true;
  for (let i = 0; i < 60 && !url; i++) await new Promise(r => setTimeout(r, 1000));
  if (!url) { console.log('❌ 引擎未在 60s 内就绪'); proc.kill(); process.exit(1); }
  const h = await get('/health');
  ok = (h.status === 200 && h.body.status === 'ready' && h.body.offline_weights['yolo11n.pt'] && h.body.offline_weights['yolo11n-cls.pt']) && ok;
  console.log(`${ok ? '✅' : '❌'} /health 返回 ready 且两个基础权重均存在：${JSON.stringify(h.body.offline_weights)}`);
  const bad = await fetch(url + '/train', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zhixing-Token': token }, body: JSON.stringify({ project: { type: 'bogus' }, epochs: 1 }) });
  console.log(`${bad.status === 400 ? '✅' : '❌'} 非法 /train 被正确拒绝 (status=${bad.status})`);
  ok = (bad.status === 400) && ok;
  proc.kill();
  console.log(ok ? '\nB 引擎冒烟测试：通过' : '\nB 引擎冒烟测试：失败');
  process.exit(ok ? 0 : 1);
})();
