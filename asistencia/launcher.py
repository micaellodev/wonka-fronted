import os
import sys
import threading
import webbrowser

if getattr(sys, "frozen", False):
    os.chdir(sys._MEIPASS)

import main
import uvicorn


def open_browser():
    webbrowser.open("http://localhost:8000")


if __name__ == "__main__":
    threading.Timer(1.0, open_browser).start()
    uvicorn.run(main.app, host="127.0.0.1", port=8000, log_config=None)
