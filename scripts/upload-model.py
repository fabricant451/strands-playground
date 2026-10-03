"""Publish the reviewed Q8 GGUF and its attribution to the selected Hub repo."""
import json
from pathlib import Path
from huggingface_hub import HfApi, CommitOperationAdd, hf_hub_download

repo = 'fabricant451/strands-decider-2B-hobson-v19-GGUF'
api = HfApi()
assert api.whoami()['name'] == 'fabricant451', 'Unexpected Hugging Face account'
license_path = hf_hub_download('StrandsAgents/strands-decider-2B-hobson-v19', 'LICENSE.md', revision='bb282d786bc251fd4e3068de3ada9ddbb38127cd')
api.create_repo(repo_id=repo, repo_type='model', private=False, exist_ok=True)
files = {
    'strands-q8_0.gguf': 'models/strands-q8_0.gguf',
    'README.md': 'deployment/model/README.md',
    'manifest.json': 'manifest.json',
    'LICENSE.md': license_path,
}
commit = api.create_commit(repo_id=repo, operations=[CommitOperationAdd(path_in_repo=name, path_or_fileobj=path) for name,path in files.items()], commit_message='Add Strands Hobson v19 Q8_0 GGUF and provenance', num_threads=1)
result = {'repo':repo, 'revision':commit.oid, 'model_url':f'https://huggingface.co/{repo}/resolve/{commit.oid}/strands-q8_0.gguf'}
Path('deployment/model-upload.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result), flush=True)
