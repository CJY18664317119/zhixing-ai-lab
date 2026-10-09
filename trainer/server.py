"""Local-only real YOLO training engine. No simulated metrics or predictions."""
import base64, io, json, os, threading, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from PIL import Image

ROOT = Path(os.getenv('ZHIXING_DATA', str(Path.home() / 'ZhixingAILab')))
ROOT.mkdir(parents=True, exist_ok=True)
WEIGHTS = Path(__file__).parent / 'weights'
if getattr(__import__('sys'), 'frozen', False):
    WEIGHTS = Path(__import__('sys')._MEIPASS) / 'trainer' / 'weights'
app = FastAPI()
# Explicit localhost origins only. Cloud preview is not allowed to operate user's engine.
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:3000','http://127.0.0.1:3000'], allow_methods=['GET','POST'], allow_headers=['Content-Type'])
@app.middleware('http')
async def desktop_auth(request, call_next):
    token=os.getenv('ZHIXING_TOKEN')
    if token and request.headers.get('X-Zhixing-Token') != token:
        return JSONResponse({'detail':'本地引擎访问未授权'},status_code=401)
    return await call_next(request)

jobs = {}
lock = threading.Lock()
active = None
class TrainRequest(BaseModel):
    project: dict
    epochs: int = 10
class PredictRequest(BaseModel):
    model: str
    image: str

def decode_image(src):
    try:
        data = base64.b64decode(src.split(',',1)[1], validate=True)
        if len(data)>20*1024*1024: raise ValueError('图片超过 20MB')
        im=Image.open(io.BytesIO(data)).convert('RGB')
        if im.width*im.height>40000000: raise ValueError('图片尺寸过大')
        return im
    except Exception as e: raise ValueError('无效图片: '+str(e))

def save_job(job):
    (ROOT / job['id'] / 'job.json').write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')

def worker(req, job):
    global active
    try:
        from ultralytics import YOLO
        p=req.project; names=p['labels']; task=p['type']; folder=ROOT/job['id']; dataset=folder/'dataset'
        assets=[a for a in p['assets'] if a.get('label') or a.get('boxes')]
        if not all(a.get('split') for a in assets): raise ValueError('请先划分数据集')
        partitions={'训练集':'train','验证集':'val','测试集':'test'}
        for i,a in enumerate(assets):
            split=partitions[a['split']]
            im=decode_image(a['src'])
            if task=='classify':
                idx=names.index(a['label']); dest=dataset/split/str(idx);dest.mkdir(parents=True,exist_ok=True);im.save(dest/f'{i}.jpg')
            else:
                dest=dataset/'images'/split;dest.mkdir(parents=True,exist_ok=True);im.save(dest/f'{i}.jpg')
                ann=dataset/'labels'/split;ann.mkdir(parents=True,exist_ok=True)
                lines=[]
                for b in a['boxes']:
                    if not (0<=b['x']<=1 and 0<=b['y']<=1 and 0<b['w']<=1 and 0<b['h']<=1):raise ValueError('无效目标框坐标')
                    lines.append(f"{names.index(b['label'])} {b['x']+b['w']/2} {b['y']+b['h']/2} {b['w']} {b['h']}")
                (ann/f'{i}.txt').write_text('\n'.join(lines),encoding='utf-8')
        base=WEIGHTS/('yolo11n-cls.pt' if task=='classify' else 'yolo11n.pt')
        if not base.exists(): raise ValueError('离线权重未安装，请运行首次安装脚本')
        if task=='detect':
            import yaml
            config={'path':str(dataset.resolve()),'train':'images/train','val':'images/val','names':dict(enumerate(names))}
            (dataset/'data.yaml').write_text(yaml.safe_dump(config,allow_unicode=True),encoding='utf-8')
        else:
            for split in ['train','val']:
                for idx in range(len(names)):(dataset/split/str(idx)).mkdir(parents=True,exist_ok=True)
        if not any(a['split']=='验证集' for a in assets):raise ValueError('验证集为空，请增加数据并重新划分')
        model=YOLO(str(base))
        def progress(trainer):
            job.update(epoch=trainer.epoch+1, metrics={str(k):float(v) for k,v in trainer.metrics.items()},status='running');save_job(job)
            if job.get('cancel'):trainer.stop=True
        model.add_callback('on_fit_epoch_end', progress)
        import torch
        device=0 if torch.cuda.is_available() else 'cpu'
        model.train(data=str(dataset if task=='classify' else dataset/'data.yaml'),epochs=req.epochs,imgsz=224 if task=='classify' else 320,batch=4,workers=0,device=device,project=str(folder),name='train',exist_ok=True,plots=False,seed=42)
        best=folder/'train'/'weights'/'best.pt'
        if not best.exists():raise ValueError('训练没有生成有效模型')
        job.update(status='cancelled' if job.get('cancel') else 'completed',model=str(best),labels=names,type=task)
        save_job(job)
    except Exception as e:
        job.update(status='failed',error=str(e));save_job(job)
    finally:
        with lock:active=None

