// 轻量图像分类/检测引擎 (纯前端, 浏览器可运行, 可在 Node 中单测)。
// 说明: 这是真实可用的"可解释特征 + 最近质心"分类器, 不是深度学习。
// 指标全部来自真实留出集, 不做任何伪造; 深度学习预训练/微调尚未接入。

export type Sample = { id: string; label: string; vector: number[] };
export type Centroid = { label: string; vector: number[]; count: number };
export type Model = {
  kind: 'centroid-v1';
  task: 'classification' | 'detection';
  classes: string[];
  dims: number;
  centroids: Centroid[];
  trainedAt: string;
  metrics: Metrics;
};
export type Metrics = {
  accuracy: number;
  trainCount: number;
  valCount: number;
  confusion: Record<string, Record<string, number>>;
  perClass: Record<string, { precision: number; recall: number; support: number }>;
  note: string;
};

export const GRID = 20; // 20x20 灰度网格
export const FEATURE_DIMS = GRID * GRID + 3;

/** 把一张图片像素转成特征: 归一化灰度网格 + RGB 全局均值。 */
export function extractFeatures(data: Uint8ClampedArray, width: number, height: number): number[] {
  const grid = new Float64Array(GRID * GRID);
  const counts = new Float64Array(GRID * GRID);
  let r = 0;
  let g = 0;
  let b = 0;
  let pixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
      const gx = Math.min(GRID - 1, Math.floor((x / width) * GRID));
      const gy = Math.min(GRID - 1, Math.floor((y / height) * GRID));
      grid[gy * GRID + gx] += gray;
      counts[gy * GRID + gx] += 1;
      r += red;
      g += green;
      b += blue;
      pixels += 1;
    }
  }
  const out = new Array<number>(FEATURE_DIMS).fill(0);
  for (let i = 0; i < GRID * GRID; i++) out[i] = counts[i] ? grid[i] / counts[i] / 255 : 0;
  const n = Math.max(1, pixels);
  out[GRID * GRID] = r / n / 255;
  out[GRID * GRID + 1] = g / n / 255;
  out[GRID * GRID + 2] = b / n / 255;
  return out;
}

export function squaredDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/** 真实训练: 按类别求质心; 留出集评估准确率与混淆矩阵。 */
export function train(samples: Sample[], task: Model['task'], valRatio = 0.25): Model {
  const classes = [...new Set(samples.map((s) => s.label))].sort();
  const byClass = new Map<string, Sample[]>();
  for (const c of classes) byClass.set(c, []);
  for (const s of samples) byClass.get(s.label)!.push(s);

  const trainSet: Sample[] = [];
  const valSet: Sample[] = [];
  for (const c of classes) {
    const list = byClass.get(c)!;
    const valCount = list.length >= 4 ? Math.max(1, Math.round(list.length * valRatio)) : 0;
    // 确定性的"隔张抽取", 避免每次训练结果漂移
    list.forEach((s, i) => (list.length >= 4 && i % Math.max(2, Math.round(list.length / valCount)) === 0 ? valSet : trainSet).push(s));
  }

  const centroids: Centroid[] = classes.map((label) => {
    const list = trainSet.filter((s) => s.label === label);
    const pool = list.length ? list : byClass.get(label)!;
    const vector = new Array<number>(FEATURE_DIMS).fill(0);
    for (const s of pool) for (let i = 0; i < FEATURE_DIMS; i++) vector[i] += s.vector[i] / pool.length;
    return { label, vector, count: pool.length };
  });

  const confusion: Record<string, Record<string, number>> = {};
  for (const c of classes) confusion[c] = Object.fromEntries(classes.map((k) => [k, 0]));
  let correct = 0;
  for (const s of valSet) {
    const hit = classify(centroids, s.vector).label;
    confusion[s.label][hit] += 1;
    if (hit === s.label) correct += 1;
  }
  const perClass: Metrics['perClass'] = {};
  for (const c of classes) {
    const tp = confusion[c][c];
    const predicted = classes.reduce((sum, k) => sum + confusion[k][c], 0);
    const support = classes.reduce((sum, k) => sum + confusion[c][k], 0);
    perClass[c] = {
      precision: predicted ? tp / predicted : 0,
      recall: support ? tp / support : 0,
      support,
    };
  }
  return {
    kind: 'centroid-v1',
    task,
    classes,
    dims: FEATURE_DIMS,
    centroids,
    trainedAt: new Date().toISOString(),
    metrics: {
      accuracy: valSet.length ? correct / valSet.length : 0,
      trainCount: trainSet.length,
      valCount: valSet.length,
      confusion,
      perClass,
      note: valSet.length
        ? '准确率来自未参与训练的留出样本, 样本较少时波动较大。'
        : '每个类别样本不足 4 张, 本次没有留出验证集, 准确率未评估。',
    },
  };
}

/** 距离最小者胜出; 置信度由类别间距离比软化为 0–1。 */
export function classify(centroids: Centroid[], vector: number[]): { label: string; confidence: number; distances: { label: string; distance: number }[] } {
  const distances = centroids
    .map((c) => ({ label: c.label, distance: squaredDistance(c.vector, vector) }))
    .sort((a, b) => a.distance - b.distance);
  if (!distances.length) return { label: '未知', confidence: 0, distances };
  const best = distances[0];
  const second = distances[1]?.distance ?? best.distance + 1e-6;
  const spread = Math.max(1e-9, second - best.distance);
  const confidence = Math.max(0, Math.min(1, spread / (spread + best.distance + 1e-9)));
  return { label: best.label, confidence, distances };
}

export function predict(model: Model, data: Uint8ClampedArray, width: number, height: number) {
  return classify(model.centroids, extractFeatures(data, width, height));
}

export type Box = { label: string; confidence: number; x: number; y: number; w: number; h: number };

/**
 * 轻量检测: 在缩放后的整图上滑窗分类, 再用非极大值抑制合并。
 * 这是真实运行的算法 (不是模型推理), 适合课堂演示"检测是怎么来的"。
 */
export function detect(
  model: Model,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { windowRatio?: number; strideRatio?: number; threshold?: number } = {},
): Box[] {
  const win = Math.max(12, Math.round(Math.min(width, height) * (opts.windowRatio ?? 0.45)));
  const stride = Math.max(6, Math.round(win * (opts.strideRatio ?? 0.5)));
  const threshold = opts.threshold ?? 0.35;
  const raw: Box[] = [];
  for (let y = 0; y + win <= height; y += stride) {
    for (let x = 0; x + win <= width; x += stride) {
      const patch = new Uint8ClampedArray(win * win * 4);
      for (let py = 0; py < win; py++) {
        const from = ((y + py) * width + x) * 4;
        patch.set(data.subarray(from, from + win * 4), py * win * 4);
      }
      const r = classify(model.centroids, extractFeatures(patch, win, win));
      if (r.confidence >= threshold) raw.push({ label: r.label, confidence: r.confidence, x, y, w: win, h: win });
    }
  }
  return nonMaxSuppress(raw, 0.3);
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!inter) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

export function nonMaxSuppress(boxes: Box[], threshold: number): Box[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: Box[] = [];
  for (const box of sorted) {
    if (kept.every((k) => k.label !== box.label || iou(k, box) < threshold)) kept.push(box);
  }
  return kept.slice(0, 20);
}

/** 模型体积守卫: 质心模型必须足够小才能存进项目状态。 */
export function modelSize(model: Model): number {
  return JSON.stringify(model).length;
}
