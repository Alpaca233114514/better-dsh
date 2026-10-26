#!/usr/bin/env bash
# Install dsh-next-suggestion into a DeepSeek Harness profile.
#
# Usage:
#   ./install.sh [--profile <name>]
#
# The profile selects which client half matters to you:
#   desktop — the Electron app; managed exclusively by the app, so this
#             script (or the in-app plugin manager) is the way to install.
#   web / tui / headless / … — CLI-managed profiles. The official way is
#             `dsh plugin --profile <name> add .`; this
#             script also works for a local checkout (it performs the same
#             registration the CLI would).
#
# Idempotent: re-running refreshes the plugin copy and re-registers the
# dependencies/bundles entries without duplicating them.

set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
DSH_PROFILE="${DSH_PROFILE:-desktop}"
DSH_PLUGINS_DIR="${DSH_PLUGINS_DIR:-$DSH_HOME/plugins}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      [[ $# -ge 2 ]] || { echo "dsh-next-suggestion: --profile requires a value" >&2; exit 1; }
      DSH_PROFILE="$2"
      shift 2
      ;;
    --profile=*)
      DSH_PROFILE="${1#--profile=}"
      shift
      ;;
    -h|--help)
      sed -n '2,15p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "dsh-next-suggestion: unknown argument '$1' (expected --profile <name>)" >&2
      exit 1
      ;;
  esac
done

if [[ ! "$DSH_PROFILE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo "dsh-next-suggestion: invalid profile name '$DSH_PROFILE'" >&2
  exit 1
fi

PROFILE_DIR="$DSH_HOME/profiles/$DSH_PROFILE"
PLUGIN_DIR="$DSH_PLUGINS_DIR"
TARGET="$PLUGIN_DIR/dsh-next-suggestion"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -L "$TARGET" ]]; then
  echo "dsh-next-suggestion: '$TARGET' is a symlink; remove it before installing" >&2
  exit 1
fi

if [[ ! -f "$PROFILE_DIR/package.json" ]]; then
  echo "dsh-next-suggestion: profile package.json not found at '$PROFILE_DIR/package.json'" >&2
  if [[ "$DSH_PROFILE" == "desktop" ]]; then
    echo "dsh-next-suggestion: start the desktop app once so it creates the profile, then retry" >&2
  else
    echo "dsh-next-suggestion: boot the profile once to create it (dsh --profile $DSH_PROFILE …), or check DSH_HOME ('$DSH_HOME')" >&2
  fi
  exit 1
fi

# Resolve aliases before rsync --delete: the target must not contain the source.
TARGET="$(python3 - "$TARGET" "$REPO_DIR" <<'PYTHON'
import os, sys
target, source = map(os.path.realpath, sys.argv[1:])
if target != source and os.path.commonpath([target, source]) == target:
    sys.exit("dsh-next-suggestion: install target contains the source repository")
print(target)
PYTHON
)"
LINK="$PROFILE_DIR/node_modules/dsh-next-suggestion"
if [[ -e "$LINK" && ! -L "$LINK" ]]; then
  echo "dsh-next-suggestion: '$LINK' is not a symlink; remove the existing package with its package manager first" >&2
  exit 1
fi

if [[ "$REPO_DIR" == "$TARGET" ]]; then
  echo "dsh-next-suggestion: source directory is already the install target; skipping copy"
else
  mkdir -p "$TARGET"
  rsync -a --delete \
    --include '/package.json' \
    --include '/index.js' \
    --include '/client.js' \
    --include '/cordis.patch.yml' \
    --include '/icon.svg' \
    --include '/README.md' \
    --include '/LICENSE' \
    --include '/install.sh' \
    --include '/uninstall.sh' \
    --include '/docs/' \
    --include '/docs/*.md' \
    --include '/lib/' \
    --include '/lib/*.js' \
    --include '/locale/' \
    --include '/locale/*.json' \
    --exclude '*' \
    "$REPO_DIR"/ "$TARGET"/
  echo "dsh-next-suggestion: copied to '$TARGET'"
fi

mkdir -p "$PROFILE_DIR/node_modules"
ln -sfn "$TARGET" "$PROFILE_DIR/node_modules/dsh-next-suggestion"
echo "dsh-next-suggestion: linked into '$PROFILE_DIR/node_modules/dsh-next-suggestion'"

TARGET="$TARGET" PROFILE_DIR="$PROFILE_DIR" python3 - <<'PY'
import json
import os

profile_dir = os.environ["PROFILE_DIR"]
target = os.environ["TARGET"]
package_path = os.path.join(profile_dir, "package.json")

with open(package_path, "r", encoding="utf-8") as handle:
    package = json.load(handle)

changed = False

dependencies = package.setdefault("dependencies", {})
if dependencies.get("dsh-next-suggestion") != "link:" + target:
    dependencies["dsh-next-suggestion"] = "link:" + target
    changed = True

bundles = package.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
if "dsh-next-suggestion" not in bundles:
    bundles.append("dsh-next-suggestion")
    changed = True

if changed:
    with open(package_path, "w", encoding="utf-8") as handle:
        json.dump(package, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("dsh-next-suggestion: registered in profile package.json")
else:
    print("dsh-next-suggestion: profile package.json already up to date")
PY

cat <<MSG

dsh-next-suggestion installed into the '$DSH_PROFILE' profile.

Next steps:
  1. Restart DeepSeek Harness (or re-boot the '$DSH_PROFILE' profile).
  2. Desktop/web: the feature is on by default; toggle it in
     设置 → 通用设置 → 显示预测消息.
  3. CLI (typert): the prediction service is registered as typed
     invocations (nextSuggestion/getConfig, predict, updateConfig).
  4. Diagnostics: touch "$DSH_HOME/next-suggestion-debug"
     then watch "$DSH_HOME/logs/next-suggestion.log" (rm the flag file to stop).

Tip: for any CLI-managed profile you can also install from this repository with
  dsh plugin --profile $DSH_PROFILE add .

MSG
