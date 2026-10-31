#!/usr/bin/env python3
"""Назначение: установка и recovery UI из проверенного пакета того же выпуска.
Контур: root-only под lock worker; systemd/HTTP — внешние границы.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
import uuid
import zipfile


# Блок 1: Настройки принадлежат устройству, пакет не задаёт целевые пути.
def settings():
    env = {}
    path = Path(os.environ.get('TREED_UPDATE_ENV_FILE', '/etc/default/treed-update'))
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            key, separator, value = line.partition('=')
            if separator and re.fullmatch(r'TREED_[A-Z0-9_]+', key):
                parts = shlex.split(value)
                if len(parts) != 1:
                    raise ValueError('Некорректная настройка updater UI')
                env[key] = parts[0]
    env.update(os.environ)
    return env


def write_json(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write((json.dumps(value, ensure_ascii=False) + '\n').encode())
            handle.flush()
            os.fsync(handle.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def sync_directory(path):
    if os.name != 'nt':
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def runtime_path(env):
    home = Path(env.get('TREED_UPDATE_PI_HOME', '/home/pi'))
    path = Path(env.get('TREED_SHELL_RUNTIME_DIR', str(home / 'treed/treed-shell-runtime')))
    if (not path.is_absolute() or '..' in path.parts or path.name != 'treed-shell-runtime'
            or path.parent.name != 'treed' or path.is_symlink()):
        raise ValueError('Некорректный каталог UI')
    path.mkdir(parents=True, exist_ok=True)
    if path.resolve() != path.absolute():
        raise ValueError('Каталог UI проходит через символическую ссылку')
    return path


def operation(env, operation_id):
    if str(uuid.UUID(operation_id)) != operation_id.lower():
        raise ValueError('Некорректный идентификатор операции')
    state_file = Path(env.get('TREED_UPDATE_STATE_FILE', '/var/lib/treed-update/state.json'))
    state = json.loads(state_file.read_text(encoding='utf-8'))
    if (state.get('operationId') != operation_id or state.get('targetId') != 'printer-ui'
            or state.get('busy') is not True):
        raise ValueError('UI updater требует активную операцию worker')
    return state, state_file


def manifest_matches(path, tag):
    try:
        manifest = json.loads(path.read_text(encoding='utf-8'))
        return (isinstance(manifest, dict) and manifest.get('name') == 'treed-shell-ui' and manifest.get('mode') == 'live'
                and re.fullmatch(r'[0-9a-f]{40}', str(manifest.get('sha', ''))) is not None
                and tag == f"ui-main-{manifest['runNumber']}-{manifest['runAttempt']}")
    except (OSError, ValueError, KeyError, TypeError):
        return False


def assert_idle():
    with urlopen('http://127.0.0.1:7125/printer/objects/query?print_stats=state', timeout=5) as response:
        state = json.load(response)['result']['status']['print_stats']['state']
    if not isinstance(state, str) or state.strip().lower() not in {'standby', 'complete', 'cancelled', 'error'}:
        raise ValueError('Обновление UI запрещено при печати, паузе или неизвестном состоянии')


def restart(env):
    subprocess.run(['systemctl', 'restart', env.get('TREED_SHELL_SERVICE', 'treed-shell.service')],
                   check=True, timeout=30)


def owner(env):
    import pwd
    import grp
    user = env.get('TREED_UPDATE_PI_USER', 'pi')
    group = env.get('TREED_UPDATE_PI_GROUP', user)
    return pwd.getpwnam(user).pw_uid, grp.getgrnam(group).gr_gid


def ready(env):
    deadline = time.monotonic() + float(env.get('TREED_SHELL_START_TIMEOUT', '45'))
    consecutive = 0
    while time.monotonic() < deadline:
        try:
            active = subprocess.run(['systemctl', 'is-active', '--quiet',
                                     env.get('TREED_SHELL_SERVICE', 'treed-shell.service')],
                                    check=False, timeout=5).returncode == 0
            with urlopen(f"http://127.0.0.1:{int(env.get('TREED_SHELL_HTTP_PORT', '8787'))}/index.html",
                         timeout=2) as response:
                healthy = active and response.status == 200
        except (OSError, ValueError, subprocess.SubprocessError):
            healthy = False
        consecutive = consecutive + 1 if healthy else 0
        if consecutive >= 3:
            return True
        time.sleep(1)
    return False


# Блок 2: Извлечение данных UI; исполняемый код остаётся в private cache worker.
def extract(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        items = bundle.infolist()
        if (len(items) > 10000 or len({item.filename for item in items}) != len(items)
                or sum(item.file_size for item in items) > 512 * 1024 * 1024):
            raise ValueError('Некорректный размер или состав UI archive')
        for item in items:
            path = PurePosixPath(item.filename)
            if (not item.filename or not path.parts or ':' in path.parts[0]
                    or '\\' in item.filename or path.is_absolute()
                    or '..' in path.parts or stat.S_ISLNK(item.external_attr >> 16)):
                raise ValueError('Небезопасный путь в UI archive')
            if path.parts[0] == '.treed-update':
                continue
            target = destination.joinpath(*path.parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(item) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                    output.flush()
                    os.fsync(output.fileno())
        if not (destination / 'index.html').is_file():
            raise ValueError('В UI archive отсутствует index.html')
        for directory, _, _ in os.walk(destination, topdown=False):
            sync_directory(Path(directory))


def commit(env, runtime, journal, transaction):
    archive = Path(env['TREED_UPDATE_PACKAGE_FILE'])
    with tempfile.NamedTemporaryFile(dir=runtime, delete=False) as output, archive.open('rb') as source:
        temporary = Path(output.name)
        try:
            shutil.copyfileobj(source, output)
            if os.name != 'nt':
                os.fchmod(output.fileno(), 0o644)
                os.fchown(output.fileno(), *owner(env))
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    os.replace(temporary, runtime / 'treed-shell-ui.zip')
    sync_directory(runtime)
    transaction['stage'] = 'committed'
    write_json(journal, transaction)
    return {'status': 'applied', 'resultCode': 'ui_updated', 'message': 'Интерфейс TreeD обновлён.'}


# Блок 3: Один journal; backup сохраняется до подтверждённого восстановления.
def recover(env, operation_id):
    state, state_file = operation(env, operation_id)
    runtime = runtime_path(env)
    journal = state_file.parent / 'ui' / operation_id / 'journal.json'
    if not journal.exists():
        return apply(env, state['targetTag'], operation_id)
    transaction = json.loads(journal.read_text(encoding='utf-8'))
    if (transaction.get('operationId') != operation_id or transaction.get('targetTag') != state['targetTag']
            or transaction.get('schema') != 1):
        raise ValueError('Journal UI относится к другой операции')
    current = runtime / 'ui'
    rollback = runtime / f'ui.rollback.{operation_id}'
    if current.is_symlink() or rollback.is_symlink():
        raise ValueError('Небезопасный путь восстановления UI')
    if manifest_matches(current / 'treed-shell-ui-manifest.json', state['targetTag']) and ready(env):
        return commit(env, runtime, journal, transaction)
    if rollback.is_dir():
        assert_idle()
        restore = runtime / f'ui.restore.{operation_id}'
        if restore.is_symlink():
            raise ValueError('Каталог восстановления UI является ссылкой')
        if restore.exists():
            shutil.rmtree(restore)
        shutil.copytree(rollback, restore, symlinks=True)
        for directory, _, files in os.walk(restore, topdown=False):
            if any(path.is_symlink() for path in Path(directory).iterdir()):
                raise ValueError('Backup UI содержит символическую ссылку')
            for name in files:
                with (Path(directory) / name).open('r+b') as handle:
                    os.fsync(handle.fileno())
            sync_directory(Path(directory))
        if current.exists():
            shutil.rmtree(current)
        os.replace(restore, current)
        sync_directory(runtime)
        restart(env)
    if transaction.get('hadPrevious') and current.is_dir() and ready(env):
        transaction['stage'] = 'rolled_back'
        write_json(journal, transaction)
        return {'status': 'rolled_back', 'resultCode': 'rollback_succeeded',
                'message': 'Предыдущая версия интерфейса восстановлена.'}
    raise RuntimeError('Не подтверждено восстановление UI; journal и backup сохранены')


def apply(env, tag, operation_id):
    state, state_file = operation(env, operation_id)
    if (re.fullmatch(r'ui-main-[0-9]+-[0-9]+', tag) is None or state.get('targetTag') != tag
            or env.get('TREED_UPDATE_PACKAGE_TAG') != tag):
        raise ValueError('Тег UI не соответствует закреплённому пакету')
    archive = Path(env['TREED_UPDATE_PACKAGE_FILE'])
    if (archive.is_symlink() or not archive.is_file()
            or hashlib.sha256(archive.read_bytes()).hexdigest() != env.get('TREED_UPDATE_PACKAGE_SHA256')):
        raise ValueError('Закреплённый пакет UI повреждён')
    runtime = runtime_path(env)
    journal = state_file.parent / 'ui' / operation_id / 'journal.json'
    journal.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if journal.exists():
        return recover(env, operation_id)
    assert_idle()
    current, stage = runtime / 'ui', runtime / f'ui.new.{operation_id}'
    rollback = runtime / f'ui.rollback.{operation_id}'
    if any(path.is_symlink() for path in (current, stage, rollback, journal.parent)) or rollback.exists():
        raise ValueError('Каталоги публикации UI заняты или являются ссылкой')
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    extract(archive, stage)
    if not manifest_matches(stage / 'treed-shell-ui-manifest.json', tag):
        raise ValueError('Manifest UI не соответствует запрошенному live-выпуску')
    if os.name != 'nt':
        uid, gid = owner(env)
        for directory, _, files in os.walk(stage):
            os.chown(directory, uid, gid)
            for name in files:
                os.chown(Path(directory) / name, uid, gid)
    transaction = {'schema': 1, 'operationId': operation_id, 'targetTag': tag,
                   'stage': 'prepared', 'hadPrevious': current.is_dir()}
    write_json(journal, transaction)
    try:
        assert_idle()
        if current.exists():
            os.replace(current, rollback)
            sync_directory(runtime)
        os.replace(stage, current)
        sync_directory(runtime)
        transaction['stage'] = 'published'
        write_json(journal, transaction)
        restart(env)
        if not ready(env):
            raise RuntimeError('Новая версия UI не прошла проверку готовности')
        return commit(env, runtime, journal, transaction)
    except Exception:
        return recover(env, operation_id)


def main(argv):
    if os.geteuid() != 0:
        raise RuntimeError('UI updater требует root')
    env = settings()
    if len(argv) == 4 and argv[1] == 'apply':
        result = apply(env, argv[2], argv[3])
    elif len(argv) == 3 and argv[1] == 'recover':
        result = recover(env, argv[2])
    else:
        raise ValueError('usage: updater apply tag operationId | recover operationId')
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['status'] in {'applied', 'rolled_back'} else 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
