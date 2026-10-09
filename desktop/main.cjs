const {app,BrowserWindow,ipcMain,protocol,net,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const crypto=require('node:crypto');
const {SerialPort}=require('serialport');
protocol.registerSchemesAsPrivileged([{scheme:'zhixing',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,engine,engineURL,engineToken=crypto.randomBytes(32).toString('hex'),serial,closing=false,lastWrite=0;
const dataDir=()=>path.join(app.getPath('userData'),'projects');
function trusted(event){if(!event.senderFrame?.url.startsWith('zhixing://app/'))throw Error('不可信页面');}
function handle(name,fn){ipcMain.handle(name,(event,...args)=>{trusted(event);return fn(...args);});}
async function stopCar(){if(serial?.isOpen){await new Promise(resolve=>serial.write('STOP\n',()=>serial.drain(resolve)));}}
async function disconnect(){await stopCar();if(serial?.isOpen)await new Promise(resolve=>serial.close(resolve));serial=null;}
async function startEngine(){
 const base=app.isPackaged?path.join(process.resourcesPath,'engine'):path.join(__dirname,'..','desktop-runtime');
 const exe=path.join(base,process.platform==='win32'?'zhixing-engine.exe':'zhixing-engine');
 try{await fs.access(exe);}catch{return;}
 engine=spawn(exe,[],{cwd:base,windowsHide:true,env:{...process.env,ZHIXING_DATA:path.join(app.getPath('userData'),'training'),ZHIXING_TOKEN:engineToken,YOLO_OFFLINE:'true'}});
 engine.stdout.on('data',data=>{for(const line of data.toString().split('\n')){if(line.startsWith('ZHIXING_READY '))engineURL=line.trim().slice(14);}});
 const log=path.join(app.getPath('userData'),'engine.log');
 engine.stderr.on('data',data=>fs.appendFile(log,data).catch(()=>{}));
 engine.on('error',err=>fs.appendFile(log,String(err)).catch(()=>{}));engine.on('exit',()=>{engineURL=null;});
}
handle('projects:read',async()=>{try{return JSON.parse(await fs.readFile(path.join(dataDir(),'projects.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}});
let saveQueue=Promise.resolve();
handle('projects:save',data=>{if(!Array.isArray(data))throw Error('项目数据无效');const payload=JSON.stringify(data);saveQueue=saveQueue.catch(()=>{}).then(async()=>{await fs.mkdir(dataDir(),{recursive:true});const file=path.join(dataDir(),'projects.json');await fs.writeFile(file+'.tmp',payload);await fs.rename(file+'.tmp',file);});return saveQueue;});
handle('engine:request',async(endpoint,body)=>{
 if(!engineURL)throw Error('本地训练引擎未就绪或未随安装包提供');
 if(!/^\/(health|train|predict|jobs\/[a-f0-9-]+(?:\/cancel)?)$/.test(endpoint))throw Error('不允许的引擎请求');
 const response=await fetch(engineURL+endpoint,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Zhixing-Token':engineToken},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw Error(result.detail||'引擎请求失败');return result;
});
handle('engine:export',async id=>{if(!engineURL||!/^[-a-f0-9]+$/.test(id))throw Error('模型无效');const result=await dialog.showSaveDialog(win,{defaultPath:`zhixing-${id}.onnx`,filters:[{name:'ONNX 模型',extensions:['onnx']}]});if(result.canceled)return;const r=await fetch(engineURL+'/export/'+id,{headers:{'X-Zhixing-Token':engineToken}});if(!r.ok)throw Error('导出失败');await fs.writeFile(result.filePath,Buffer.from(await r.arrayBuffer()));});
handle('serial:list',()=>SerialPort.list());
handle('serial:open',async(portPath,baud)=>{if(![9600,57600,115200].includes(baud))throw Error('波特率无效');const ports=await SerialPort.list();if(!ports.some(p=>p.path===portPath))throw Error('串口不存在');await disconnect();serial=new SerialPort({path:portPath,baudRate:baud,autoOpen:false});serial.on('error',()=>{win?.webContents.send('serial:disconnected');});serial.on('close',()=>win?.webContents.send('serial:disconnected'));await new Promise((resolve,reject)=>serial.open(e=>e?reject(e):resolve()));});
handle('serial:write',async(text,emergency)=>{if(typeof text!=='string'||text.length>256||!text.endsWith('\n')||text.slice(0,-1).includes('\n'))throw Error('串口指令无效');if(!serial?.isOpen)throw Error('串口未连接');if(!emergency&&Date.now()-lastWrite<100)return;lastWrite=Date.now();await new Promise((resolve,reject)=>serial.write(text,e=>e?reject(e):resolve()));});
handle('serial:close',disconnect);
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(async()=>{
 const ui=path.join(app.getAppPath(),'desktop-ui');
 protocol.handle('zhixing',request=>{const url=new URL(request.url);if(url.host!=='app')return new Response('Forbidden',{status:403});let file=path.resolve(ui,'.'+decodeURIComponent(url.pathname));if(file!==ui&&!file.startsWith(ui+path.sep))return new Response('Forbidden',{status:403});if(url.pathname.endsWith('/'))file=path.join(file,'index.html');return net.fetch(pathToFileURL(file).toString());});
 await startEngine();
 win=new BrowserWindow({width:1440,height:950,minWidth:960,minHeight:700,title:'智行 AI Lab',backgroundColor:'#f6f8fc',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('zhixing://app/'))e.preventDefault();});
 win.webContents.on('render-process-gone',()=>disconnect());
 win.on('close',e=>{if(closing)return;e.preventDefault();closing=true;Promise.race([disconnect(),new Promise(r=>setTimeout(r,1500))]).finally(()=>{engine?.kill();win.destroy();app.quit();});});
 await win.loadURL('zhixing://app/');
});
app.on('window-all-closed',()=>app.quit());
}
