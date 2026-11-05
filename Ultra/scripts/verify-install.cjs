const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const profile = 'C:/Users/Logan/.dsh/profiles/desktop';
const backup = fs.readFileSync(path.join(root, '.cache/ultra-desktop-backup-path.txt'), 'utf8');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const before = read(path.join(backup, 'package.json'));
const after = read(path.join(profile, 'package.json'));
const targets = new Set(['dsh-ultra', 'thinking-level']);
for (const [name, value] of Object.entries(before.dependencies)) if (!targets.has(name)) assert.equal(after.dependencies[name], value);
assert.deepEqual(after.dsh.profile.bundles.filter(name => !targets.has(name)), before.dsh.profile.bundles.filter(name => !targets.has(name)));
assert(after.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-auto-review'));
assert(fs.readFileSync(path.join(backup, 'cordis.patch.yml')).equals(fs.readFileSync(path.join(profile, 'cordis.patch.yml'))));
const installed = {};
for (const [name, source, files] of [['dsh-ultra', 'Ultra', ['lib/host.js', 'lib/client.js']], ['thinking-level', 'ReasoningSlider', ['lib/index.js', 'lib/client.js']]]) {
  const directory = path.join(profile, 'node_modules', name), manifest = read(path.join(directory, 'package.json'));
  assert.equal(manifest.version, read(path.join(root, source, 'package.json')).version);
  assert(after.dsh.profile.bundles.includes(name));
  for (const file of files) assert(fs.readFileSync(path.join(directory, file)).equals(fs.readFileSync(path.join(root, source, file))));
  for (const excluded of ['demo', 'debug', 'tests']) assert(!fs.existsSync(path.join(directory, excluded)));
  installed[name] = manifest.version;
}
const result = { installed, originalDependenciesPreserved: true, originalBundlesPreserved: true, autoReviewPreserved: true, profilePatchPreserved: true, installedCodeMatchesSource: true, testFixturesExcluded: true, backup };
fs.writeFileSync(path.join(root, 'Ultra/verification/installation.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
