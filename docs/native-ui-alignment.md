# Native UI alignment

This change aligns the two independent plugins with DSH's existing UI. It does
not introduce a shared plugin runtime or a second component library.

## Dependency baseline

- Rich Thinking PR #2: `c4935e26ee3d7c796c5fd23c3aca3808f5e5a0aa`.
- DeepSeek Security PR #3: `4eab585a1915a1dea42feb1f6f82f2dae13e00fc`.
- `codex/ui-unification-base`: `04023810c9976b8fef39ee329b8267e178993d6a`.

The baseline merges these exact commits, preserving both additions in README and
NOTICE. Neither prerequisite was merged to main. The UI PR targets this baseline,
so its review diff excludes the two plugin implementations. Before integration
into main, resolve the prerequisite PRs and retarget/revalidate the UI change;
merging this stacked PR into its temporary base alone does not deliver it to main.

## UI contracts

Security keeps `@DeepSeek Security` plus the user's request. Selecting a reference
does not start a scan. Model invocation starts work, the composer dock shows actual
progress while active, and terminal states hide the panel. Results stay in chat.

The dock uses native DisclosureRow, Button and StateDot. Stop occupies the native
header layout outside the disclosure target. Its text cannot shrink or wrap.
The action is a sibling of DisclosureRow: rc.2 does not expose alpha.2's
`headerAccessory` prop, so using that prop would silently remove Stop on rc.2.
Steps use TodoPanel's compact status markers, labelled for assistive technology,
native secondary typography and scrolling tokens. Enter/Space still toggle the
native disclosure. Component extraction makes it testable without initializing
plugin registration or RPC contributions; the observer and scan engine are unchanged.

Rich Thinking preserves the native reasoning row, body, icon and bottom status.
Its settings keep native Switch/Input/Button and configForms persistence. The
select/textarea controls match ConfigField's layer, border, radius and spacing
tokens; ConfigField itself is not exported by either supported primitives package.
Custom styles remain scoped to plugin-owned markers. Keyboard focus, disabled
appearance, field separators and wrapping action layout follow the native UI.
Long spinner labels can shrink without pushing their timer outside the row.

Source references (read-only source cache used during implementation):

- DSH `packages/client/ui-conversation/src/client/skeleton/TodoPanel.*`
- DSH `packages/client/ui-primitives/src/DisclosureRow.*`, `ConfigField.*`, `Input.*`
- DSH `packages/client/ui-theme/src/styles/{base,design-platform,focus,gradient-shadow-text,scrollbar}.css`

DSH source baseline: `d743267388641bc76f17c45ce8b4c231aed1d32c`
(`0.2.1-alpha.2`); Rich Thinking also tests `0.2.0-rc.2`.

## Reproduce validation

Install each plugin's existing lockfile with `npm ci --ignore-scripts` (the local
run used `--offline`). There is no separate lint script in either package.

```powershell
npm --prefix DeepSeekSecurity run typecheck
npm --prefix DeepSeekSecurity run build
npm --prefix DeepSeekSecurity test
$env:DSH_SOURCE = 'C:/path/to/deepseek-harness-source'
npm --prefix RichThinking run typecheck
npm --prefix RichThinking run build
npm --prefix RichThinking test

# Point to an existing local Playwright installation and Chromium executable.
$env:RICH_THINKING_PLAYWRIGHT = 'C:/path/to/playwright/index.mjs'
$env:RICH_THINKING_CHROMIUM = 'C:/path/to/chrome-headless-shell.exe'
node test/verify-native-ui.mjs
```

The combined browser fixture reads actual DSH primitives, ReasoningRow and theme
styles from `DSH_SOURCE`. It shares one React instance like the DSH runtime. RPC
and configForms transport are scripted test doubles; no model requests are made.
Artifacts are written to `RichThinking/.cache/browser/unified-*`.

## Verification scope

- DeepSeekSecurity: typecheck/build and 13 existing regression tests passed.
- RichThinking: typecheck/build and 25 tests passed against alpha.2; all 25 also
  passed against rc.2, with no skipped tests.
- Combined local Chromium: 8 groups passed on each of alpha.2 and rc.2. They cover idle/active/terminal states, Enter/Space
  disclosure, progress changes, light/dark tokens, enlarged font at 360px, focus,
  duplicate Stop, cancellation failure/retry, session away/back, atomic settings
  save, rejected edits, reload, settings away/back, read-only state, reduced motion
  and teardown. Browser errors: zero.

Reviewed artifacts: [alpha.2 results](ui-verification/alpha2/unified-results.json),
[rc.2 results](ui-verification/rc2/unified-results.json),
[light](ui-verification/alpha2/unified-light.png),
[dark](ui-verification/alpha2/unified-dark.png),
[360px + larger font](ui-verification/alpha2/unified-narrow-large-font.png).

Screenshots are component-fixture evidence, not a running DSH desktop session.
Full desktop installation, model-driven plugin selection, quota-consuming live
scans and native OS/system-theme propagation were not exercised for this change.
The Security host compatibility claim remains alpha.2; rendering against rc.2
does not prove its full host runtime. No GitHub CI result or independent PR review
is claimed by these local checks.
