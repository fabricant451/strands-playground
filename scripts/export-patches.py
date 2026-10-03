"""Export reviewed source changes; generated runtime assets are kept separately."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
patches = ROOT / 'patches'
patches.mkdir(exist_ok=True)
patch = subprocess.check_output(['git','-C',str(ROOT/'llama.cpp'),'diff','HEAD','--binary'])
for path in ['conversion/strands.py','tests/test-strands.cpp']:
    tracked = subprocess.run(['git','ls-files','--error-unmatch',path],cwd=ROOT/'llama.cpp',capture_output=True).returncode == 0
    if not tracked:
        result = subprocess.run(['git','diff','--no-index','--','/dev/null',path],cwd=ROOT/'llama.cpp',stdout=subprocess.PIPE)
        if result.returncode != 1:
            raise RuntimeError(f'Cannot export {path}')
        patch += result.stdout
(patches/'llama.cpp.patch').write_bytes(patch)
(patches/'wllama.patch').write_bytes(subprocess.check_output(['git','-C',str(ROOT/'wllama'),'diff','HEAD','--','CMakeLists.txt','cpp/wllama-context.h']))
