const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const result=spawnSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['build'],{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,ZHIXING_DESKTOP_BUILD:'1'}});
if(result.status!==0)process.exit(result.status||1);
fs.rmSync('desktop-ui',{recursive:true,force:true});fs.cpSync('out','desktop-ui',{recursive:true});
console.log('离线桌面界面已生成：desktop-ui');
