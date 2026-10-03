"""Run one workload with macOS footprint, available-memory, and swap guards."""
import argparse
import ctypes
import fcntl
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import time

import psutil


def footprint(pid):
    info = ctypes.create_string_buffer(1024)
    lib = ctypes.CDLL('/usr/lib/libproc.dylib')
    if lib.proc_pid_rusage(pid, 0, ctypes.byref(info)) == 0:
        return struct.unpack_from('Q', info.raw, 72)[0]
    return 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--name', required=True)
    p.add_argument('--max-gib', type=float, default=5)
    p.add_argument('--min-available-gib', type=float, default=2)
    p.add_argument('--max-swap-growth-mib', type=float, default=256)
    p.add_argument('command', nargs=argparse.REMAINDER)
    args = p.parse_args()
    command = args.command[1:] if args.command[0] == '--' else args.command
    Path('reports').mkdir(exist_ok=True)
    lock = open('reports/workload.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    gib = 1024 ** 3
    if psutil.virtual_memory().available < args.min_available_gib * gib:
        raise SystemExit('Insufficient available memory; workload not started')
    swap_start = psutil.swap_memory().used
    start = time.monotonic()
    peak = 0
    reason = None
    with open(f'reports/{args.name}.log', 'w') as log, open(f'reports/{args.name}-memory.jsonl', 'w') as metrics:
        child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        def stop(signum=None, frame=None):
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        try:
            while child.poll() is None:
                try:
                    processes = [psutil.Process(child.pid)] + psutil.Process(child.pid).children(recursive=True)
                except psutil.NoSuchProcess:
                    processes = []
                used = sum(footprint(proc.pid) for proc in processes)
                peak = max(peak, used)
                available = psutil.virtual_memory().available
                swap_growth = psutil.swap_memory().used - swap_start
                sample = dict(seconds=round(time.monotonic()-start, 2), footprint_gib=used/gib,
                              available_gib=available/gib, swap_growth_mib=swap_growth/1024**2)
                metrics.write(json.dumps(sample)+'\n')
                metrics.flush()
                if used > args.max_gib * gib:
                    reason = 'workload footprint limit'
                elif available < args.min_available_gib * gib:
                    reason = 'available memory floor'
                elif swap_growth > args.max_swap_growth_mib * 1024**2:
                    reason = 'swap growth limit'
                if reason:
                    stop()
                    break
                time.sleep(0.5)
            code = child.wait()
        finally:
            stop()
        result = dict(command=command, exit_code=code, stopped_by=reason, peak_footprint_gib=peak/gib,
                      seconds=time.monotonic()-start)
        Path(f'reports/{args.name}-summary.json').write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps(result), flush=True)
        raise SystemExit(code if code >= 0 else 1)


if __name__ == '__main__':
    main()
