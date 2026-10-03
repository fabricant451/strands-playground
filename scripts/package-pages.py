"""Package root UI sources for Pages; use the checked-in runtime by default."""
import argparse
import json
from pathlib import Path
import shutil
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-url', help='Override the pinned public GGUF URL')
    parser.add_argument('--output', type=Path, default=ROOT / 'site')
    parser.add_argument('--refresh-runtime', action='store_true', help='Copy a newly built runtime from wllama/esm')
    args = parser.parse_args()
    url = args.model_url or json.loads((ROOT / 'deployment/model-upload.json').read_text())['model_url']
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname != 'huggingface.co' or '/resolve/' not in parsed.path:
        parser.error('Expected an HTTPS Hugging Face /resolve/ URL')
    site = args.output.resolve()
    site.mkdir(parents=True, exist_ok=True)
    for name in ['index.html', 'style.css', 'editor.js', 'manifest.json']:
        shutil.copyfile(ROOT / name, site / name)
    demo = (ROOT / 'demo.js').read_text().replace("'/models/strands-q8_0.gguf'", json.dumps(url))
    (site / 'demo.js').write_text(demo)
    source = ROOT / ('wllama/esm' if args.refresh_runtime else 'site/wllama/esm')
    target = site / 'wllama/esm'
    (target / 'wasm').mkdir(parents=True, exist_ok=True)
    for name in ['index.js', 'wasm/wllama.wasm']:
        if not (source / name).is_file():
            parser.error(f'Missing runtime asset: {source / name}')
        if (source / name).resolve() != (target / name).resolve():
            shutil.copyfile(source / name, target / name)
    for repo, license_name in [('wllama', 'LICENCE'), ('llama.cpp', 'LICENSE')]:
        name = f'LICENSE-{repo}.txt'
        source_license = ROOT / repo / license_name if args.refresh_runtime else ROOT / 'site' / name
        if source_license.resolve() != (site / name).resolve():
            shutil.copyfile(source_license, site / name)
    (site / '.nojekyll').touch()
    print(f'Packaged {site} ({sum(p.stat().st_size for p in site.rglob("*") if p.is_file()) / 1024**2:.1f} MiB)')


if __name__ == '__main__':
    main()
