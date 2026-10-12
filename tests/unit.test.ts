// 纯函数单测: 训练/推理引擎 + 竞赛阶段与配额判定。用 `pnpm test` 运行。
import assert from 'node:assert/strict';
import { classify, detect, extractFeatures, nonMaxSuppress, train, type Sample } from '../lib/ml/engine';

const GRID = 64;
function synthetic(color: [number, number, number], noise = 6): number[] {
  const data = new Uint8ClampedArray(GRID * GRID * 4);
  for (let i = 0; i < GRID * GRID; i++) {
    const jitter = ((i * 37) % noise) - noise / 2;
    data[i * 4] = Math.min(255, Math.max(0, color[0] + jitter));
    data[i * 4 + 1] = Math.min(255, Math.max(0, color[1] + jitter));
    data[i * 4 + 2] = Math.min(255, Math.max(0, color[2] + jitter));
    data[i * 4 + 3] = 255;
  }
  return extractFeatures(data, GRID, GRID);
}

// 1) 特征维度稳定
const vector = synthetic([200, 40, 40]);
assert.equal(vector.length, 20 * 20 + 3, '特征维度应为 20x20 灰度 + 3 个颜色均值');
assert.ok(vector.every((v) => v >= 0 && v <= 1), '特征应归一化到 0–1');

// 2) 真实训练 + 留出集评估
const samples: Sample[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, label: '红', vector: synthetic([220, 30, 30], 4 + i) })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, label: '蓝', vector: synthetic([30, 30, 220], 4 + i) })),
];
const model = train(samples, 'classification');
assert.equal(model.classes.length, 2);
assert.ok(model.metrics.valCount > 0, '样本足够时应留出验证集');
assert.ok(model.metrics.accuracy >= 0.9, `可分的合成数据准确率应很高, 实际 ${model.metrics.accuracy}`);
assert.ok(JSON.stringify(model).length < 200_000, '质心模型应足够小, 能存进项目状态');

// 3) 推理真的区分开两类
const red = classify(model.centroids, synthetic([215, 35, 35]));
const blue = classify(model.centroids, synthetic([35, 35, 215]));
assert.equal(red.label, '红');
assert.equal(blue.label, '蓝');
assert.ok(red.confidence > 0 && red.confidence <= 1);

// 4) 滑窗检测 + NMS 去重
const canvas = (() => {
  const data = new Uint8ClampedArray(GRID * GRID * 4);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = (y * GRID + x) * 4;
      const inBlob = x > 20 && x < 44 && y > 20 && y < 44;
      data[i] = inBlob ? 220 : 20;
      data[i + 1] = 30;
      data[i + 2] = inBlob ? 30 : 220;
      data[i + 3] = 255;
    }
  }
  return data;
})();
const boxes = detect(model, canvas, GRID, GRID, { windowRatio: 0.5, strideRatio: 0.5, threshold: 0.2 });
assert.ok(boxes.length >= 1, '应至少检出一个候选框');
assert.ok(boxes.length <= 20, 'NMS 后数量应受限');
const merged = nonMaxSuppress(boxes, 0.3);
assert.ok(merged.length <= boxes.length, 'NMS 不应增加框数');

console.log('单元测试通过: 特征提取 / 训练 / 留出评估 / 推理 / 滑窗检测');
