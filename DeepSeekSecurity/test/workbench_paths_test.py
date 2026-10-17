"""Real filesystem regression tests; no model calls or production state writes."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'vendor/codex-security/scripts'))
import workbench_target as target


@unittest.skipUnless(os.name == 'nt', 'Windows extended-path regression')
class WindowsInventoryTests(unittest.TestCase):
    def setUp(self):
        cache = ROOT.parent / '.cache'
        cache.mkdir(exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix='security-paths-', dir=cache))
        self.repo = self.root / 'repo'
        self.repo.mkdir()

    def git(self, *args):
        result = target.git_command(self.repo, *args, text=True)
        result.check_returncode()
        return result.stdout

    def long_file(self, base=None):
        directory = base or self.repo
        while len(str(directory)) < 280:
            directory /= 'checkpoint-training-segment'
        target._filesystem_path(directory).mkdir(parents=True, exist_ok=True)
        file = directory / 'sample.py'
        target._filesystem_path(file).write_text('answer = 1\n', encoding='utf-8')
        return file

    def test_path_spellings(self):
        self.assertEqual(str(target._filesystem_path(Path(r'C:\repo\src'))), r'\\?\C:\repo\src')
        self.assertEqual(str(target._filesystem_path(Path(r'\\server\share\src'))), r'\\?\UNC\server\share\src')
        extended = Path(r'\\?\C:\repo\src')
        self.assertEqual(target._filesystem_path(extended), extended)
        with patch.object(target, '_WINDOWS', False):
            self.assertEqual(target._filesystem_path(self.repo), self.repo)

    def test_git_long_files_are_counted_and_hashed(self):
        self.git('init', '--quiet')
        self.git('-c', 'user.name=Local Test', '-c', 'user.email=test@invalid.local',
                 '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'fixture')
        file = self.long_file()
        self.assertIn(file, target.git_directory_snapshot_paths(self.repo))
        self.assertEqual(target.directory_snapshot_regular_file_count(self.repo), 1)
        before = target.directory_content_digest(self.repo)
        worktree_before = target.worktree_content_digest(self.repo)
        target._filesystem_path(file).write_text('answer = 2\n', encoding='utf-8')
        self.assertNotEqual(before, target.directory_content_digest(self.repo))
        self.assertNotEqual(worktree_before, target.worktree_content_digest(self.repo))
        # Index paths and scoped inventories must retain ordinary path identities.
        self.git('-c', 'core.longpaths=true', 'add', '--', '.')
        self.assertEqual(target.directory_snapshot_regular_file_count(self.repo), 1)
        scope = self.repo / file.relative_to(self.repo).parts[0]
        self.assertIn(file, target.git_directory_snapshot_paths(scope))

    def test_ignored_long_tree_does_not_change_inventory(self):
        self.git('init', '--quiet')
        (self.repo / '.gitignore').write_text('/generated/\n', encoding='utf-8')
        (self.repo / 'source.py').write_text('answer = 1\n', encoding='utf-8')
        before = target.directory_content_digest(self.repo)
        self.long_file(self.repo / 'generated')
        self.assertEqual(target.directory_snapshot_regular_file_count(self.repo), 2)
        self.assertEqual(before, target.directory_content_digest(self.repo))

    def test_plain_directory_long_files_are_counted_and_hashed(self):
        # Disable Git discovery: the fixture lives below the plugin checkout.
        file = self.long_file()
        with patch.object(target, 'git_directory_snapshot_paths', return_value=None):
            self.assertIn(file, target.source_directory_snapshot_paths(self.repo))
            self.assertEqual(target.directory_snapshot_regular_file_count(self.repo), 1)
            before = target.directory_content_digest(self.repo)
            target._filesystem_path(file).write_text('answer = 2\n', encoding='utf-8')
            self.assertNotEqual(before, target.directory_content_digest(self.repo))

    def test_junction_contents_are_not_followed(self):
        self.git('init', '--quiet')
        outside = self.root / 'outside'
        outside.mkdir()
        (outside / 'private.py').write_text('outside = True\n', encoding='utf-8')
        link = self.repo / 'linked'
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(outside)],
                       check=True, capture_output=True)
        paths = target.git_directory_snapshot_paths(self.repo)
        self.assertIn(link, paths)
        self.assertNotIn(link / 'private.py', paths)
        self.assertEqual(target.directory_snapshot_regular_file_count(self.repo), 0)
        before = target.directory_content_digest(self.repo)
        (outside / 'private.py').write_text('outside = False\n', encoding='utf-8')
        self.assertEqual(before, target.directory_content_digest(self.repo))


if __name__ == '__main__':
    unittest.main()
