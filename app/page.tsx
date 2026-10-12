'use client';
// 智竞 AI Arena · 精简版: 数据标注 → 模型训练 → 模型运行 → 结果输出。
// 训练与推理都在浏览器里真实执行 (lib/ml/engine.ts), 结果落库并可导出;
// 输出可经 Web Serial 发送给 ESP32 小车。没有账号、赛事、评分等模块。
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Check, Cpu, Database, Download,
  Link2, Play, Plus, Radio, RefreshCw, Save, Square, Tag, Terminal, Trash2, Upload, X,
} from 'lucide-react';
import { detect, extractFeatures, predict, train, type Model, type Sample } from '@/lib/ml/engine';

type SampleRow = { id: number; name: string; label: string; task: string; dataUrl: string; boxes: string; createdAt: string };
type ModelRow = { id: number; task: string; classes: string[]; payload: string; accuracy: string; trainCount: number; valCount: number; metrics: Model['metrics']; createdAt: string };
type RunRow = { id: number; modelId: number | null; source: string; label: string; confidence: string; command: string; detail: string; createdAt: string };

const STEPS = ['数据标注', '模型训练', '模型运行', '结果输出'] as const;
type Step = (typeof STEPS)[number];
const COMMANDS = ['FORWARD', 'BACKWARD', 'LEFT', 'RIGHT', 'STOP'];

function canvased(src: HTMLImageElement | HTMLVideoElement, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(src, 0, 0, size, size);
  return canvas.getContext('2d')!.getImageData(0, 0, size, size);
}
function captureName() {
  return `采集-${Date.now()}.jpg`;
}
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

