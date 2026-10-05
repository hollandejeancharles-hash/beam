#!/usr/bin/env python3
"""Build the local Beam Mac app without changing system settings."""
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import argparse
import json
import os
import socket
import time
import urllib.request

repo = Path(__file__).resolve().parents[2]
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js est requis pour ouvrir Beam.')
parser = argparse.ArgumentParser()
parser.add_argument('output', nargs='?')
parser.add_argument('--portable', action='store_true')
parser.add_argument('--with-model', action='store_true')
args = parser.parse_args()
output = Path(args.output).resolve() if args.output else repo.parent / 'outputs' / (('Beam-Full-AppleSilicon.dmg' if args.with_model else 'Beam-AppleSilicon.dmg') if args.portable else 'Beam.app')
if args.portable:
    subprocess.run(['npm', 'run', 'build'], cwd=repo, check=True)

# Sign outside iCloud/File Provider folders, whose Finder metadata can race signing.
with tempfile.TemporaryDirectory(prefix='beam-mac-') as scratch:
    scratch = Path(scratch)
    app = scratch / 'Beam.app'
    contents = app / 'Contents'
    (contents / 'MacOS').mkdir(parents=True)
    (contents / 'Resources').mkdir()
    executable = contents / 'MacOS' / 'Beam'
    source = scratch / 'main.swift'
    source.write_text((repo / 'scripts/macos/BeamUpdater.swift').read_text() + '\n' + (repo / 'scripts/macos/Beam.swift').read_text())
    subprocess.run(['xcrun', 'swiftc', '-target', 'arm64-apple-macos14.0', '-O', '-module-cache-path', str(Path(tempfile.gettempdir()) / 'beam-swift-cache'), str(source), '-o', str(executable)], check=True)
    secure = contents / 'MacOS' / 'BeamSecureStore'
    subprocess.run(['xcrun', 'swiftc', '-target', 'arm64-apple-macos14.0', '-O', '-module-cache-path', str(Path(tempfile.gettempdir()) / 'beam-swift-cache'), str(repo / 'scripts/macos/SecureStore.swift'), '-o', str(secure)], check=True)
    subprocess.run(['codesign', '--force', '--sign', '-', str(secure)], check=True)
    iconset = scratch / 'Beam.iconset'
    iconset.mkdir()
    original = scratch / 'beam.png'
    subprocess.run([str(executable), '--render-icon', str(original)], check=True)
    for size in [16, 32, 128, 256, 512]:
        for scale in [1, 2]:
            filename = f'icon_{size}x{size}' + ('@2x' if scale == 2 else '') + '.png'
            subprocess.run(['sips', '-z', str(size * scale), str(size * scale), str(original), '--out', str(iconset / filename)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(contents / 'Resources' / 'Beam.icns')], check=True)
    shutil.copy2(repo / 'scripts/macos/install-update.mjs', contents / 'Resources' / 'install-update.mjs')
    version = json.loads((repo / 'shared/version.json').read_text())['version']
    info = {'CFBundleName': 'Beam', 'CFBundleDisplayName': 'Beam', 'CFBundleIdentifier': 'local.beam.desktop', 'CFBundleExecutable': 'Beam', 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': version.split('-')[0], 'CFBundleVersion': '44', 'BeamVersion': version, 'CFBundleIconFile': 'Beam.icns', 'NSHighResolutionCapable': True, 'LSMinimumSystemVersion': '14.0', 'BeamRepository': str(repo), 'BeamNode': node}
    info['CFBundleURLTypes'] = [{'CFBundleURLName': 'local.beam.invitation', 'CFBundleURLSchemes': ['beam']}]
    if args.portable:
        runtime = contents / 'Resources' / 'runtime'
        runtime.mkdir()
        for name in ['server', 'shared', 'dist', 'node_modules']:
            shutil.copytree(repo / name, runtime / name, symlinks=True)
        (runtime / 'scripts').mkdir()
        shutil.copy2(repo / 'scripts/public-roadmap.js', runtime / 'scripts/public-roadmap.js')
        shutil.copy2(repo / 'package.json', runtime / 'package.json')
        shutil.copy2(node, contents / 'Resources' / 'node')
        ai = contents / 'Resources' / 'ai'
        shutil.copytree(repo / 'data/ai/runtime', ai / 'runtime', symlinks=True)
        if args.with_model:
            shutil.copytree(repo / 'data/ai/models', ai / 'models', symlinks=True)
        # Deliberately exclude every user DB, note, credential, profile and source.
        info['BeamPortable'] = True
        info.pop('BeamRepository', None); info.pop('BeamNode', None)
        info['CFBundleIdentifier'] = 'app.beam.desktop'
        info['LSMinimumSystemVersion'] = '14.0'
    with (contents / 'Info.plist').open('wb') as f:
        plistlib.dump(info, f)
    subprocess.run(['codesign', '--force', '--sign', '-', str(app)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    if args.portable:
        # Test the shipped runtime in a clean directory, never against user data.
        with tempfile.TemporaryDirectory(prefix='beam-package-test-') as testdir:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
            token = 'package-test-' + os.urandom(24).hex()
            env = {**os.environ, 'NODE_ENV': 'production', 'HOST': '127.0.0.1', 'PORT': str(port), 'BEAM_DESKTOP': '1', 'BEAM_ADMIN_TOKEN': token, 'BEAM_ASSETS': str(runtime / 'dist'), 'BEAM_DB': str(Path(testdir) / 'data/beam.sqlite')}
            log = Path(testdir) / 'server.log'
            with log.open('wb') as stream:
                process = subprocess.Popen([str(contents / 'Resources/node'), str(runtime / 'server/index.js')], cwd=testdir, env=env, stdout=stream, stderr=stream)
                try:
                    ready = False
                    for attempt in range(80):
                        if process.poll() is not None:
                            break
                        try:
                            request = urllib.request.Request(f'http://127.0.0.1:{port}/api/admin/product', headers={'Authorization': 'Bearer ' + token})
                            with urllib.request.urlopen(request, timeout=1) as response:
                                payload = json.load(response)
                                ready = response.status == 200 and isinstance(payload.get('name'), str)
                            if ready:
                                break
                        except (OSError, ValueError):
                            time.sleep(0.1)
                    if not ready:
                        raise SystemExit('Le serveur du paquet Mac ne démarre pas :\n' + log.read_text())
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=2) as response:
                        if response.status != 200 or b'<html' not in response.read():
                            raise SystemExit('Interface absente du paquet Mac.')
                    print('Paquet Mac : serveur et interface vérifiés avec des données temporaires.')
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait()
    for binary in [executable, secure]:
        report = subprocess.check_output(['xcrun', 'vtool', '-show-build', str(binary)], text=True)
        minimums = [line.split()[-1] for line in report.splitlines() if line.strip().startswith('minos ')]
        if not minimums or any(tuple(map(int, v.split('.'))) > (14, 0) for v in minimums):
            raise SystemExit('Le binaire exige un macOS plus récent que macOS 14 : ' + str(binary))
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.portable and output.suffix == '.dmg':
        disk = scratch / 'disk'
        disk.mkdir()
        shutil.move(str(app), disk / 'Beam.app')
        (disk / 'Applications').symlink_to('/Applications')
        shutil.copy2(repo / 'docs/installation-mac.md', disk / 'LIRE AVANT INSTALLATION.md')
        subprocess.run(['hdiutil', 'create', '-volname', 'Beam', '-srcfolder', str(disk), '-format', 'UDZO', '-ov', str(output)], check=True)
        print(output)
        sys.exit(0)

    if output.exists():
        shutil.rmtree(output)
    shutil.copytree(app, output, symlinks=True)
    # Remove only signing-incompatible Finder metadata from the generated app.
    for attempt in range(3):
        for attribute in ['com.apple.FinderInfo', 'com.apple.ResourceFork']:
            subprocess.run(['xattr', '-dr', attribute, str(output)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        verified = subprocess.run(['codesign', '--verify', '--deep', '--strict', str(output)], capture_output=True, text=True)
        if verified.returncode == 0:
            break
    else:
        raise SystemExit(verified.stderr)
print(output)
