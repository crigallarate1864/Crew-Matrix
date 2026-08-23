from pathlib import Path

# Validation marker: 2026-08-23-safe-rerun
js = Path('atlas/js/atlas-app.js').read_text(encoding='utf-8')
cfg = Path('atlas/js/config.js').read_text(encoding='utf-8')
admin = Path('admin.html').read_text(encoding='utf-8')
ro = Path('ro.html').read_text(encoding='utf-8')

checks = {
    'single preferredSecondariDayCount': js.count('function preferredSecondariDayCount(') == 1,
    'single ordinarySecondariPreferredEmployee': js.count('function ordinarySecondariPreferredEmployee(') == 1,
    'single monthly quota validation const': js.count('const preferredSeEmployee=ordinarySecondariPreferredEmployee();') == 1,
    'single structural GRS scheduler': js.count('function scheduleGrsResponsibility(') == 1,
    'GRS scheduled independently': 'added+=scheduleGrsResponsibility();' in js,
    'GRS before 118': js.find('added+=scheduleGrsResponsibility();') < js.find("updateGeneration(32,'Copertura prioritaria equipaggi 118…');"),
    'no automatic Raschi MGSE fallback': 'raschiEmergency' not in js and 'removeAutoGrsForRaschi' not in js,
    'monthly quota defaults': 'sePreferredMinDays: 0' in cfg and 'sePreferredMaxDays: 31' in cfg,
    'monthly quota shared keys': "'sePreferredMinDays'" in js and "'sePreferredMaxDays'" in js,
    'admin quota fields unique': admin.count('id="setSePreferredMinDays"') == 1 and admin.count('id="setSePreferredMaxDays"') == 1,
    'RO quota fields unique': ro.count('id="setSePreferredMinDays"') == 1 and ro.count('id="setSePreferredMaxDays"') == 1,
    'daily MGSE stays 2/2': 'seMin:2' in js and 'seMax:2' in js and 'seTarget:2' in js,
    'preferred max enforced': 'preferredDays>=preferredMax' in js,
    'preferred minimum enforced': 'preferredDays<preferredMin' in js,
    'GRS identity robust': "slug(e.cognome)==='raschi'" in js,
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('FAILED CHECKS: ' + ', '.join(failed))

print('All ATLAS GRS/monthly-MGSE structural checks passed')