export default function Page() {
  const [step, setStep] = useState<Step>('数据标注');
  const [labels, setLabels] = useState<string[]>(['直行', '左转', '右转', '停止', '障碍物']);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeModel, setActiveModel] = useState<Model | null>(null);
  const [task, setTask] = useState<'classification' | 'detection'>('classification');
  const [label, setLabel] = useState('直行');
  const [selected, setSelected] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<{ label: string; x: number; y: number; w: number; h: number }[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [log, setLog] = useState<string[]>(['[就绪] 上传图片 → 标注类别 → 开始训练 → 运行模型']);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [prediction, setPrediction] = useState<{ label: string; confidence: number; boxes: { label: string; x: number; y: number; w: number; h: number }[] } | null>(null);
  const [preview, setPreview] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({ 直行: 'FORWARD', 左转: 'LEFT', 右转: 'RIGHT', 停止: 'STOP', 障碍物: 'STOP' });
  const [autoSend, setAutoSend] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [connected, setConnected] = useState(false);
  const [speed, setSpeed] = useState(35);
  const [serialLog, setSerialLog] = useState<string[]>([]);

  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const writer = useRef<{ write: (b: Uint8Array) => Promise<void> } | null>(null);
  const portRef = useRef<{ writable: { getWriter: () => { write: (b: Uint8Array) => Promise<void> } }; readable: { getReader: () => { read: () => Promise<{ value?: Uint8Array; done: boolean }>; releaseLock: () => void } }; close: () => Promise<void> } | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);

  const tell = useCallback((text: string) => { setToast(text); setTimeout(() => setToast(''), 4000); }, []);
  const push = useCallback((line: string) => setLog((l) => [...l.slice(-200), line]), []);

  /** 重新拉取全部数据; 所有 setState 都发生在异步回调里。 */
  async function loadAll() {
    const [s, m, r, l] = await Promise.all([
      fetch('/api/samples').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/models').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/runs').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/labels').then((x) => (x.ok ? x.json() : { labels: [] })),
    ]);
    setSamples(s);
    setModels(m);
    setRuns(r);
    if (l.labels?.length) setLabels(l.labels);
    if (m.length) {
      const p = JSON.parse(m[0].payload) as { kind: Model['kind']; classes: string[]; dims: number; centroids: Model['centroids'] };
      setActiveModel({ ...p, task: m[0].task === 'detection' ? 'detection' : 'classification', trainedAt: m[0].createdAt, metrics: m[0].metrics });
    }
    return s as SampleRow[];
  }

  useEffect(() => {
    void Promise.all([
      fetch('/api/samples').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/models').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/runs').then((x) => (x.ok ? x.json() : [])),
      fetch('/api/labels').then((x) => (x.ok ? x.json() : { labels: [] })),
    ]).then(([s, m, r, l]) => {
      setSamples(s);
      setModels(m);
      setRuns(r);
      if (l.labels?.length) setLabels(l.labels);
      if (m.length) {
        const payload = JSON.parse(m[0].payload) as { kind: Model['kind']; classes: string[]; dims: number; centroids: Model['centroids'] };
        setActiveModel({ ...payload, task: m[0].task === 'detection' ? 'detection' : 'classification', trainedAt: m[0].createdAt, metrics: m[0].metrics });
      }
      if (s.length) {
        setSelected(s[0].id);
        setBoxes(JSON.parse(s[0].boxes || '[]'));
      }
    });
  }, []);

  /** 选中样本时同步它自己的检测框。 */
  function selectSample(row: SampleRow) {
    setSelected(row.id);
    setBoxes(JSON.parse(row.boxes || '[]'));
  }

  const labeled = samples.filter((s) => s.label);
  const classCount = new Set(labeled.map((s) => s.label)).size;

  async function upload(files: FileList | null) {
    if (!files) return;
    const items: { name: string; dataUrl: string; task: string }[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/') || f.size > 2_000_000) { tell('请上传 2 MB 以内的 JPG / PNG'); continue; }
      const dataUrl = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(f); });
      items.push({ name: f.name, dataUrl, task });
    }
    if (!items.length) return;
    const r = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const body = await r.json();
    if (!r.ok) return tell(body.error || '上传失败');
    push(`[数据] 新增 ${body.length} 张图片, 请逐张选择类别`);
    await loadAll();
    setStep('数据标注');
  }

  async function captureFrame() {
    if (!video.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext('2d')!.drawImage(video.current, 0, 0, 320, 240);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    const r = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ name: captureName(), dataUrl, label, task }] }) });
    if (r.ok) { push(`[数据] 摄像头采集一张, 已标注「${label}」`); await loadAll(); }
    else tell((await r.json()).error || '采集失败');
  }

  async function labelSample(id: number, value: string) {
    setSamples((rows) => rows.map((r) => (r.id === id ? { ...r, label: value } : r)));
    await fetch('/api/samples', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, label: value }) });
  }

  async function saveBoxes(next: { label: string; x: number; y: number; w: number; h: number }[]) {
    setBoxes(next);
    if (selected === null) return;
    await fetch('/api/samples', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected, boxes: next }) });
  }

  async function removeSample(id: number) {
    await fetch(`/api/samples/${id}`, { method: 'DELETE' });
    setSelected(null);
    await loadAll();
  }

  async function addLabel() {
    const value = newLabel.trim();
    if (!value || labels.includes(value)) return;
    const next = [...labels, value];
    const r = await fetch('/api/labels', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: next }) });
    const body = await r.json();
    if (!r.ok) return tell(body.error || '保存类别失败');
    setLabels(body.labels);
    setNewLabel('');
  }

  async function removeLabel(value: string) {
    const next = labels.filter((l) => l !== value);
    const r = await fetch('/api/labels', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: next }) });
    const body = await r.json();
    if (!r.ok) return tell(body.error || '保存类别失败');
    setLabels(body.labels);
  }

  /** 真实训练: 提取特征 → 求类别质心 → 留出集评估 → 落库。 */
  async function runTraining() {
    if (labeled.length < 4) return tell('至少需要 4 张已标注图片');
    if (classCount < 2) return tell('至少需要 2 个不同类别');
    setBusy(true);
    setLog([]);
    push('[训练] 开始提取图像特征 (20×20 灰度网格 + RGB 均值)...');
    try {
      const rows: Sample[] = [];
      for (const s of labeled) {
        const img = await loadImage(s.dataUrl);
        const data = canvased(img);
        rows.push({ id: String(s.id), label: s.label, vector: extractFeatures(data.data, data.width, data.height) });
      }
      push(`[训练] ${rows.length} 张样本, 特征维度 ${rows[0].vector.length}`);
      const model = train(rows, task === 'detection' ? 'detection' : 'classification');
      push(`[训练] 质心模型完成: 训练 ${model.metrics.trainCount} 张 / 留出 ${model.metrics.valCount} 张`);
      push(model.metrics.valCount ? `[评估] 留出集准确率 ${(model.metrics.accuracy * 100).toFixed(1)}%` : '[评估] 每类样本不足 4 张, 本次不做留出评估');
      const r = await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
      const body = await r.json();
      if (!r.ok) { push(`[错误] ${body.error}`); return; }
      push(`[保存] 模型版本 #${body.id} 已入库`);
      setActiveModel(model);
      await loadAll();
      setStep('模型运行');
    } finally {
      setBusy(false);
    }
  }

  async function recordRun(entry: { source: string; label: string; confidence: string; command: string; boxes?: unknown[]; detail?: string }) {
    const r = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: models[0]?.id ?? null, ...entry }) });
    if (!r.ok) return;
    const row = (await r.json()) as RunRow;
    setRuns((rows) => [row, ...rows].slice(0, 100));
  }

  async function send(cmd: string, quiet = false) {
    if (!writer.current) {
      if (!quiet) await recordRun({ source: 'image', label: '(手动)', confidence: '0', command: cmd, detail: '未连接串口, 仅记录' });
      return;
    }
    const line = JSON.stringify({ v: 1, cmd, speed: Math.min(speed, 60) }) + '\n';
    try {
      await writer.current.write(new TextEncoder().encode(line));
      if (!quiet) setSerialLog((l) => [...l.slice(-200), '[TX] ' + line.trim()]);
    } catch {
      if (heartbeat.current) clearInterval(heartbeat.current);
      setConnected(false);
      tell('串口中断。请确认固件已实现心跳超时停车。');
    }
  }


  /** 对一张图片推理, 并把结果输出到面板。 */
  async function predictImage(src: string, source: 'image' | 'camera' = 'image') {
    if (!activeModel) return tell('请先训练模型');
    const img = await loadImage(src);
    const data = canvased(img, 64);
    const result = predict(activeModel, data.data, data.width, data.height);
    const found = activeModel.task === 'detection' ? detect(activeModel, data.data, data.width, data.height, { threshold: 0.3 }) : [];
    setPreview(src);
    setPrediction({ label: result.label, confidence: result.confidence, boxes: found });
    const command = mapping[result.label] ?? 'STOP';
    push(`[识别] ${source === 'camera' ? '摄像头帧' : '图片'} → ${result.label} (置信度 ${(result.confidence * 100).toFixed(1)}%)${found.length ? ` · 检测框 ${found.length} 个` : ''}`);
    push(`[输出] 指令 ${command} · 速度 ${Math.min(speed, 60)}%${connected ? '' : ' (未连接串口, 仅记录)'}`);
    if (connected && autoSend && command) await send(command);
    await recordRun({ source, label: result.label, confidence: result.confidence.toFixed(3), command, boxes: found, detail: source === 'camera' ? '摄像头实时识别' : '图片识别' });
  }

  useEffect(() => {
    if (!cameraOn || !activeModel || step !== '模型运行') return;
    let stop = false;
    let frames = 0;
    const timer = setInterval(() => {
      if (stop || !video.current) return;
      const data = canvased(video.current, 64);
      const result = predict(activeModel, data.data, data.width, data.height);
      const found = activeModel.task === 'detection' ? detect(activeModel, data.data, data.width, data.height, { threshold: 0.3 }) : [];
      setPrediction({ label: result.label, confidence: result.confidence, boxes: found });
      frames += 1;
      const command = mapping[result.label] ?? 'STOP';
      if (connected && autoSend && command) void send(command);
      if (frames % 10 === 0) {
        push(`[识别] 摄像头帧 → ${result.label} (${(result.confidence * 100).toFixed(1)}%)`);
        void recordRun({ source: 'camera', label: result.label, confidence: result.confidence.toFixed(3), command, boxes: found, detail: `摄像头第 ${frames} 帧` });
      }
    }, 450);
    return () => { stop = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, activeModel, autoSend, mapping, connected, speed, step]);

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      stream.current = s;
      setCameraOn(true);
      if (video.current) { video.current.srcObject = s; await video.current.play(); }
      push('[摄像头] 已开启');
    } catch (e) {
      tell('无法打开摄像头: ' + (e instanceof Error ? e.message : '权限被拒绝') + '（嵌入预览可能未授权, 可在独立窗口打开）');
    }
  }
  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
    push('[摄像头] 已关闭');
  }

  async function connectSerial() {
    try {
      const serial = (navigator as unknown as { serial?: { requestPort: () => Promise<typeof portRef.current> } }).serial;
      if (!serial) return tell('当前浏览器不支持 Web Serial, 请用桌面版 Chrome / Edge');
      portRef.current = await serial.requestPort();
      await (portRef.current as unknown as { open: (o: { baudRate: number }) => Promise<void> }).open({ baudRate: 115200 });
      writer.current = portRef.current!.writable.getWriter();
      setConnected(true);
      setSerialLog((l) => [...l, '[连接] ESP32 · 115200 baud']);
      heartbeat.current = setInterval(() => void send('HEARTBEAT', true), 500);
      const reader = portRef.current!.readable.getReader();
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) setSerialLog((l) => [...l.slice(-200), '[RX] ' + new TextDecoder().decode(value)]);
          }
        } finally {
          reader.releaseLock();
          setConnected(false);
          if (heartbeat.current) clearInterval(heartbeat.current);
        }
      })();
    } catch (e) {
      tell('串口连接未完成: ' + (e instanceof Error ? e.message : '未知错误'));
    }
  }

  async function flushRuns() {
    if (!runs.length) return tell('还没有运行记录');
    const r = await fetch('/api/runs?format=csv');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `运行结果-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    a.click();
    tell('已导出运行结果 CSV');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo"><Cpu size={20} /><b>智竞 AI Arena</b><small>数据标注 · 模型训练 · 模型运行 · 结果输出</small></div>
        <div className="topbar-right">
          <span className={connected ? 'dot on' : 'dot'} />{connected ? 'ESP32 已连接' : '串口未连接'}
          <button className="ghost" onClick={() => void loadAll().then(() => tell('已刷新'))}><RefreshCw size={14} />刷新</button>
        </div>
      </header>

      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={step === s ? 'step active' : 'step'} onClick={() => setStep(s)}>
            <span>{`0${i + 1}`}</span>{s}
            {s === '数据标注' && <em>{samples.length} 张</em>}
            {s === '模型训练' && <em>{models.length} 个模型</em>}
            {s === '结果输出' && <em>{runs.length} 条</em>}
          </button>
        ))}
        <div className="task-switch">
          <label>任务类型</label>
          <select value={task} onChange={(e) => setTask(e.target.value as 'classification' | 'detection')}>
            <option value="classification">图片分类</option>
            <option value="detection">目标检测</option>
          </select>
        </div>
      </nav>

      <main className="content">
        {step === '数据标注' && (
          <div className="grid-2">
            <section className="panel">
              <div className="panel-head">
                <h2><Database size={17} />样本 ({samples.length})</h2>
                <div className="row">
                  <button className="ghost" onClick={cameraOn ? stopCamera : startCamera}><Camera size={15} />{cameraOn ? '关闭摄像头' : '摄像头采集'}</button>
                  <button className="primary" onClick={() => fileInput.current?.click()}><Upload size={15} />上传图片</button>
                  <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
                </div>
              </div>
              {cameraOn && <div className="camera-box"><video ref={video} autoPlay muted playsInline /><button className="primary" onClick={captureFrame}><Camera size={15} />拍下这一帧 (标注「{label}」)</button></div>}
              <div className="tiles">
                {samples.map((s) => (
                  <button key={s.id} className={selected === s.id ? 'tile chosen' : 'tile'} onClick={() => selectSample(s)}>
                    <img src={s.dataUrl} alt={s.name} />
                    <span>{s.name}</span>
                    <em className={s.label ? 'badge ok' : 'badge'}>{s.label || '未标注'}</em>
                  </button>
                ))}
              </div>
              {!samples.length && (
                <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}>
                  <Upload size={30} />
                  <h3>把第一张图片放到这里</h3>
                  <p>拖拽或上传 JPG / PNG, 单张不超过 2 MB; 也可以用摄像头采集</p>
                  <button className="primary" onClick={() => fileInput.current?.click()}>选择图片</button>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2><Tag size={17} />标注</h2>{selected !== null && <button className="ghost" onClick={() => removeSample(selected)}><Trash2 size={14} />删除这张</button>}</div>
              <p className="hint">{task === 'detection' ? '先选类别, 然后在图片上拖拽画框' : '选一张图片, 再点类别完成标注'}</p>
              <div className="canvas-box"
                onPointerDown={(e) => {
                  if (task !== 'detection' || selected === null) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  dragStart.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
                }}
                onPointerUp={(e) => {
                  if (!dragStart.current) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const a = dragStart.current;
                  const b = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
                  dragStart.current = null;
                  if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) void saveBoxes([...boxes, { label, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }]);
                }}>
                {selected !== null ? <img src={samples.find((s) => s.id === selected)?.dataUrl} alt="待标注" draggable={false} /> : <div className="placeholder"><Database size={26} />在左侧选一张图片开始标注</div>}
                {boxes.map((b, i) => (
                  <div className="bbox" key={i} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>{b.label}</div>
                ))}
              </div>
              <div className="labels">
                {labels.map((l) => (
                  <span key={l} className={label === l ? 'label-chip active' : 'label-chip'}>
                    <button onClick={() => { setLabel(l); if (selected !== null) void labelSample(selected, l); }}>{l}</button>
                    {labels.length > 2 && <button aria-label={`删除类别 ${l}`} className="x" onClick={() => removeLabel(l)}><X size={11} /></button>}
                  </span>
                ))}
              </div>
              <div className="row add-label">
                <input placeholder="新增类别, 例如 人行道" value={newLabel} maxLength={20} onChange={(e) => setNewLabel(e.target.value)} />
                <button className="ghost" onClick={addLabel}><Plus size={14} />添加</button>
                {boxes.length > 0 && <button className="ghost" onClick={() => void saveBoxes([])}>清空当前框 ({boxes.length})</button>}
              </div>
            </section>
          </div>
        )}

        {step === '模型训练' && (
          <section className="panel">
            <div className="panel-head"><h2><Cpu size={17} />训练真实模型</h2><span className="badge">{activeModel ? `当前模型 #${models[0]?.id ?? '-'}` : '尚未训练'}</span></div>
            <p className="hint">
              训练在你自己的浏览器里完成: 每张图片被压成 20×20 灰度网格 + RGB 均值 (403 维特征), 按类别求均值得到质心,
              再用留出的验证图片算准确率与混淆矩阵。指标全部来自真实计算, 没有任何预置数值。
            </p>
            <div className="train-grid">
              <div className="card">
                <div className="stat-row"><span>已标注样本</span><b>{labeled.length} 张</b></div>
                <div className="stat-row"><span>类别数</span><b>{classCount} 个</b></div>
                <div className="stat-row"><span>留出验证</span><b>25% (每类 ≥4 张时留出)</b></div>
                <button className="primary wide" disabled={busy || labeled.length < 4 || classCount < 2} onClick={runTraining}>
                  <Play size={15} />{busy ? '训练中...' : '开始训练'}
                </button>
                {labeled.length < 4 && <p className="warn">还要再标注 {4 - labeled.length} 张图片才能训练。</p>}
              </div>
              <div className="card">
                {!activeModel && <div className="placeholder"><Cpu size={26} />训练完成后这里会显示真实指标</div>}
                {activeModel && (
                  <>
                    <div className="metrics">
                      <div><span>留出集准确率</span><b>{activeModel.metrics.valCount ? `${(activeModel.metrics.accuracy * 100).toFixed(1)}%` : '未评估'}</b><small>{activeModel.metrics.valCount ? `${activeModel.metrics.valCount} 张验证图片` : '每类不足 4 张'}</small></div>
                      <div><span>训练图片</span><b>{activeModel.metrics.trainCount}</b><small>{activeModel.classes.length} 个类别</small></div>
                    </div>
                    <table className="matrix">
                      <thead><tr><th>真实 \ 预测</th>{activeModel.classes.map((c) => <th key={c}>{c}</th>)}<th>召回</th></tr></thead>
                      <tbody>
                        {activeModel.classes.map((r) => (
                          <tr key={r}><th>{r}</th>
                            {activeModel.classes.map((c) => <td key={c} className={r === c && activeModel.metrics.confusion[r]?.[c] ? 'hit' : ''}>{activeModel.metrics.confusion[r]?.[c] ?? 0}</td>)}
                            <td>{((activeModel.metrics.perClass[r]?.recall ?? 0) * 100).toFixed(0)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hint">{activeModel.metrics.note}</p>
                  </>
                )}
              </div>
            </div>
            <h3 className="sub">历史模型</h3>
            {models.map((m) => (
              <div className="model-row" key={m.id}>
                <b>#{m.id}</b>
                <span>{m.task === 'detection' ? '目标检测' : '图片分类'} · {m.classes.length} 类</span>
                <span>{m.valCount ? `准确率 ${(Number(m.accuracy) * 100).toFixed(1)}%` : '未评估'}</span>
                <span>{m.trainCount} 张训练 / {m.valCount} 张验证</span>
                <small>{new Date(m.createdAt).toLocaleString('zh-CN')}</small>
                <button className="ghost" onClick={() => { const p = JSON.parse(m.payload); setActiveModel({ ...p, task: m.task === 'detection' ? 'detection' : 'classification', trainedAt: m.createdAt, metrics: m.metrics }); tell(`已切换到模型 #${m.id}`); }}>使用</button>
                <button className="ghost" onClick={async () => { await fetch(`/api/models?id=${m.id}`, { method: 'DELETE' }); await loadAll(); }}>删除</button>
              </div>
            ))}
            {!models.length && <p className="hint">还没有保存过模型。</p>}
            <div className="console"><div><Terminal size={14} />训练日志</div>{log.map((l, i) => <p key={i} className="line">{l}</p>)}</div>
          </section>
        )}

        {step === '模型运行' && (
          <div className="grid-2">
            <section className="panel">
              <div className="panel-head"><h2><Play size={17} />运行模型</h2>
                {activeModel ? <span className="badge ok">{activeModel.classes.length} 类 · {activeModel.metrics.valCount ? `准确率 ${(activeModel.metrics.accuracy * 100).toFixed(1)}%` : '未评估'}</span> : <span className="badge">未加载模型</span>}
              </div>
              {!activeModel && <p className="warn">还没有模型, 请先到「模型训练」训练一个。</p>}
              <div className="run-media">
                {preview ? <img src={preview} alt="运行图片" /> : <div className="placeholder"><Play size={26} />选一张图片或用摄像头开始识别</div>}
                {cameraOn && <video ref={video} autoPlay muted playsInline className="overlay-video" />}
                {prediction?.boxes.map((b, i) => (
                  <div className="bbox run" key={i} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>{b.label}</div>
                ))}
              </div>
              <div className="row">
                <button className="ghost" onClick={cameraOn ? stopCamera : startCamera} disabled={!activeModel}><Camera size={15} />{cameraOn ? '停止摄像头' : '开启摄像头识别'}</button>
                <label className="check"><input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />识别后自动输出指令</label>
              </div>
              <h3 className="sub">用已有样本测试</h3>
              <div className="tiles small">
                {samples.slice(0, 12).map((s) => (
                  <button key={s.id} className="tile" onClick={() => predictImage(s.dataUrl)} disabled={!activeModel}>
                    <img src={s.dataUrl} alt={s.name} />
                    <em className="badge">{s.label || '未标注'}</em>
                  </button>
                ))}
              </div>
              <div className="row"><button className="primary" onClick={() => fileInput.current?.click()} disabled={!activeModel}><Upload size={15} />用新图片识别</button>
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const url = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(f); }); await predictImage(url); }} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2><Activity size={17} />本次识别结果</h2></div>
              {prediction ? (
                <>
                  <b className="big">{prediction.label}</b>
                  <p className="hint">置信度 {(prediction.confidence * 100).toFixed(1)}%{prediction.boxes.length ? ` · 检测框 ${prediction.boxes.length} 个` : ''}</p>
                  <div className="stat-row"><span>将输出指令</span><b>{mapping[prediction.label] ?? 'STOP'}</b></div>
                  <div className="stat-row"><span>速度上限</span><b>{Math.min(speed, 60)}%</b></div>
                  <button className="primary wide" onClick={() => void send(mapping[prediction.label] ?? 'STOP')}>立即发送一次<Radio size={14} /></button>
                </>
              ) : <div className="placeholder"><Activity size={26} />识别后这里显示类别、置信度与将输出的指令</div>}
              <h3 className="sub">类别 → 指令映射</h3>
              {labels.map((l) => (
                <div className="map-row" key={l}>
                  <span>{l}</span>
                  <select value={mapping[l] ?? 'STOP'} onChange={(e) => setMapping({ ...mapping, [l]: e.target.value })}>
                    {COMMANDS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </section>
          </div>
        )}

        {step === '结果输出' && (
          <div className="grid-2">
            <section className="panel">
              <div className="panel-head"><h2><Radio size={17} />输出到 ESP32 小车</h2>{<span className={connected ? 'badge ok' : 'badge'}>{connected ? '已连接' : '未连接'}</span>}</div>
              <p className="hint">桌面版 Chrome / Edge · USB 串口 · 115200 baud · JSON 行协议 v1。识别结果按上一步的映射表转成指令实时下发。</p>
              <div className="row">
                <button className="primary" onClick={connectSerial} disabled={connected}><Link2 size={15} />连接开发板</button>
                <button className="ghost" onClick={() => { void send('STOP'); if (heartbeat.current) clearInterval(heartbeat.current); void portRef.current?.close(); writer.current = null; setConnected(false); }} disabled={!connected}>断开并停车</button>
              </div>
              <div className="pad">
                <button onClick={() => void send('FORWARD')} aria-label="前进"><ArrowUp /></button>
                <div>
                  <button onClick={() => void send('LEFT')} aria-label="左转"><ArrowLeft /></button>
                  <button className="stop" onClick={() => void send('STOP')} aria-label="停止"><Square /></button>
                  <button onClick={() => void send('RIGHT')} aria-label="右转"><ArrowRight /></button>
                </div>
                <button onClick={() => void send('BACKWARD')} aria-label="后退"><ArrowDown /></button>
              </div>
              <label className="speed">速度 {speed}% (硬上限 60%)</label>
              <input type="range" min={0} max={60} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
              <button className="danger" onClick={() => void send('STOP')}>■ 紧急停止</button>
              <p className="warn">示例固件默认禁用移动动作, 需按你的电机驱动补齐; 固件必须实现 1.5 秒心跳超时停车。第一次联调请架空车轮。</p>
              <div className="serial">{serialLog.length ? serialLog.map((l, i) => <div key={i}>{l}</div>) : '等待连接设备...'}</div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2><Download size={17} />运行结果输出 ({runs.length})</h2>
                <div className="row">
                  <button className="ghost" onClick={flushRuns}><Download size={14} />导出 CSV</button>
                  <button className="ghost" onClick={async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(runs, null, 2)], { type: 'application/json' })); a.download = 'run-results.json'; a.click(); }}>导出 JSON</button>
                </div>
              </div>
              <p className="hint">每次识别 (图片或摄像头) 都会记录: 时间、来源、类别、置信度、输出的指令。</p>
              <div className="results">
                {runs.map((r) => (
                  <div className="result-row" key={r.id}>
                    <em>{r.label}</em>
                    <span>{r.command || '—'}</span>
                    <b>{(Number(r.confidence) * 100).toFixed(1)}%</b>
                    <small>{r.source === 'camera' ? '摄像头' : '图片'} · {new Date(r.createdAt).toLocaleTimeString('zh-CN')}</small>
                  </div>
                ))}
                {!runs.length && <div className="placeholder"><Activity size={26} />还没有运行记录</div>}
              </div>
              <div className="console"><div><Terminal size={14} />实时输出</div>{log.slice(-40).map((l, i) => <p key={i} className="line">{l}</p>)}</div>
              <div className="row"><button className="ghost" onClick={() => { setLog([]); tell('已清空屏幕输出 (记录仍在数据库)'); }}><Trash2 size={14} />清屏</button></div>
            </section>
          </div>
        )}
      </main>

      <footer className="foot"><Save size={13} />数据、模型与运行记录都保存在平台数据库里, 刷新或换设备都能继续</footer>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}
