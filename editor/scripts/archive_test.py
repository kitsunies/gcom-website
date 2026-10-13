import io
import json
import pathlib
import sqlite3
import tarfile
import tempfile
import unittest
from archive import backup, restore

class BackupTests(unittest.TestCase):
    def test_restore_preserves_sqlite_and_revision_portraits(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            data = root / 'original'
            (data / 'pb_data').mkdir(parents=True)
            with sqlite3.connect(data / 'pb_data' / 'data.db') as database:
                database.execute('CREATE TABLE profiles (name TEXT)')
                database.execute("INSERT INTO profiles VALUES ('Backup test')")
            revision = data / 'state' / 'revisions' / ('a' * 32)
            revision.mkdir(parents=True)
            (revision / 'portrait.webp').write_bytes(b'unchanged portrait')
            (revision / 'team.json').write_text(json.dumps({'revision':'a'*32,'members':[{'photo':f'team/{"a"*32}/portrait.webp'}]}))
            archive = root / 'backup.tar.gz'
            wal = data / 'pb_data' / 'data.db-wal'
            wal.write_bytes(b'uncheckpointed data')
            with self.assertRaises(ValueError): backup(data, archive)
            wal.unlink()
            backup(data, archive)
            restore(archive, root / 'restored')
            restored = root / 'restored' / 'data'
            with sqlite3.connect(restored / 'pb_data' / 'data.db') as database:
                self.assertEqual(database.execute('SELECT name FROM profiles').fetchone()[0], 'Backup test')
            self.assertEqual((restored / 'state' / 'revisions' / ('a'*32) / 'portrait.webp').read_bytes(), b'unchanged portrait')
            with self.assertRaises(ValueError): restore(archive, root / 'restored')

    def test_restore_rejects_traversal_and_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            for i, name in enumerate(['data/../../escape', '/data/escape', 'data/link']):
                archive = root / f'bad{i}.tar.gz'
                with tarfile.open(archive, 'w:gz') as output:
                    info = tarfile.TarInfo(name)
                    if name.endswith('link'): info.type=tarfile.SYMTYPE;info.linkname='/etc/passwd'
                    output.addfile(info, io.BytesIO())
                with self.assertRaises(ValueError): restore(archive,root / f'dest{i}')

if __name__ == '__main__': unittest.main()
