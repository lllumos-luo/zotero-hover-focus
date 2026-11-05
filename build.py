"""Build a dependency-free Zotero XPI; includes only explicit runtime files."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
settings = manifest['applications']['zotero']
# Zotero's ExtensionData.parseManifest requires all three even for local builds.
for key in ['id', 'update_url', 'strict_max_version']:
    if not settings.get(key):
        raise ValueError(f'Missing required Zotero installation field: {key}')
if not settings['update_url'].startswith('https:'):
    raise ValueError('Zotero requires secure update metadata to keep the add-on enabled')
files = ['manifest.json', 'bootstrap.js', 'core.js', 'locales.js', 'ui.js', 'LICENSE', *set(manifest['icons'].values())]
for name in files:
    if not (root / name).is_file():
        raise FileNotFoundError(name)
out = root / 'dist'
out.mkdir(exist_ok=True)
artifact = out / f'hover-focus-{manifest["version"]}.xpi'
with zipfile.ZipFile(artifact, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
with zipfile.ZipFile(artifact) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(files)
    assert json.loads(archive.read('manifest.json')) == manifest
print(artifact)
digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
repository = manifest.get('homepage_url', '').rstrip('/')
if repository.startswith('https://github.com/'):
    updates = {'addons': {settings['id']: {'updates': [{
        'version': manifest['version'],
        'update_link': f"{repository}/releases/download/v{manifest['version']}/{artifact.name}",
        'update_hash': 'sha256:' + digest,
        'applications': {'zotero': {
            'strict_min_version': settings['strict_min_version'],
            'strict_max_version': settings['strict_max_version']
        }}
    }]}}}
    (root / 'updates.json').write_text(json.dumps(updates, indent=2) + '\n')
print('SHA256:', digest)
