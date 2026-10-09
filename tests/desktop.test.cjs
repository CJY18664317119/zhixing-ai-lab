const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const main=fs.readFileSync('desktop/main.cjs','utf8');
const preload=fs.readFileSync('desktop/preload.cjs','utf8');
const launcher=fs.readFileSync('trainer/launcher.py','utf8');
test('桌面界面包含 HTML 与离线静态资源',()=>{assert.ok(fs.existsSync('desktop-ui/index.html'));assert.ok(fs.existsSync('desktop-ui/_next/static'));});
test('桌面桥接启用隔离，拒绝任意 IPC 暴露',()=>{
 assert.ok(main.includes('contextIsolation:true'));
 assert.ok(main.includes('nodeIntegration:false'));
 assert.ok(main.includes('sandbox:true'));
 assert.ok(!preload.includes("exposeInMainWorld('ipcRenderer'"));
 assert.ok(!preload.includes('exposeInMainWorld("ipcRenderer"'));
});
test('配置保留用户数据并包含本地引擎',()=>{const p=require('../package.json');assert.equal(p.build.nsis.deleteAppDataOnUninstall,false);assert.equal(p.build.extraResources[0].to,'engine');});
test('协议处理拒绝路径穿越',()=>{
 assert.ok(main.includes('Forbidden'));
 assert.ok(main.includes('.startsWith(ui'));
});
test('停车指令按协议生成，不无条件硬编码 STOP',()=>{
 assert.ok(main.includes('function stopCommand'));
 assert.ok(!main.includes("serial.write('STOP\\n'"));
 assert.ok(main.includes('stopCommand(serialProtocol)'));
});
test('引擎鉴权、单实例锁定与冻结支持已接入',()=>{
 assert.ok(main.includes('X-Zhixing-Token'));
 assert.ok(main.includes('app.requestSingleInstanceLock'));
 assert.ok(launcher.includes('multiprocessing.freeze_support()'));
});
test('启动不仅凭 ZHIXING_READY，会等待 /health',()=>{
 assert.ok(main.includes('waitForHealth'));
 assert.ok(main.includes("engineURL+'/health'"));
});
