# Workspace read boundary

Security creates its own scoped `read`, `glob`, and `grep` tools. It masks all
ambient tools with `allow: []` and does not compose or mount the parent preset.
Windows Minimal therefore works even when its only tool is `pwsh`; the scan
never receives that shell. Standard's unbounded readers are masked too.

Each access checks the normalized path against the canonical workspace, rejects
link components (including Windows junctions), resolves the actual target, and
checks containment again. Reads compare the opened file identity with the
checked regular file and check the path again before reading. Search walks
checked directories itself instead of asking a shell or inherited search backend
to follow paths. Search patterns only filter already checked internal paths.

All links are excluded, including links targeting another file inside the
workspace. Regular internal absolute paths and normalized internal paths remain
supported. Files are limited to 1 MiB; read output is limited to 2,000 lines;
search is limited to 20,000 visited entries and 200 results. Truncation and skipped
text files are reported. `grep` deliberately searches literal, case-sensitive
text, as its tool description states. These limits and link exclusions must be
reported as coverage limitations rather than presented as a complete audit.

This is a local static-audit boundary, not an OS sandbox for concurrently hostile
processes. It does not authorize extra roots or execute project code. Model tool
arguments cannot expand the root, enable links, run commands, or select another
filesystem backend. Host-owned report persistence remains outside the workspace.

## Regression evidence

Run `npm test` in DeepSeekSecurity. `test/boundary.test.mjs` uses the production
driver and actual alpha.2 AgentRegistry, ToolRuntime and AgentLoop with a scripted
provider and synthetic temporary files. It creates real directory junctions and
file symlinks on Windows; failure to create them fails the test rather than
silently skipping coverage.

Both Minimal and Standard parent inventories are tested. Standard additionally
has ambient global tools whose execution would fail the test. Every provider
request is checked for the external canary, and the next provider request must
contain the expected rejection or successful internal read. The Windows suite
executes 22 tool calls and 23 scripted requests per preset: absolute escapes,
`..`, sibling names sharing the workspace prefix, junctions, file symlinks,
internal links, device/ADS paths, all three read/search tools, valid internal
paths and read argument validation. No real model or external network is used.

The original review probe expected the vulnerability (`outsideReachedModel:
true`). This regression expects `false` and requires internal reads to succeed.
Per-run JSON evidence is written into each synthetic temporary fixture directory.

Compatibility: Security Host is tested with DSH 0.2.1-alpha.2. The separate rc.2
UI fixture proves rendering contracts only, not complete rc.2 Host compatibility.
Desktop restart/loading and real-model tool selection are not exercised here.
