# Deployment

- GitHub: https://github.com/fabricant451/strands-playground
- Pages: https://fabricant451.github.io/strands-playground/
- Model: https://huggingface.co/fabricant451/strands-decider-2B-hobson-v19-GGUF

## UI updates

The project root is now the Git checkout. Edit the root HTML/CSS/JS, commit and push to `main`. The Pages workflow runs `python3 scripts/package-pages.py` before uploading `site/`. No separate deployment repository or WASM rebuild is needed for UI changes.

To preview exactly what Pages will publish:

```sh
python3 scripts/package-pages.py
python3 scripts/serve.py --directory site
```

`deployment/strands-playground/` is an ignored legacy checkout from the initial deployment; do not push from it. The existing Git history and Pages URL are preserved.

## Runtime updates

Follow `docs/BUILD.md`, export the source patches, and run `python3 scripts/package-pages.py --refresh-runtime`. Commit the changes in `patches/`, `site/wllama/esm/`, and any updated source/toolchain metadata. UI packaging in CI uses the checked-in runtime; it does not compile llama.cpp.

## Model updates

Authenticate locally as `fabricant451`:

```sh
gh auth login --hostname github.com --git-protocol https --web
.venv/bin/hf auth login
```

`python scripts/upload-model.py` is an explicit publishing command. It uploads the Q8 GGUF, model card, license, and provenance, then records the resulting immutable revision in `deployment/model-upload.json`. Use the `.venv` Python interpreter and memory guard as appropriate. Review that metadata and commit it to deploy the new model URL. Old pinned URLs remain valid.

GitHub Pages must have **Settings > Pages > Source > GitHub Actions** selected; this is already configured. The workflow can also be triggered manually from Actions. No SSH key, service worker, custom isolation headers, backend inference service, or browser credentials are required.
