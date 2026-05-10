"""
bots/wrappers/run_all.py — run owner_bot.py + kitchen_automator.py in one process.

Used by `make dev`. Each is its own thread; if one dies, the other is killed and
the supervisor exits non-zero so a process supervisor (or operator eyes) restarts.
"""
from __future__ import annotations

import logging
import signal
import sys
import threading
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("run_all")

_alive = threading.Event()
_alive.set()


def _wrap(target_module: str, target_main: str = "main") -> threading.Thread:
    def runner() -> None:
        try:
            mod = __import__(target_module, fromlist=[target_main])
            getattr(mod, target_main)()
        except SystemExit as e:
            logger.error("%s exited: %s", target_module, e)
        except Exception:
            logger.exception("%s crashed", target_module)
        finally:
            logger.warning("%s thread finished — signalling shutdown", target_module)
            _alive.clear()

    th = threading.Thread(target=runner, name=target_module, daemon=True)
    th.start()
    return th


def main() -> int:
    threads = [
        _wrap("bots.owner_bot"),
        _wrap("bots.kitchen_automator"),
    ]

    def _on_signal(signum, _frame):
        logger.info("received signal %d — exiting", signum)
        _alive.clear()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _on_signal)
        except (ValueError, OSError):
            pass

    while _alive.is_set():
        time.sleep(1)
    logger.info("shutdown")
    return 1 if any(not t.is_alive() for t in threads) else 0


if __name__ == "__main__":
    sys.exit(main())
