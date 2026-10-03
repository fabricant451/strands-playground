---
license: apache-2.0
base_model: StrandsAgents/strands-decider-2B-hobson-v19
base_model_relation: quantized
pipeline_tag: text-classification
tags:
  - gguf
  - strands-decider
  - webgpu
---

# Strands Decider Hobson v19 GGUF

Experimental Q8_0 conversion of [StrandsAgents/strands-decider-2B-hobson-v19](https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19), based on Qwen3.5-2B-Base.

This is a typed decision model (choice, boolean and ordinal score), not a chat model. It requires the custom Strands-aware llama.cpp/wllama runtime used by the demo. Stock GGUF clients are not assumed compatible.

The adapter is merged into the backbone. The pointer/classification head is retained; its output weights remain F32. The GGUF is approximately 1.9 GiB with a 4096-token context window.

Source model revision: `bb282d786bc251fd4e3068de3ada9ddbb38127cd`.
Base revision: `b1485b2fa6dfa1287294f269f5fb618e03d52d7c` (inferred, not pinned by the training hosts).

Eight browser reference fixtures passed with maximum probability error below 0.006 against the Python reference. This is a small conversion smoke test, not a model-quality benchmark.
