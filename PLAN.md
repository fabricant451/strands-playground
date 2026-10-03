> Historical implementation plan. See README.md and docs/BUILD.md for the current single-thread WebGPU setup and validated scope.

# Strands Decider: GGUF, WebGPU, and wllama

Prepared 2026-10-02. This is an implementation plan; no conversion, model inference, or performance validation has been run. Default sequencing is a small native proof first, using the existing upstream decision infrastructure, followed by WebGPU and browser integration.

The target is `StrandsAgents/strands-decider-2B-hobson-v19`: the adapted Qwen3.5 text backbone, its trained pointer head, and its original decision semantics. The deliverable is a reproducible GGUF export that runs through llama.cpp and wllama's `createSystemOne()` with browser WebGPU acceleration.

## Findings that determine the design

- Current upstream llama.cpp already has `tools/server/server-decision.{h,cpp}`, decision GGUF metadata, typed tasks, temperature handling, and pointer scoring. Extend this infrastructure instead of introducing a separate inference runtime. The older Laya PR alone does not describe the current upstream state.
- Current upstream wllama already has `createSystemOne()`, a GLUE action, and `examples/decision/`. The local checkout predates these interfaces. Reuse them after selecting compatible revisions.
- The local llama.cpp has a Qwen3.5 converter and WebGPU dispatch for SSM convolution, Gated DeltaNet, normalization, and matrix operations. Operation presence is not proof that every shape and execution path needed by this model works.
- Strands needs final backbone states at each option's last qualifying token and the answer position. It applies learned LayerNorm, biased query/key projections to 256 dimensions, a scaled dot product, temperature, and softmax. It does not need vocabulary logits.
- Upstream pointer scoring already reads concatenated query/key vectors through the embeddings output, then computes a small dot product on CPU. This is a suitable first integration contract. Backbone and learned projections should execute on WebGPU; the small final scoring and response formatting can remain in C++/WASM.
- Upstream generic score confidence differs from Strands' formula. Matching labels and probabilities alone is insufficient to claim response parity.

Reviewed local revisions: llama.cpp `6d33b9c405a20fe95a71afd6b292861e0c03658c`; wllama `0529057cf0d7a6abab9403300066b18a16eb763c`; its llama.cpp submodule `c7bda030e7faee594dbe7550185e857351ad405d`. Upstream API tree snapshots inspected: llama.cpp `bed0a856606ee4a24a164066f73d2379447033f5`, wllama `7ed17361caf221a84aa1e80ca85a3d6324f3af85`. Some initial source reads used moving branches; implementation must pin and recheck a compatible pair.

## 1. Pin inputs and create a reference harness

Create isolated worktrees for implementation, preserving the existing sibling checkouts and their untracked files. Keep conversion scripts, fixtures, reports, and the demo in this playground; keep runtime changes in the appropriate llama.cpp and wllama worktrees.

Pin the model repository, base weights, tokenizer, Strands Python source, dependencies, llama.cpp, and wllama. The checkpoint's provenance records base revision `b1485b2fa6dfa1287294f269f5fb618e03d52d7c`, but explicitly says this was inferred rather than pinned during training. Record that limitation and the actual hashes used.

Generate Python reference fixtures containing:

- Input state/questions, rendered strings, token IDs, option positions, answer position, and window/truncation decisions.
- Selected final hidden states, pointer projections, raw scores, probabilities, and complete typed responses.
- Model/config/tokenizer hashes and execution dtype/device.

Use a small diagnostic set first, then roughly 100-200 varied questions: all three primitives, multiple questions per state, Unicode, numeric option names, whitespace/newlines, structured state, custom yes/no criteria, near ties, and lengths around batch and context boundaries. Include original model-card examples. Use unmerged Python inference as the primary reference and separately measure drift introduced by LoRA merging.

Exit: fixtures regenerate reproducibly; expected token positions and response semantics are understood before implementing the native port.

## 2. Export a complete decision GGUF

Merge LoRA into the text backbone in floating point, then reuse Qwen3.5's existing converter transforms. Pay particular attention to parameter prefixes, zero-centered normalization, recurrent parameter transforms, and value-head reorderings. Apply these transformations once through the existing converter.

Recommended representation:

