"""Fetch the base YOLO11 weights used by the offline engine.

Run by scripts/build-windows.ps1 after the venv is created, so the PyInstaller
bundle always ships real weights. Idempotent: if a weight already exists and
looks like a valid PyTorch checkpoint (non-empty, ZIP magic 'PK'), it is kept.

This uses a direct HTTPS download and does NOT rely on ultralytics auto-download,
so it still works even when YOLO_OFFLINE / YOLO_AUTOINSTALL=false are set in the
build environment to keep the packaged engine offline.
"""
import sys, os, time, urllib.request, urllib.error
from pathlib import Path

WEIGHTS = {
    # Source: ultralytics official assets release (YOLO11, tag v8.3.0).
    "yolo11n.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt",
    "yolo11n-cls.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n-cls.pt",
}
# Optional mirror override, e.g. an internal proxy that mirrors the GitHub release.
MIRROR = os.environ.get("ZHIXING_WEIGHTS_MIRROR", "").rstrip("/")
MIN_BYTES = 1_000_000  # a real YOLO11n checkpoint is several MB; reject stubs
RETRIES = 3
TIMEOUT = 600

HERE = Path(__file__).parent
OUT = HERE / "weights"
OUT.mkdir(parents=True, exist_ok=True)


def is_valid(pt: Path) -> bool:
    if not pt.exists() or pt.stat().st_size < MIN_BYTES:
        return False
    with pt.open("rb") as f:
        return f.read(2) == b"PK"  # PyTorch checkpoints are ZIP archives


def fetch(name: str, url: str) -> None:
    dest = OUT / name
    if is_valid(dest):
        print(f"weight present & valid, skip: {name} ({dest.stat().st_size} bytes)", flush=True)
        return
    urls = ([f"{MIRROR}/{name}"] if MIRROR else []) + [url]
    last = None
    for attempt in range(1, RETRIES + 1):
        for u in urls:
            try:
                print(f"download ({attempt}/{RETRIES}) {name} <- {u}", flush=True)
                req = urllib.request.Request(u, headers={"User-Agent": "zhixing-build/1.0"})
                with urllib.request.urlopen(req, timeout=TIMEOUT) as r, dest.open("wb") as w:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        w.write(chunk)
                if is_valid(dest):
                    print(f"weight OK: {name} ({dest.stat().st_size} bytes)", flush=True)
                    return
                dest.unlink(missing_ok=True)
                raise IOError("downloaded file is not a valid PyTorch checkpoint")
            except (urllib.error.URLError, OSError) as e:
                last = e
                print(f"  failed: {e}", flush=True)
                time.sleep(2)
    raise SystemExit(f"could not download {name} after {RETRIES} attempts: {last}")


def main() -> None:
    if os.environ.get("YOLO_OFFLINE", "").lower() in ("true", "1"):
        print("YOLO_OFFLINE=true: this script downloads base weights once for packaging; "
              "if they already exist locally they will be reused.", flush=True)
    for name, url in WEIGHTS.items():
        fetch(name, url)
    print("all base weights ready in", OUT, flush=True)


if __name__ == "__main__":
    main()
