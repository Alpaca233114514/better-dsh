#!/usr/bin/env bash
# Uninstall dsh-next-suggestion from a DeepSeek Harness profile.
#
# Usage:
#   ./uninstall.sh [--profile <name>]
#
# Removes the profile registration, the node_modules link, and the plugin
# copy. The source repository this script lives in is never touched.

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
      sed -n '2,8p' "${BASH_SOURCE[0]}"
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

if [[ -f "$PROFILE_DIR/package.json" ]]; then
  PROFILE_DIR="$PROFILE_DIR" python3 - <<'PY'
import json
import os

profile_dir = os.environ["PROFILE_DIR"]
package_path = os.path.join(profile_dir, "package.json")

with open(package_path, "r", encoding="utf-8") as handle:
    package = json.load(handle)

changed = False

dependencies = package.get("dependencies")
if isinstance(dependencies, dict) and "dsh-next-suggestion" in dependencies:
    del dependencies["dsh-next-suggestion"]
    changed = True

profile = package.get("dsh", {}).get("profile")
if isinstance(profile, dict) and isinstance(profile.get("bundles"), list):
    bundles = [bundle for bundle in profile["bundles"] if bundle != "dsh-next-suggestion"]
    if len(bundles) != len(profile["bundles"]):
        profile["bundles"] = bundles
        changed = True

if changed:
    with open(package_path, "w", encoding="utf-8") as handle:
        json.dump(package, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("dsh-next-suggestion: removed from profile package.json")
else:
    print("dsh-next-suggestion: profile package.json already clean")
PY
else
  echo "dsh-next-suggestion: no profile package.json at '$PROFILE_DIR/package.json'; skipping registration cleanup"
fi

DSH_HOME="$DSH_HOME" PROFILE_DIR="$PROFILE_DIR" TARGET="$TARGET" REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" python3 - <<'PY'
import json
import os
import shutil
from pathlib import Path

target = Path(os.environ["TARGET"])
link = Path(os.environ["PROFILE_DIR"]) / "node_modules/dsh-next-suggestion"
if link.is_symlink() and link.resolve() == target.resolve():
    link.unlink()

# The copy is shared by profiles. Remove it only after its last consumer.
for profile in (Path(os.environ["DSH_HOME"]) / "profiles").glob("*"):
    other_link = profile / "node_modules/dsh-next-suggestion"
    package_path = profile / "package.json"
    if other_link.is_symlink() and other_link.resolve() == target.resolve():
        print("dsh-next-suggestion: kept shared copy for " + profile.name)
        break
    if package_path.is_file():
        package = json.loads(package_path.read_text())
        dependency = package.get("dependencies", {}).get("dsh-next-suggestion", "")
        if dependency.startswith("link:") and (profile / dependency[5:]).resolve() == target.resolve():
            print("dsh-next-suggestion: kept shared copy for " + profile.name)
            break
else:
    source = Path(os.environ["REPO_DIR"]).resolve()
    if source == target.resolve() or target.resolve() in source.parents:
        print("dsh-next-suggestion: kept source repository at " + str(target))
    elif target.is_symlink():
        target.unlink()
    elif target.exists():
        shutil.rmtree(target)
        print("dsh-next-suggestion: removed plugin copy at " + str(target))
PY
echo
echo "Restart DeepSeek Harness (or re-boot the '$DSH_PROFILE' profile) to finish the uninstall."
