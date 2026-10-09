// Verification harness for 智行 AI Lab Windows desktop delivery.
// Run: node tests/verify.cjs
//   - A (build/source checks): executed locally where possible.
//   - B (engine smoke), C (real model smoke), D (installer check):
//     printed as "未执行" here because this sandbox has no bundled engine,
//     no training deps/weights, and no Windows installer. Each has a real,
//     runnable script that the Windows runner / desktop can execute.
const {execFileSync, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const ROOT = require('path').resolve(__dirname, '..');
function pickPython() {
  if (process.env.PYTHON) return process.env.PYTHON.split(/\s+/).filter(Boolean);
  if (process.platform === 'win32') {
    try { execFileSync('py', ['-3.11', '--version'], { stdio: 'pipe' }); return ['py', '-3.11']; } catch {}
    try { execFileSync('python', ['--version'], { stdio: 'pipe' }); return ['python']; } catch {}
  }
  for (const c of ['python3', 'python']) {
    try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return [c]; } catch {}
  }
  return ['python3'];
}
const py = pickPython();

function run(cmd, args, opts = {}) {
  try {
    const o = execFileSync(cmd, args, { stdio: 'pipe', ...opts });
    return { ok: true, out: o.toString() };
  } catch (e) {
    return { ok: false, out: (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '') };
  }
}
function line(label, ok, detail) {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
  return ok;
}

console.log('=== A. 构建与源码检查（本地可运行部分）===');
let aPass = true;

// A1: Python engine syntax
const a1 = run(py[0], [...py.slice(1), '-m', 'py_compile', 'trainer/launcher.py', 'trainer/server.py', 'trainer/download_weights.py'], { cwd: ROOT });
aPass = line('Python 引擎语法编译 (py_compile)', a1.ok, a1.ok ? 'launcher/server/download_weights 均通过' : a1.out.trim().split('\n').slice(-3).join(' ')) && aPass;

// A2: desktop bridge unit tests (source-level; artifact checks skipped if UI not built)
const a2 = spawnSync(process.execPath, ['--test', 'tests/desktop.test.cjs'], { cwd: ROOT, encoding: 'utf8' });
const a2pass = a2.status === 0;
aPass = line('桌面桥接单元测试 (node --test)', a2pass, a2pass ? '7/7 通过' : '见下方输出') && aPass;
if (!a2pass) console.log(a2.stdout + a2.stderr);

// A3: offline UI build artifact present?
const uiBuilt = fs.existsSync(ROOT + '/desktop-ui/_next/static') || fs.existsSync(ROOT + '/desktop-ui/index.html');
line('离线界面产物 (desktop-ui)', uiBuilt, uiBuilt ? '已生成' : '未生成：需在 Windows 运行 node scripts/build-desktop.cjs');

// A4: pyinstaller spec references lap collect_all (bundle completeness)
const spec = fs.readFileSync(ROOT + '/zhixing-engine.spec', 'utf-8');
line('PyInstaller spec 包含 lap/torchvision/onnxruntime 收集', spec.includes("collect_all('lap')") && spec.includes("collect_all('torchvision')") && spec.includes("collect_all('onnxruntime')"));

console.log('\n=== B. 引擎冒烟测试（未执行）===');
console.log('   需要打包后的引擎可执行文件与基础权重。在 Windows 桌面运行：');
console.log('   node tests/engine-smoke.cjs');
console.log('   预期：启动 zhixing-engine.exe → /health 返回 ready 且 offline_weights 全 true → 非法 /train 返回 400。');

console.log('\n=== C. 真实模型冒烟测试（未执行）===');
console.log('   需要 venv 内 ultralytics/torch 依赖与两个基础权重。在 Windows 构建机运行：');
console.log('   py -3.11 tests/model-smoke.py');
console.log('   预期：合成极小 分类+检测 数据，CPU 训练 1 轮，推理，ONNX 导出并独立加载。');

console.log('\n=== D. 安装器 / 桌面检查（未执行）===');
console.log('   需要 CI 产出的 release/*.exe。在 Windows 运行：');
console.log('   pwsh tests/installer-check.ps1');
console.log('   预期：安装器存在、体积合理、SHA256 与 release/SHA256.txt 一致。');

console.log('\n=== 小结 ===');
console.log(`A 本地可执行部分：${aPass ? '通过' : '存在失败'}（含未生成离线界面产物时为部分）`);
console.log('B/C/D：未执行 —— 本环境无打包引擎、训练依赖/权重与 Windows 安装器，需实机或 Windows runner。');
process.exit(aPass ? 0 : 1);
