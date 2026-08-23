from pathlib import Path

for filename in ['admin.html','ro.html']:
    p=Path(filename)
    s=p.read_text(encoding='utf-8')
    old='''              <div class="field full"><div class="section-label">Quote mensili del dipendente prevalente · ADMIN</div></div>\n              <div class="field"><label>Minimo giornate MGSE nel mese</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 8" /></div>\n              <div class="field"><label>Massimo giornate MGSE nel mese</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 12" /></div>\n              <div class="field full"><div class="notice info"><strong>Quote del prevalente:</strong> l’Admin definisce quante giornate MGSE deve svolgere almeno e al massimo nel mese. Il 118 e i vincoli protetti restano prioritari. Nel profilo RO questi valori non sono modificabili.</div></div>'''
    new='''              <div class="field full"><div class="section-label">QUOTA MENSILE DEL DIPENDENTE PREVALENTE</div></div>\n              <div class="field"><label>Minimo MENSILE di giornate MGSE</label><input id="setSePreferredMinDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 8" /></div>\n              <div class="field"><label>Massimo MENSILE di giornate MGSE</label><input id="setSePreferredMaxDays" class="input" type="number" min="0" max="31" step="1" placeholder="es. 12" /></div>\n              <div class="field full"><div class="notice info"><strong>Questi due valori NON sono il minimo/massimo giornaliero.</strong> Si riferiscono esclusivamente al dipendente selezionato sopra come prevalente Secondari. Esempio: minimo 8 e massimo 12 significa che ATLAS proverà ad assegnargli tra 8 e 12 giornate MGSE nell’intero mese. Il 118, ferie, RC, riposi e gli altri vincoli protetti restano prioritari.</div></div>'''
    if old not in s:
        raise SystemExit(f'{filename}: monthly quota block not found')
    s=s.replace(old,new,1)
    s=s.replace('GRS-STRUCTURAL-QUOTA-2112','GRS-MONTHLY-QUOTA-2119')
    p.write_text(s,encoding='utf-8')
