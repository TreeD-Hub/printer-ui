"""Офлайн-проверки настоящего UI updater: файлы, упаковка и recovery без служб."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/treed_ui_updater.py'
spec = importlib.util.spec_from_file_location('ui_updater', SOURCE)
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class Response(io.BytesIO):
    status = 200


class UiUpdaterTests(unittest.TestCase):
    def setUp(self):
        global updater
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.runtime = self.root / 'home/pi/treed/treed-shell-runtime'
        self.current = self.runtime / 'ui'
        self.current.mkdir(parents=True)
        (self.current / 'index.html').write_text('old', encoding='utf-8')
        (self.current / 'treed-shell-ui-manifest.json').write_text(json.dumps(self.manifest(1)))
        self.state_file = self.root / 'state/state.json'
        self.state_file.parent.mkdir()
        self.archive = self.root / 'package.zip'
        self.job = 'standby'
        self.new_healthy = True
        self.env = {'TREED_UPDATE_STATE_FILE': str(self.state_file),
                    'TREED_SHELL_RUNTIME_DIR': str(self.runtime),
                    'TREED_UPDATE_PACKAGE_FILE': str(self.archive), 'TREED_SHELL_START_TIMEOUT': '0.05'}
        self.prepare(2)
        cached = self.root / 'pinned-updater.py'
        with zipfile.ZipFile(self.archive) as bundle:
            cached.write_bytes(bundle.read('.treed-update/updater.py'))
        spec = importlib.util.spec_from_file_location('pinned_ui_updater', cached)
        updater = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(updater)
        self.stack = patch.object(updater, 'urlopen', side_effect=self.response)
        self.stack.start()
        self.addCleanup(self.stack.stop)
        self.commands = patch.object(updater.subprocess, 'run', side_effect=lambda command, **kw:
                                     subprocess.CompletedProcess(command, 0))
        self.command_mock = self.commands.start()
        self.addCleanup(self.commands.stop)
        sleep = patch.object(updater.time, 'sleep')
        sleep.start()
        self.addCleanup(sleep.stop)
        account = patch.object(updater, 'owner', return_value=(
            getattr(os, 'getuid', lambda: 0)(), getattr(os, 'getgid', lambda: 0)()))
        account.start()
        self.addCleanup(account.stop)

    def manifest(self, number):
        return {'name': 'treed-shell-ui', 'mode': 'live', 'sha': 'a' * 40,
                'runNumber': number, 'runAttempt': 1}

    def prepare(self, number, extra=None):
        self.operation = str(uuid.uuid4())
        self.tag = f'ui-main-{number}-1'
        self.state_file.write_text(json.dumps({'operationId': self.operation, 'targetId': 'printer-ui',
                                              'targetTag': self.tag, 'busy': True}), encoding='utf-8')
        with zipfile.ZipFile(self.archive, 'w') as bundle:
            bundle.writestr('index.html', f'new-{number}')
            bundle.writestr('treed-shell-ui-manifest.json', json.dumps(self.manifest(number)))
            bundle.writestr('.treed-update/updater.py', SOURCE.read_bytes())
            for name, data in (extra or {}).items():
                bundle.writestr(name, data)
        self.env.update(TREED_UPDATE_PACKAGE_TAG=self.tag,
                        TREED_UPDATE_PACKAGE_SHA256=hashlib.sha256(self.archive.read_bytes()).hexdigest())

    def response(self, url, **kwargs):
        if ':7125/' in url:
            return Response(json.dumps({'result': {'status': {'print_stats': {'state': self.job}}}}).encode())
        if (self.current / 'index.html').read_text(encoding='utf-8') != 'old' and not self.new_healthy:
            raise OSError('new UI is unhealthy')
        return Response(b'index')

    def test_package_builder_embeds_exact_updater_and_digest(self):
        output = self.root / 'dist'
        output.mkdir()
        manifest = output / 'treed-shell-ui-manifest.json'
        manifest.write_text(json.dumps(self.manifest(2)), encoding='utf-8')
        subprocess.check_call(['node', str(ROOT / 'scripts/add-ui-updater.mjs'), str(output)])
        meta = json.loads(manifest.read_text(encoding='utf-8'))['updater']
        code = output.joinpath(meta['entrypoint']).read_bytes()
        self.assertEqual(code, SOURCE.read_bytes())
        self.assertEqual(meta['sha256'], hashlib.sha256(code).hexdigest())
        self.assertIn('node scripts/add-ui-updater.mjs dist',
                      (ROOT / '.github/workflows/release-ui.yml').read_text(encoding='utf-8'))

    def test_update_next_update_and_committed_recovery(self):
        self.assertEqual(updater.apply(self.env, self.tag, self.operation)['status'], 'applied')
        self.assertEqual((self.current / 'index.html').read_text(), 'new-2')
        self.assertFalse((self.current / '.treed-update').exists())
        self.assertEqual(updater.recover(self.env, self.operation)['status'], 'applied')
        self.prepare(3)
        self.assertEqual(updater.apply(self.env, self.tag, self.operation)['status'], 'applied')
        self.assertEqual((self.current / 'index.html').read_text(), 'new-3')

    def test_unhealthy_candidate_restores_previous_files(self):
        self.new_healthy = False
        self.assertEqual(updater.apply(self.env, self.tag, self.operation)['status'], 'rolled_back')
        self.assertEqual((self.current / 'index.html').read_text(), 'old')
        self.assertEqual(updater.recover(self.env, self.operation)['status'], 'rolled_back')

    def test_power_loss_after_backup_recovers_without_installed_updater(self):
        replace = updater.os.replace

        def power_loss(source, destination):
            if Path(source).name.startswith('ui.new.') and Path(destination) == self.current:
                raise KeyboardInterrupt('power loss')
            return replace(source, destination)

        with patch.object(updater.os, 'replace', side_effect=power_loss), self.assertRaises(KeyboardInterrupt):
            updater.apply(self.env, self.tag, self.operation)
        self.assertFalse(self.current.exists())
        spec = importlib.util.spec_from_file_location('recovered_ui_updater', self.root / 'pinned-updater.py')
        recovered = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(recovered)
        with patch.object(recovered, 'urlopen', side_effect=self.response):
            self.assertEqual(recovered.recover(self.env, self.operation)['status'], 'rolled_back')
        self.assertEqual((self.current / 'index.html').read_text(), 'old')

    def test_recovery_before_journal_restarts_same_verified_package(self):
        self.assertEqual(updater.recover(self.env, self.operation)['status'], 'applied')
        self.assertEqual((self.current / 'index.html').read_text(), 'new-2')

    def test_no_runtime_changes_for_printing_paused_unknown_or_corrupt_package(self):
        for job in ('printing', 'paused', 'unknown', None):
            self.job = job
            with self.subTest(job=job), self.assertRaises(ValueError):
                updater.apply(self.env, self.tag, self.operation)
            self.assertEqual((self.current / 'index.html').read_text(), 'old')
        self.job = 'standby'
        self.archive.write_bytes(self.archive.read_bytes() + b'changed')
        with self.assertRaises(ValueError):
            updater.apply(self.env, self.tag, self.operation)
        self.command_mock.assert_not_called()

    def test_archive_paths_and_operation_identity_are_validated(self):
        self.prepare(2, {'../escaped.txt': 'outside'})
        with self.assertRaises(ValueError):
            updater.apply(self.env, self.tag, self.operation)
        self.assertFalse((self.root / 'escaped.txt').exists())
        self.assertEqual((self.current / 'index.html').read_text(), 'old')
        with self.assertRaises(ValueError):
            updater.apply(self.env, self.tag, str(uuid.uuid4()))


if __name__ == '__main__':
    unittest.main()
