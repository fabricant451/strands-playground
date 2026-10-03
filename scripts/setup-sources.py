"""Create independent pinned upstream checkouts and apply project patches."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
URLS = {
    'llama.cpp': 'https://github.com/ggml-org/llama.cpp.git',
    'wllama': 'https://github.com/ngxson/wllama.git',
    'strands-decider': 'https://github.com/strands-labs/strands-decider.git',
}


def git(path, *args, check=True):
    return subprocess.run(['git', '-C', str(path), *args], check=check, capture_output=True, text=True)


def apply_patch(path, patch):
    if git(path, 'apply', '--check', str(patch), check=False).returncode == 0:
        git(path, 'apply', str(patch))
    elif git(path, 'apply', '--reverse', '--check', str(patch), check=False).returncode != 0:
        raise RuntimeError(f'{path}: patch conflicts with local changes; checkout left untouched')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, default=ROOT)
    args = parser.parse_args()
    pins = json.loads((ROOT / 'manifest.json').read_text())['sources']
    for relative, repo in [('llama.cpp','llama.cpp'), ('wllama','wllama'), ('wllama/llama.cpp','llama.cpp'), ('strands-decider','strands-decider')]:
        path = args.directory.resolve() / relative
        if not (path / '.git').exists():
            subprocess.run(['git','clone','--filter=blob:none','--no-checkout',URLS[repo],str(path)],check=True)
            git(path, 'checkout', '--detach', pins[repo])
        actual = git(path, 'rev-parse', 'HEAD').stdout.strip()
        if actual != pins[repo]:
            raise RuntimeError(f'{path}: expected {pins[repo]}, found {actual}; refusing to reset existing checkout')
        patch = ROOT / 'patches' / f'{repo}.patch'
        if patch.exists():
            apply_patch(path, patch)
        print(f'Ready: {relative} @ {actual}')


if __name__ == '__main__':
    main()
