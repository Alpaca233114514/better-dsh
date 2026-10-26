# dsh-next-suggestion

Next-message suggestions for DeepSeek Harness. A suggestion appears as ghost text after the assistant finishes, while the composer is empty and the window is in the foreground.

- **Tab / → / Enter**: insert the suggestion as an editable draft for you to send.
- **Esc**: dismiss the current suggestion.
- **Start typing**: hide the suggestion; clearing the draft can show it again.

Desktop and Web provide ghost-text interaction. CLI exposes the `nextSuggestion/getConfig`, `predict`, and `updateConfig` service methods.

[中文](../README.md) · [Architecture](architecture.md)

## Install

Run from the repository. The default target is the desktop profile:

```bash
./install.sh
```

Choose another profile:

```bash
./install.sh --profile web
```

For CLI-managed profiles, you can also use:

```bash
dsh plugin --profile web add .
```

Restart DSH and enable **Show predicted messages** in **Settings → General**.

The default install directory is `~/.dsh/plugins/dsh-next-suggestion`. Set `DSH_HOME` for the data directory, `DSH_PLUGINS_DIR` for the plugin directory, and `DSH_PROFILE` for the default profile. The `--profile` option takes precedence.

## Configuration

Open **Plugins → Next Suggestion → Config**, or edit the profile's `cordis.patch.yml`.

| Field | Default | Purpose |
| --- | --- | --- |
| `cacheTtlMs` | `1800000` | Cache lifetime in milliseconds |
| `cacheMaxEntries` | `200` | Cached session limit; reload the plugin after changing |
| `preferredReasoningEffort` | `high` | Model reasoning effort |
| `fallbackPollMs` | `30000` | Polling interval in milliseconds when session-state hooks are unavailable; restart DSH after changing |

## Update and uninstall

After updating the source, run the install command for your profile again. To uninstall:

```bash
./uninstall.sh --profile web
```

Uninstall removes the profile registration and link. The shared copy remains until its last consumer is removed. The source directory is preserved.

## Model and logs

Predictions use the model service configured for the session or profile and incur its model usage charges. Context is limited to 40 messages, 24,000 characters in total, and 4,000 characters per message.

Enable diagnostic logs when troubleshooting:

```bash
touch "${DSH_HOME:-$HOME/.dsh}/next-suggestion-debug"
tail -f "${DSH_HOME:-$HOME/.dsh}/logs/next-suggestion.log"
```

Logs may contain conversation text and use file mode `0600`. Disable logging afterwards:

```bash
rm "${DSH_HOME:-$HOME/.dsh}/next-suggestion-debug"
```

## Development

```bash
npm ci
npm test
```

Tests cover prediction, interaction, settings, and profile installation with simulated model streams.

The prompt is `SYSTEM_PROMPT` in [lib/prompt.js](../lib/prompt.js). Model requests and context assembly start in [lib/prediction.js](../lib/prediction.js).

MIT
