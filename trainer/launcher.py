"""Packaged desktop launcher: reserve an OS-assigned port, then start uvicorn."""
import os, socket, sys
from pathlib import Path
import uvicorn
from trainer.server import app
if __name__ == '__main__':
    sock=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    sock.bind(('127.0.0.1',0))
    sock.listen(128)
    print(f'ZHIXING_READY http://127.0.0.1:{sock.getsockname()[1]}',flush=True)
    uvicorn.Server(uvicorn.Config(app,log_level='warning')).run(sockets=[sock])
