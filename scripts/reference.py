"""Generate pinned, unmerged Python decision fixtures."""
import argparse
import json
import os
from pathlib import Path

os.environ.setdefault('HF_DEACTIVATE_ASYNC_LOAD', '1')

import torch
from huggingface_hub import snapshot_download
from peft import PeftModel
from transformers import AutoTokenizer

from strands_decider.infer import EngineConfig, SystemOneEngine
from strands_decider.modeling import StrandsDeciderConfig, StrandsDeciderModel, load_head_state
from strands_decider.prompting import render_question, render_state
from strands_decider.schema import SystemOneRequest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--device', default='mps')
    parser.add_argument('--dtype', default='bfloat16', choices=['bfloat16', 'float32'])
    parser.add_argument('--limit', type=int, default=1)
    args = parser.parse_args()
    torch.set_num_threads(2)
    if args.device == 'cpu' and args.dtype != 'float32':
        parser.error('The upstream CPU engine upcasts weights; use MPS for the low-memory reference')
    if args.device == 'mps':
        torch.mps.set_per_process_memory_fraction(0.35)
    manifest = json.loads(Path('manifest.json').read_text())
    base = snapshot_download(manifest['base']['repo'], revision=manifest['base']['revision'], local_files_only=True,
                             allow_patterns=['*.json', '*.jinja', '*.safetensors'])
    config = StrandsDeciderConfig.from_json('models/strands/hobson_config.json')
    config.base_model = base
    config.torch_dtype = args.dtype
    torso = StrandsDeciderModel._load_torso(config, args.device, 'eager')
    torso = PeftModel.from_pretrained(torso, 'models/strands/lora', is_trainable=False)
    model = StrandsDeciderModel(config, torso, AutoTokenizer.from_pretrained('models/strands'))
    model.head.load_state_dict(load_head_state('models/strands'))
    engine = SystemOneEngine(model, EngineConfig(device=args.device, max_batch=1, use_prefix_cache=False, strict_window=True))
    cases = json.loads(Path('fixtures/requests.json').read_text())
    cases = [{'state': case['state'], 'questions': {key: question}}
             for case in cases for key, question in case['questions'].items()]
    if args.limit:
        cases = cases[:args.limit]
    output = []
    with torch.inference_mode():
        for case in cases:
            request = SystemOneRequest.model_validate(case)
            captured = []
            def capture(module, inputs, scores):
                decide, options = inputs
                captured.append({'scores': scores.cpu().tolist(),
                                 'query': module.q(module.norm(decide)).cpu().tolist(),
                                 'keys': module.k(module.norm(options)).cpu().tolist(),
                                 'answer_hidden': decide.cpu().tolist(),
                                 'option_hidden': options.cpu().tolist()})
            handle = model.head.register_forward_hook(capture)
            response = engine.evaluate(request)
            handle.remove()
            rendered = [render_question(q) for q in request.questions.values()]
            s, qs = engine._fit(render_state(request.state), [r.text for r in rendered])
            positions = engine._option_idx(rendered, len(s)).tolist()
            output.append({'request': case, 'response': response.model_dump(), 'tokens': [s + q for q in qs],
                           'option_positions': positions, 'answer_positions': [len(s)+len(q)-1 for q in qs],
                           'head': captured})
            Path('fixtures/reference.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n')
            print(response.model_dump_json(), flush=True)


if __name__ == '__main__':
    main()