- Keep the `qwen35` backbone architecture and add a Strands decision type under the existing decision metadata namespace, subject to loader compatibility review.
- Include head LayerNorm weight/bias, query weight/bias, and key weight/bias in the same logical GGUF model. Reuse compatible existing head tensor names where possible.
- Store pointer dimension, per-kind temperatures, fallback temperature, ordinal smoothing, inference window, prompt-format version, and source provenance. Reuse existing keys and add only missing fields.
- Include the tokenizer and a dedicated System One prompt template or equivalent versioned rendering contract. The checkpoint's general chat template is not the Strands inference prompt.
- Keep the head in F32 initially, including after backbone quantization. Do not introduce a separate trained LM head; retain input embeddings even if output weights were tied in the base.

Produce F16 backbone + F32 head first, followed by Q8_0. Evaluate Q4_K_M only after parity is established. Validate required tensors, shapes, metadata, and quantizer retention of custom tensors. If using the `qwen35` architecture would cause unsafe ambiguity with generation, choose a small registered variant that reuses the backbone implementation; avoid duplicating the transformer graph.

Exit: the GGUF is self-contained, loads on CPU, survives quantization with its head intact, and reports its decision capability correctly.

## 3. Native Strands inference through the existing decision API

Extend Qwen3.5's loader and graph with the decision-head path. After the backbone's final RMSNorm, apply the head's own learned LayerNorm and both biased projections. Expose concatenated 256-dimensional query/key vectors through the decision embeddings path, with output width 512. Skip the vocabulary projection for decision inference. Verify graph outputs, output dimension metadata, and pooling behavior together.

Reuse the server's pointer/marker task fields and scoring path, but add Strands-specific prompt preparation:

- Match Python's separate tokenization of the state with special-token handling and the question without added special tokens; concatenate their token IDs. Do not assume tokenizing the concatenated string is equivalent.
- Match numbered option lines, the literal separator, description whitespace normalization, state/instruction serialization, false/true ordering, and final `<answer>` marker.
- Compute marker indices without adding special delimiters or changing the trained prompt. Strands' reference selects the last token whose offset span is wholly inside the option line. Prove native offset mapping against fixtures, including byte-versus-code-point boundaries and tokens that cross line boundaries.
- Preserve option order, including numeric-looking JSON keys. JavaScript and C++ object ordering can differ from Python insertion order; choose and test an explicit wire-order strategy if the current API loses that order.
- Start with strict context rejection for the diagnostic harness, explicitly documenting this difference from upstream Python's default. Before claiming full parity, implement the pinned engine's question reservation, state truncation, and missing-option rejection rules, including their dependence on the longest question in a request.

Extend decision-type detection and embedding-mode setup. Reuse per-kind temperatures, with Strands' configured fallback. Preserve choice confidence `(N * max(p) - 1) / (N - 1)`, score expectation, score confidence based on standard deviation and the ordinal-smoothing correction, and `noul = P(true)`. Apply changes only to the Strands type.

The current server reads decision outputs from one final batch. Explicitly test and enforce the required option-to-answer suffix budget; distinguish `n_batch` from `n_ubatch`. If valid inputs exceed that contract, collect retained projections across chunks rather than silently dropping options or reducing the model's advertised window.

First process questions independently and clear recurrent/KV state between requests. Enable prefix sharing only after proving hybrid-state snapshot/restore and question independence. Shared-prefix optimization is not required for the first working demo.

Exit: native `/v1/systemone` produces reference-compatible responses for F16 and Q8_0, with numerical reports and existing decision-model regression tests passing.

## 4. Validate and optimize WebGPU

Run the same artifacts and fixtures with the native WebGPU backend before involving the browser. Record graph placement to confirm that the Qwen3.5 layers and learned head projections are actually offloaded. CPU execution of the small final dot products, softmax, and response formatting is intentional; unexpected recurrent-layer fallback is not acceptable for the accelerated milestone.

Audit the observed graph's operator shapes and dtype/layout restrictions. Prioritize Gated DeltaNet, SSM convolution, normalization, gather/concatenation, projections, and the selected attention path. Add backend-op cases for demonstrated gaps; only add or change WGSL kernels when a specific failure or profile justifies it.

Compare native CPU, native WebGPU, browser WASM CPU on a small feasible subset, and browser WebGPU. Separate cold load/shader compilation from warm execution. Measure 128/512/2048/4096-token inputs and 1/4/8 questions where hardware permits, logging actual token counts, batch settings, offload, memory, and failures. Prefer sequential questions initially to bound browser memory.

