"""Renders the MickleCade app icon (tools/icon.svg) to the PNGs the site uses, with headless Chrome.

Usage: python make_icon.py <out_dir> [svg] [chrome.exe]
Each size is rendered from the SVG directly, so small sizes stay sharp.
"""
import os, subprocess, sys, tempfile, pathlib

HERE = pathlib.Path(__file__).resolve().parent
CHROMES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
]
SIZES = [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (48, 'favicon-48.png')]


def render(chrome, svg, size, out):
    page = tempfile.NamedTemporaryFile('w', suffix='.html', delete=False)
    page.write('<!doctype html><style>html,body{margin:0;overflow:hidden}img{display:block}</style>'
               f'<img src="{svg.as_uri()}" width="{size}" height="{size}">')
    page.close()
    try:
        subprocess.run([chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                        f'--window-size={size},{size}', f'--screenshot={out}', pathlib.Path(page.name).as_uri()],
                       check=True, capture_output=True)
    finally:
        os.unlink(page.name)


if __name__ == '__main__':
    out = pathlib.Path(sys.argv[1]).resolve()
    svg = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else HERE / 'icon.svg').resolve()
    chrome = sys.argv[3] if len(sys.argv) > 3 else next(c for c in CHROMES if os.path.exists(c))
    for size, name in SIZES:
        render(chrome, svg, size, str(out / name))
        print('wrote', name)
