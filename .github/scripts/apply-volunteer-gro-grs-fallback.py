from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'atlas/js/atlas-app.js'
UI=ROOT/'atlas/js/volunteer-coverage.js'


def replace_once(text,old,new,label):
    if new in text:
        return text
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: attesa 1 occorrenza, trovate {count}')
    return text.replace(old,new,1)


app=APP.read_text(encoding='utf-8')

app=replace_once(
    app,
    '''          ?`Copertura trovata solo come fallback: ${responsibilityFallbacks.map(operation=>`${operation.coverName} ${operation.fallbackResponsibility} → 118`).join(' · ')}.`''',
    '''          ?`Copertura trovata solo come fallback: ${responsibilityFallbacks.map(operation=>
              operation.fallbackResponsibility
                ?`${operation.coverName} ${operation.fallbackResponsibility} → 118`
                :`${operation.replacementName} libera ${operation.replacementFallbackResponsibility} per prendere ${operation.sourceCode}`
            ).join(' · ')}.`''',
    'summary chain fallback',
)

APP.write_text(app,encoding='utf-8')

ui=UI.read_text(encoding='utf-8')

ui=replace_once(
    ui,
    '''        text:
          `${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)}; `+
          `${operation.replacementName||'Risorsa'} prende ${operation.sourceCode||'il turno liberato'}`
''',
    '''        text:
          `${operation.coverName||'Risorsa'} copre ${roleLabel(operation.role)}; `+
          `${operation.replacementName||'Risorsa'} prende ${operation.sourceCode||'il turno liberato'}`+
          (operation.replacementFallbackResponsibility
            ?` liberando ${operation.replacementFallbackResponsibility}`
            :'')
''',
    'approval report chain fallback',
)

ui=replace_once(
    ui,
    '''              `prende il suo turno `+
              `<strong>${esc(operation.sourceCode)}</strong>.`;''',
    '''              `prende il suo turno `+
              `<strong>${esc(operation.sourceCode)}</strong>`+
              (operation.replacementFallbackResponsibility
                ?` liberando <strong>${esc(operation.replacementFallbackResponsibility)}</strong>.`
                :'.');''',
    'solution preview chain fallback',
)

ui=replace_once(
    ui,
    '''              può subentrare
              <strong>${esc(detail.replacementName)}</strong>.''',
    '''              può subentrare
              <strong>${esc(detail.replacementName)}</strong>${detail.replacementFallbackResponsibility
                ?`, liberando <strong>${esc(detail.replacementFallbackResponsibility)}</strong>`
                :''}.''',
    'compat detail chain fallback',
)

ui=replace_once(
    ui,
    '''            ...changes.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} sulla richiesta; ${operation.replacementName} sul turno ${operation.sourceCode}`
            )''',
    '''            ...changes.map(operation=>
              `${roleLabel(operation.role)}: ${operation.coverName} sulla richiesta; ${operation.replacementName} sul turno ${operation.sourceCode}`+
              (operation.replacementFallbackResponsibility?` liberando ${operation.replacementFallbackResponsibility}`:'')
            )''',
    'apply confirmation chain fallback',
)

ui=replace_once(
    ui,
    '''                      `${operation.coverName} copre il buco; `+
                      `${operation.replacementName} prende ${operation.sourceCode}`''',
    '''                      `${operation.coverName} copre il buco; `+
                      `${operation.replacementName} prende ${operation.sourceCode}`+
                      (operation.replacementFallbackResponsibility
                        ?` liberando ${operation.replacementFallbackResponsibility}`
                        :'')''',
    'approval confirmation chain fallback',
)

UI.write_text(ui,encoding='utf-8')

# Controlli strutturali del comportamento richiesto.
checks={
  'solo GRO/GRS':"VOLUNTEER_RESPONSIBILITY_FALLBACK_TYPES=new Set(['GRO','GRS'])" in app,
  'secondo passaggio':'{allowResponsibilityFallback:true}' in app,
  'catena fallback':'replacementFallbackResponsibility' in app,
  'rimozione responsabilita':'replacementReleaseIds' in app,
  'ore nette':'releasedResponsibilityHours' in app,
  'controllo notte automatico':'manual:false' in app,
  'report UI':'replacementFallbackResponsibility' in ui,
}
missing=[name for name,ok in checks.items() if not ok]
if missing:
    raise SystemExit('Controlli finali falliti: '+', '.join(missing))

print('Report e UI fallback GRO/GRS completati.')
