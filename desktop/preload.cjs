const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('zhixingDesktop',{
 readProjects:()=>ipcRenderer.invoke('projects:read'),
 saveProjects:data=>ipcRenderer.invoke('projects:save',data),
 request:(endpoint,body)=>ipcRenderer.invoke('engine:request',endpoint,body),
 exportModel:id=>ipcRenderer.invoke('engine:export',id),
 serialList:()=>ipcRenderer.invoke('serial:list'),
 serialOpen:(path,baud,protocol)=>ipcRenderer.invoke('serial:open',path,baud,protocol),
 serialWrite:(text,emergency)=>ipcRenderer.invoke('serial:write',text,emergency),
 serialClose:()=>ipcRenderer.invoke('serial:close'),
 onDisconnect:callback=>{const listener=()=>callback();ipcRenderer.on('serial:disconnected',listener);return()=>ipcRenderer.removeListener('serial:disconnected',listener);}
});
