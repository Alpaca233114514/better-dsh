# DSHGit desktop rc.2 verification

Date: 2026-10-16. Package: `dshgit@0.1.1-desktop.0`. Target: the installed official desktop CLI/Host `0.2.0-rc.2`, Cordis `4.0.4`, actual Chrome, Windows.

## Commands and results

- `npm run typecheck`: passed against exact published rc.2 declarations.
- `npm run build`: passed; delivered Host and client bundles used for verification.
- `npm test`: 18 passed, zero failures/skips. Tests include real temporary Git repositories and local bare remote; mocked gh coverage does not prove a real GitHub PR flow.
- After the Host parameter correction: `node --test test/host.test.mjs`: 4 passed, zero skips. Typecheck and build passed again.
- Official bundled desktop `dsh.cmd plugin --profile web add link:<candidate> --offline --ignore-scripts`: accepted in a separate `DSH_HOME`; no version exception. Official bundled `dsh.cmd web --host 127.0.0.1 --port 4331 --no-open --patch <fixture>` started the actual rc.2 Host, not the preview server.
- Actual Chrome opened a synthetic persisted workspace Session. Test-only setup used official Agent/Session/workspace services to append a closed synthetic turn without calling a model. Git backend, gateway, sandbox policy, confinement and subprocess services were real.
- Actual UI: Session header DSHGit launcher opened; branch `test/desktop-compat`, `tracked.txt` modified and `new.txt` untracked, +1/-0 displayed. File diff showed `+changed`. Stage and unstage succeeded through the panel and returned the same two unstaged files.
- Actual UI commit with message `DSHGit real rc2 Host simulation` produced `e01d39be21650cc3ac6f013151e9d72742ee4953`; direct Git inspection confirmed both synthetic changes committed and a clean working tree. A harness initially waited for nonexistent text `0 个变更文件`; the actual success text is `没有待提交的变更`. This was a harness wait failure, not a failed commit; the commit was not repeated.

## Defect found by real Host validation

Initial gateway call failed with `typert gateway: dshgit/run: args fields do not match the descriptor: unexpected "request"`. The decorated Host method parameter was named `raw`, while the strict contribution named it `request`. Matching the Host parameter name to the published descriptor fixed actual gateway calls. Direct service unit tests alone did not detect this mismatch.

## Scope and manual desktop acceptance

The official bundled CLI subsequently installed `dshgit@0.1.1-desktop.0` into the user's `desktop` profile from a packed tarball. The installed package version was read back and all other dependency entries and existing bundles were preserved. Configuration was backed up before installation. Installation was accepted without a version exception. The running desktop window was not forcibly closed; loading in that window remains pending a full exit/relaunch and user manual inspection.

Real UI push to an isolated local bare remote was attempted and failed under the actual Windows Host confinement: Git for Windows `sh.exe` reported `couldn't create signal pipe, Win32 error 5`, followed by `Could not read from remote repository`. The panel displayed this failure, preserved the successful local commit and clean working tree, and did not retry without confinement. This is an unresolved push limitation in the tested environment; successful unit-test push coverage does not supersede it. No real remote push or plugin-created GitHub PR is claimed.

The standalone `npm run preview` uses a simulated remote and is only a visual preview. Real Host validation above used synthetic data in an isolated profile. It did not run a model, create a real GitHub PR through the plugin, or exercise the user's desktop window. Desktop configuration changes require a full exit and relaunch before taking effect.

After installing with the bundled desktop CLI, reopen the desktop application, open an existing Session attached to a Git workspace, and click **DSHGit** in its header. Verify branch/files, select a file to inspect its diff, and stage/unstage a safe test file. Open **提交与推送** to inspect the menu; actual commits/pushes are optional during manual review. Blank draft Sessions have no launcher. Do not merge the delivery PR until the user approves manual desktop inspection.

Screenshots: `real-host-panel.png`, `real-host-diff.png`, `real-host-staged.png`. Full local logs and synthetic Git history are retained by the coordinating task outside the package. No auth bootstrap URLs are included here.
