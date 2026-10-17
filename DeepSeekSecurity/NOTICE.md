# Third-party notices

`vendor/codex-security/` contains selected files from OpenAI Codex Security,
commit `5efc3d9416132c835aba4225a42903c1a7dedf61`, licensed under Apache License 2.0.
The complete upstream license is retained at `vendor/codex-security/LICENSE`.
The original directory layout and the selected file list are retained for updates.

The DSH API, UI components, and TodoPanel geometry are from DeepSeek Harness,
commit `d743267388641bc76f17c45ce8b4c231aed1d32c`, under the MIT License.
The MIT license is reproduced in `DSH-LICENSE`.

DSH integration source in `src/` is separate from the OpenAI vendor files.
Local changes to `workbench_target.py` (Windows long-path I/O) and `workbench_db.py`
(opt-in startup progress events) are documented in `UPSTREAM.md`.
This is a local community integration, not an official OpenAI or DeepSeek release.
