"""Check exported PDFs after `npm run check`; requires pypdf."""
import json
import os
from pathlib import Path
from pypdf import PdfReader

project_id = os.environ.get('PROJECT', 'research-network')
project = json.loads(Path(f'projects/{project_id}/project.json').read_text())
labels = project['labels']
out = Path(f'output/verification/{project_id}')
for device in ('desktop', 'mobile'):
    path = Path(f'output/pdf/{project_id}-comparison-{device}.pdf')
    reader = PdfReader(path)
    assert len(reader.pages) == len(project['pages']), path
    for number, (page, source) in enumerate(zip(reader.pages, project['pages']), 1):
        assert abs(float(page.mediabox.width) - 1190.55) < 1
        assert abs(float(page.mediabox.height) - 841.89) < 1
        text = page.extract_text()
        for expected in (source['heading'], source['beforeNote'], source['afterNote']):
            assert ' '.join(expected.split()) in ' '.join(text.split()), (path, number, expected)
        assert f"BEFORE / {labels['before'].upper()}" in text
        assert f"AFTER / {labels['after'].upper()}" in text
        assert 'First-screen captures.' in text
        drawn_images = [args[0] for args, op in page.get_contents().operations if op == b'Do' and page['/Resources']['/XObject'][args[0]].get_object().get('/Subtype') == '/Image']
        assert len(drawn_images) == 2, (path, number, 'Expected paired screenshots')
        assert len(page.get('/Annots', [])) == 2, (path, number, 'Expected two source links')
    print(f'PASS: {device}: {len(reader.pages)} A3 landscape pages, paired images, original notes and source links')

edited = PdfReader(out / 'edited-notes.pdf')
assert 'Verified edit: a warmer welcome for members.' in edited.pages[0].extract_text()
notes = json.loads((out / 'storage-recovery.json').read_text())
assert notes['pages'][project['pages'][0]['id']]['afterNote'] == 'Unsaved recovery note'
print('PASS: edited text reached PDF; unavailable-storage recovery downloaded the unsaved note')
