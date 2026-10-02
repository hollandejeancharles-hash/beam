#!/usr/bin/env python3
"""Build a local macOS Dock/menu bar launcher; no installation or settings changes."""
from pathlib import Path
import plistlib, shutil, subprocess, sys, tempfile
repo = Path(__file__).resolve().parents[2]
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js est requis pour ouvrir Beam.')
output = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else repo.parent/'outputs'/'Beam.app'
contents = output/'Contents'
(contents/'MacOS').mkdir(parents=True,exist_ok=True)
(contents/'Resources').mkdir(parents=True,exist_ok=True)
executable = contents/'MacOS'/'Beam'
subprocess.run(['xcrun','swiftc','-O','-module-cache-path',str(Path(tempfile.gettempdir())/'beam-swift-cache'),str(repo/'scripts/macos/Beam.swift'),'-o',str(executable)],check=True)
with tempfile.TemporaryDirectory(prefix='beam-icon-') as scratch:
    iconset = Path(scratch)/'Beam.iconset';iconset.mkdir()
    original = Path(scratch)/'beam.png'
    subprocess.run([str(executable),'--render-icon',str(original)],check=True)
    for size in [16,32,128,256,512]:
        for scale in [1,2]:
            filename = f'icon_{size}x{size}'+('@2x' if scale==2 else '')+'.png'
            subprocess.run(['sips','-z',str(size*scale),str(size*scale),str(original),'--out',str(iconset/filename)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['iconutil','-c','icns',str(iconset),'-o',str(contents/'Resources'/'Beam.icns')],check=True)
info = {'CFBundleName':'Beam','CFBundleDisplayName':'Beam','CFBundleIdentifier':'local.beam.launcher','CFBundleExecutable':'Beam','CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.0','CFBundleVersion':'1','CFBundleIconFile':'Beam.icns','NSHighResolutionCapable':True,'LSMinimumSystemVersion':'12.0','BeamRepository':str(repo),'BeamNode':node}
with (contents/'Info.plist').open('wb') as f: plistlib.dump(info,f)
for path in [output, *output.rglob('*')]:
    for attribute in ['com.apple.FinderInfo', 'com.apple.ResourceFork']:
        subprocess.run(['xattr','-d',attribute,str(path)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['codesign','--force','--sign','-',str(output)],check=True,stdout=subprocess.DEVNULL)
print(output)
