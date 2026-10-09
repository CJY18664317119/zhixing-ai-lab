"""C. Real model smoke test — run inside the build venv (py -3.11) on Windows.

Trains BOTH task types on a tiny synthetic dataset for 1 epoch on CPU, runs
inference, and exports + reloads ONNX. Uses the bundled base weights. No mock
metrics. Requires: pip install -r trainer/requirements.txt and the weights in
trainer/weights (downloaded by scripts/build-windows.ps1).

Usage: py -3.11 tests/model-smoke.py
"""
import os, sys, io, random
from pathlib import Path

ROOT = Path(__file__).parent.parent
WEIGHTS = ROOT / 'trainer' / 'weights'
sys.path.insert(0, str(ROOT))

import torch
from PIL import Image, ImageDraw
from ultralytics import YOLO


def make_classify(tmp: Path, n=6):
    (tmp / 'train' / '0').mkdir(parents=True, exist_ok=True)
    (tmp / 'train' / '1').mkdir(parents=True, exist_ok=True)
    (tmp / 'val' / '0').mkdir(parents=True, exist_ok=True)
    (tmp / 'val' / '1').mkdir(parents=True, exist_ok=True)
    for split, count in (('train', n), ('val', 2)):
        for cls in ('0', '1'):
            for i in range(count):
                img = Image.new('RGB', (64, 64), (255 if cls == '0' else 0, 0, 0))
                img.save(tmp / split / cls / f'{i}.jpg')


def make_detect(tmp: Path, n=6):
    (tmp / 'images' / 'train').mkdir(parents=True, exist_ok=True)
    (tmp / 'images' / 'val').mkdir(parents=True, exist_ok=True)
    (tmp / 'labels' / 'train').mkdir(parents=True, exist_ok=True)
    (tmp / 'labels' / 'val').mkdir(parents=True, exist_ok=True)
    for split, count in (('train', n), ('val', 2)):
        for i in range(count):
            img = Image.new('RGB', (64, 64), (120, 120, 120))
            d = ImageDraw.Draw(img)
            d.rectangle([10, 10, 40, 40], fill=(200, 0, 0))
            img.save(tmp / 'images' / split / f'{i}.jpg')
            (tmp / 'labels' / split / f'{i}.txt').write_text('0 0.39 0.39 0.47 0.47\n', encoding='utf-8')
    (tmp / 'data.yaml').write_text(
        'path: %s\ntrain: images/train\nval: images/val\nnames:\n  0: box\n' % str(tmp.resolve()),
        encoding='utf-8')


def main():
    if not (WEIGHTS / 'yolo11n.pt').exists() or not (WEIGHTS / 'yolo11n-cls.pt').exists():
        print('未执行：基础权重缺失，请先在训练环境下载 yolo11n.pt / yolo11n-cls.pt')
        sys.exit(2)
    device = 'cpu'
    # --- classify ---
    cls_dir = ROOT / 'tests' / '.smoke-cls'
    make_classify(cls_dir)
    m = YOLO(str(WEIGHTS / 'yolo11n-cls.pt'))
    m.train(data=str(cls_dir), epochs=1, imgsz=64, batch=4, workers=0, device=device, project=str(cls_dir / 'run'), name='c', exist_ok=True, plots=False, seed=42)
    cls_best = cls_dir / 'run' / 'c' / 'weights' / 'best.pt'
    assert cls_best.exists(), '分类训练未产出 best.pt'
    r = m.predict(str(cls_dir / 'val' / '0' / os.listdir(cls_dir / 'val' / '0')[0]), verbose=False)[0]
    assert r.probs is not None, '分类推理失败'
    onnx = YOLO(str(cls_best)).export(format='onnx', opset=17, device=device)
    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx))
    assert sess.get_inputs()[0].shape is not None, 'ONNX 无法加载'
    print('✅ 分类：训练1轮 / 推理 / ONNX导出并加载 通过')

    # --- detect ---
    det_dir = ROOT / 'tests' / '.smoke-det'
    make_detect(det_dir)
    m2 = YOLO(str(WEIGHTS / 'yolo11n.pt'))
    m2.train(data=str(det_dir / 'data.yaml'), epochs=1, imgsz=64, batch=4, workers=0, device=device, project=str(det_dir / 'run'), name='d', exist_ok=True, plots=False, seed=42)
    det_best = det_dir / 'run' / 'd' / 'weights' / 'best.pt'
    assert det_best.exists(), '检测训练未产出 best.pt'
    r2 = m2.predict(str(det_dir / 'images' / 'val' / os.listdir(det_dir / 'images' / 'val')[0]), verbose=False)[0]
    assert r2.boxes is not None, '检测推理失败'
    onnx2 = YOLO(str(det_best)).export(format='onnx', opset=17, device=device)
    ort.InferenceSession(str(onnx2))
    print('✅ 检测：训练1轮 / 推理 / ONNX导出并加载 通过')
    print('\nC 真实模型冒烟测试：通过')


if __name__ == '__main__':
    main()
