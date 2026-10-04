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
    subprocess.run(['xcrun', 'swiftc', '-O', '-module-cache-path', str(Path(tempfile.gettempdir()) / 'beam-swift-cache'), str(repo / 'scripts/macos/Beam.swift'), '-o', str(executable)], check=True)
    secure = contents / 'MacOS' / 'BeamSecureStore'
    subprocess.run(['xcrun', 'swiftc', '-O', '-module-cache-path', str(Path(tempfile.gettempdir()) / 'beam-swift-cache'), str(repo / 'scripts/macos/SecureStore.swift'), '-o', str(secure)], check=True)
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
    version = json.loads((repo / 'shared/version.json').read_text())['version']
    info = {'CFBundleName': 'Beam', 'CFBundleDisplayName': 'Beam', 'CFBundleIdentifier': 'local.beam.desktop', 'CFBundleExecutable': 'Beam', 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': version.split('-')[0], 'CFBundleVersion': '31', 'BeamVersion': version, 'CFBundleIconFile': 'Beam.icns', 'NSHighResolutionCapable': True, 'LSMinimumSystemVersion': '12.0', 'BeamRepository': str(repo), 'BeamNode': node}
    info['CFBundleURLTypes'] = [{'CFBundleURLName': 'local.beam.invitation', 'CFBundleURLSchemes': ['beam']}]
    if args.portable:
        runtime = contents / 'Resources' / 'runtime'
        runtime.mkdir()
        for name in ['server', 'shared', 'dist', 'node_modules']:
            shutil.copytree(repo / name, runtime / name, symlinks=True)
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