Exit: WebGPU passes the chosen parity gates, the intended graph is accelerated, repeated requests are stable, and browser memory limits are measured on named hardware.

## 5. Integrate wllama and build the browser demo

Use an upstream wllama revision with `createSystemOne()` and point its submodule at the tested llama.cpp revision. Rebuild WASM, generated GLUE types, and worker assets through the existing scripts. Test whether the native additions flow through the current action unchanged before modifying the TypeScript API.

Adapt the existing decision example into the playground: state editor, editable typed questions, per-option probabilities, score/confidence, download progress, cold/warm latency, and a model precision selector. Keep inference in the existing worker. Support download cancellation, inference cancellation, unload/reload, and useful errors for unavailable GPU capabilities or resource exhaustion.

Start with desktop Chrome on the available Mac; add a second GPU vendor/platform when hardware is available. Record browser/GPU/build versions. Serve the required isolation headers for threaded WASM and use the existing model download/cache machinery. Split large artifacts into manageable pieces using wllama's supported loading mechanism; confirm that quantization/splitting preserves all metadata and head tensors.

Exit: a cached model reload works, multiple successive requests match the native fixture results within declared tolerances, UI remains responsive, and no inference backend service is used.

## Validation and release gates

Token IDs, marker indices, option order, schema, and error behavior must match exactly for the declared supported scope. Numerical comparisons should report maximum/mean probability error, raw-score error, top-answer flips with reference margins, and score/confidence drift.

Set tolerances before evaluating the full holdout, using repeated Python runs and a small diagnostic set to distinguish dtype/merge variation from port errors. Initial investigation targets, not validated promises: F16 maximum probability error around 0.01 and Q8_0 around 0.03 on short diagnostic fixtures. Investigate larger differences; never loosen thresholds solely to make the port pass. Near-tie flips must be reported rather than hidden in aggregate accuracy.

Measure quantization quality separately from runtime parity: compare each backend on identical GGUF weights, then compare F16/Q8/Q4 against the Python reference on a held-out task set. Recompute accuracy and calibration metrics before making calibration claims for quantized exports. Do not silently retune the checkpoint temperatures to conceal numerical regressions.

Deliverables: pinned export script and manifest, fixtures and parity runner, native integration, any necessary WebGPU fixes, wllama build/demo, and a reproducible results table. Publishing models or opening upstream submissions is a later user-directed action.

Suggested implementation increments: (1) fixtures and merged-backbone validation; (2) GGUF plus native head and request semantics; (3) measured WebGPU fixes; (4) wllama integration and demo; (5) quantization and prefix-cache optimization. The highest-risk first experiment is a single short choice question reaching identical token positions and close raw head scores on Python and native CPU.

## Source map

- [Checkpoint and provenance](https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19/tree/main)
- [Strands modeling](https://github.com/strands-labs/strands-decider/blob/main/src/strands_decider/modeling.py), [prompting](https://github.com/strands-labs/strands-decider/blob/main/src/strands_decider/prompting.py), [inference](https://github.com/strands-labs/strands-decider/blob/main/src/strands_decider/infer.py), and [response schema](https://github.com/strands-labs/strands-decider/blob/main/src/strands_decider/schema.py)
- [llama.cpp decision request handling](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-decision.cpp) and [task execution/pointer scoring](https://github.com/ggml-org/llama.cpp/blob/bed0a856606ee4a24a164066f73d2379447033f5/tools/server/server-context.cpp)
- [Qwen conversion](https://github.com/ggml-org/llama.cpp/blob/bed0a856606ee4a24a164066f73d2379447033f5/conversion/qwen.py), [Qwen3.5 graph](https://github.com/ggml-org/llama.cpp/blob/bed0a856606ee4a24a164066f73d2379447033f5/src/models/qwen35.cpp), and [WebGPU backend](https://github.com/ggml-org/llama.cpp/tree/master/ggml/src/ggml-webgpu)
- [wllama public API](https://github.com/ngxson/wllama/blob/7ed17361caf221a84aa1e80ca85a3d6324f3af85/src/wllama.ts), [native action](https://github.com/ngxson/wllama/blob/7ed17361caf221a84aa1e80ca85a3d6324f3af85/cpp/wllama-context.h), and [decision demo](https://github.com/ngxson/wllama/blob/7ed17361caf221a84aa1e80ca85a3d6324f3af85/examples/decision/index.html)
