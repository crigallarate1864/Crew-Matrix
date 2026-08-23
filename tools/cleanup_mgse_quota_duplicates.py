from pathlib import Path
block='''              <div class="field"><label>Giornate MGSE minime · prevalente</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" /></div>\n              <div class="field"><label>Giornate MGSE massime · prevalente</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" /></div>\n              <div class="field full"><small>Le quote mensili min/max sono modificabili dall’Admin; per il RO sono in sola lettura.</small></div>\n'''
for name in ('admin.html','ro.html'):
    p=Path(name); s=p.read_text(encoding='utf-8')
    while s.count(block)>1:
        first=s.find(block); second=s.find(block,first+len(block)); s=s[:second]+s[second+len(block):]
    if s.count('id="setSePreferredMinDays"')!=1 or s.count('id="setSePreferredMaxDays"')!=1:
        raise SystemExit(f'{name}: unexpected quota field count')
    p.write_text(s,encoding='utf-8')
