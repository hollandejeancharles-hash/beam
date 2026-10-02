#!/usr/bin/env python3
"""Build the local Beam Mac app without changing system settings."""
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile

repo = Path(__file__).resolve().parents[2]
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js est requis pour ouvrir Beam.')
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else repo.parent / 'outputs' / 'Beam.app'
# Sign outside iCloud/File Provider folders, whose Finder metadata can race signing.
with tempfile.TemporaryDirectory(prefix='beam-mac-') as scratch:
    scratch = Path(scratch)
    app = scratch / 'Beam.app'
    contents = app / 'Contents'
    (contents / 'MacOS').mkdir(parents=True)
    (contents / 'Resources').mkdir()
    executable = contents / 'MacOS' / 'Beam'
    subprocess.run(['xcrun', 'swiftc', '-O', '-module-cache-path', str(Path(tempfile.gettempdir()) / 'beam-swift-cache'), str(repo / 'scripts/macos/Beam.swift'), '-o', str(executable)], check=True)
    iconset = scratch / 'Beam.iconset'
    iconset.mkdir()
    original = scratch / 'beam.png'
    subprocess.run([str(executable), '--render-icon', str(original)], check=True)
    for size in [16, 32, 128, 256, 512]:
        for scale in [1, 2]:
            filename = f'icon_{size}x{size}' + ('@2x' if scale == 2 else '') + '.png'
            subprocess.run(['sips', '-z', str(size * scale), str(size * scale), str(original), '--out', str(iconset / filename)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(contents / 'Resources' / 'Beam.icns')], check=True)
    info = {'CFBundleName': 'Beam', 'CFBundleDisplayName': 'Beam', 'CFBundleIdentifier': 'local.beam.desktop', 'CFBundleExecutable': 'Beam', 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': '2.0', 'CFBundleVersion': '2', 'CFBundleIconFile': 'Beam.icns', 'NSHighResolutionCapable': True, 'LSMinimumSystemVersion': '12.0', 'BeamRepository': str(repo), 'BeamNode': node}
    with (contents / 'Info.plist').open('wb') as f:
        plistlib.dump(info, f)
    subprocess.run(['codesign', '--force', '--sign', '-', str(app)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(app, output, dirs_exist_ok=True)
print(output)
