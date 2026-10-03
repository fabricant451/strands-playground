"""Download either the published GGUF or pinned conversion/reference sources."""
import argparse
import json
from pathlib import Path
from huggingface_hub import hf_hub_download, snapshot_download

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--sources', action='store_true', help='Also download backbone and adapter for conversion/reference')
args = parser.parse_args()
published = json.loads((root/'deployment/model-upload.json').read_text())
hf_hub_download(published['repo'], 'strands-q8_0.gguf', revision=published['revision'], local_dir=root/'models')
if args.sources:
    manifest = json.loads((root/'manifest.json').read_text())
    snapshot_download(manifest['model']['repo'], revision=manifest['model']['revision'], local_dir=root/'models/strands')
    snapshot_download(manifest['base']['repo'], revision=manifest['base']['revision'], allow_patterns=['*.json','*.jinja','*.safetensors'])

    adapter = root/'models/strands/lora/adapter_config.json'
    config = json.loads(adapter.read_text())
    config['revision'] = manifest['base']['revision']
    adapter.write_text(json.dumps(config, indent=2)+'\n')