@app.get('/health')
def health():return {'status':'ready','offline_weights':{p.name:p.exists() for p in [WEIGHTS/'yolo11n.pt',WEIGHTS/'yolo11n-cls.pt']},'data_dir':str(ROOT)}

@app.post('/train')
def train(req:TrainRequest):
    global active
    if req.epochs<1 or req.epochs>200:raise HTTPException(400,'训练轮数应在 1–200 之间')
    if req.project.get('type') not in ['classify','detect']:raise HTTPException(400,'无效任务类型')
    with lock:
        if active:raise HTTPException(409,'已有训练任务，请先等待或取消')
        id=str(uuid.uuid4());(ROOT/id).mkdir();job={'id':id,'status':'queued','epoch':0,'metrics':{}};jobs[id]=job;active=id;save_job(job)
    threading.Thread(target=worker,args=(req,job),daemon=True).start()
    return job

@app.get('/jobs/{id}')
def get_job(id:str):
    if id not in jobs:
        try:jobs[id]=json.loads((ROOT/str(uuid.UUID(id))/'job.json').read_text(encoding='utf-8'))
        except:raise HTTPException(404,'训练记录不存在')
    return jobs[id]
@app.post('/jobs/{id}/cancel')
def cancel(id:str):
    job=get_job(id);job['cancel']=True;return {'status':'cancellation_requested'}

def safe_model(path):
    p=Path(path).resolve()
    if not p.is_relative_to(ROOT.resolve()) or p.suffix!='.pt' or not p.exists():raise HTTPException(400,'模型路径无效')
    return p
@app.post('/predict')
def predict(req:PredictRequest):
    from ultralytics import YOLO
    path=safe_model(req.model);meta=json.loads((path.parents[2]/'job.json').read_text(encoding='utf-8'))
    try:im=decode_image(req.image)
    except ValueError as e:raise HTTPException(400,str(e))
    result=YOLO(str(path)).predict(im,verbose=False)[0]
    if result.probs is not None:
        idx=result.probs.top1;return {'label':meta['labels'][int(result.names[idx])],'confidence':float(result.probs.top1conf),'boxes':[]}
    boxes=[{'label':meta['labels'][int(b.cls[0])],'confidence':float(b.conf[0]),'xyxy':b.xyxy[0].tolist()} for b in result.boxes]
    best=max(boxes,key=lambda b:b['confidence']) if boxes else {'label':'未检测到目标','confidence':0}
    return {**best,'boxes':boxes}
@app.get('/export/{id}')
def export(id:str):
    from ultralytics import YOLO
    job=get_job(id)
    if job.get('status')!='completed':raise HTTPException(400,'训练尚未完成')
    path=safe_model(job['model']);out=YOLO(str(path)).export(format='onnx',opset=17,device='cpu')
    return FileResponse(out,filename=f'zhixing-{id}.onnx')
