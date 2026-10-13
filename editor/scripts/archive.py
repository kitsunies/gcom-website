#!/usr/bin/env python3
"""Offline consistent backup and safe restore into a new directory."""
import json
import pathlib
import sqlite3
import sys
import tarfile


def check(root):
    db = root / 'pb_data' / 'data.db'
    if not db.is_file():
        raise ValueError('PocketBase data.db missing')
    for path in (root / 'pb_data').glob('*.db'):
        wal = pathlib.Path(str(path) + '-wal')
        if wal.exists() and wal.stat().st_size:
            raise ValueError('Stop PocketBase cleanly before backup: nonempty SQLite WAL remains')
        with sqlite3.connect(f'file:{path}?mode=ro&immutable=1', uri=True) as connection:
            if connection.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError(f'Invalid SQLite backup: {path.name}')
    for manifest in (root / 'state' / 'revisions').glob('*/team.json'):
        value = json.loads(manifest.read_text())
        if value.get('revision') != manifest.parent.name or not isinstance(value.get('members'), list):
            raise ValueError('Invalid revision manifest')
        for member in value['members']:
            if member.get('photo'):
                name = pathlib.PurePosixPath(member['photo'])
                if name.parts[:2] != ('team', value['revision']) or len(name.parts) != 3 or not (manifest.parent / name.name).is_file():
                    raise ValueError('Revision portrait missing')


def backup(source, archive):
    check(source)
    if archive.exists():
        raise ValueError('Backup already exists')
    with tarfile.open(archive, 'x:gz') as output:
        output.add(source, arcname='data')


def restore(archive, destination):
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Restore requires an empty new directory')
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        for member in members:
            path = pathlib.PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != 'data' or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe backup path or file type')
        source.extractall(destination, members=members, filter='data')
    check(destination / 'data')


if __name__ == '__main__':
    action, source, target = sys.argv[1:]
    if action == 'backup':
        backup(pathlib.Path(source).resolve(), pathlib.Path(target).resolve())
    elif action == 'restore':
        restore(pathlib.Path(source).resolve(), pathlib.Path(target).resolve())
    else:
        raise ValueError('Use backup or restore')
