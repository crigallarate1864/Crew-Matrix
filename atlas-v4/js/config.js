const slug = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export const MATRIX_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT_MRh_aPQIklbT_xylHbbWWKhrMXziOja_kbrCmrAiMsZc2owJjsgMTXnC_UEzwMW4Lo0AK2wCF8Fy/pub?gid=0&single=true&output=csv';
export const DATABASE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT_MRh_aPQIklbT_xylHbbWWKhrMXziOja_kbrCmrAiMsZc2owJjsgMTXnC_UEzwMW4Lo0AK2wCF8Fy/pub?gid=1385788341&single=true&output=csv';
export const FALLBACK_EMPLOYEES = [
    ['Bellanti','Melany','A',0,0,1,0,0,0,''],['Brundo','Mattia','A',1,1,1,0,0,0,''],['Buscetta','Marzia','A',1,1,1,0,0,0,''],
    ['Cisternino','Sara','A',1,1,1,0,0,0,''],['Costa','Nicolò','A',1,1,1,0,0,0,''],['Galli','Monica','A',0,1,1,0,0,0,''],
    ['Galvan','Patrizia','A',1,1,1,1,0,0,''],['Ghelli','Alberto','A',1,1,1,0,0,0,''],['Ghirardi','Danilo','A',1,1,1,0,0,0,'Autoparco'],
    ['Funes','Carlos','A',1,1,1,0,0,0,''],['Leva','Stefano','A',1,1,1,0,0,1,''],['Marangoni','Alice','A',1,1,1,0,0,0,''],
    ['Marchetto','Stefano','A',1,1,1,1,1,0,''],['Spurio','Giuseppe','A',1,1,1,0,0,0,''],['Turrina','Silvia','A',1,1,1,1,0,0,''],
    ['Ben Hmida','Samir','B',0,1,1,0,0,0,''],['Bianchi','Andrea','B',1,1,1,0,0,0,''],['Buzzanca','Grazia','B',1,1,1,0,0,0,''],
    ['Calamia','Azzurra','B',1,1,1,0,0,0,''],['Finessi','Elisa','B',1,1,1,0,0,0,''],['Martignoni','Luca','B',1,1,1,0,0,0,'Magazzino'],
    ['Paracchini','Claudio','B',1,1,1,0,0,0,'Autoparco'],['Quadrelli','Roberta','B',1,1,1,0,0,0,''],['Rampinini','Ernesto','B',1,1,1,0,0,0,''],
    ['Scalise','Sara','B',1,1,1,0,0,0,''],['Shima','Geldi','B',1,1,1,0,0,0,''],['Tagliabue','Manuela','B',1,1,1,0,0,0,''],
    ['Tariq','Naira','B',1,1,1,0,0,0,''],['Bosetti','Danilo','RO',1,1,1,0,0,0,'Operativo'],['Molinari','Alisia','Libera',0,1,1,0,0,0,''],
    ['Borsotti','Vanessa','Libera',0,0,1,0,0,0,''],['Raschi','Carlo','RS',1,1,1,0,0,0,'Secondari'],
    ['Praderio','Maria Luisa','Amministrazione',0,0,0,0,0,0,''],['Vescera','Celestina','Amministrazione',0,0,0,0,0,0,'']
  ].map(r => ({
    id: slug(`${r[0]}-${r[1]}`), cognome:r[0], nome:r[1], turno:r[2], autista:!!r[3], capo:!!r[4], soccorritore:!!r[5],
    l104:!!r[6], avis:!!r[7], congedo:!!r[8], responsabile:r[9], sedeSolo:r[0]==='Galli'?'G':'', attivo:true, sesso:'', oreSettimanali:null, oreMensili:null
  }));
export const DEFAULT_SETTINGS = {
    targetHours: 167.2,
    minRest: 11,
    seMin: 1,
    seMax: 2,
    seTarget: 2,
    respMin: 4,
    respGoal: 5,
    matrixCsvUrl: MATRIX_CSV_URL,
    databaseCsvUrl: DATABASE_CSV_URL,
    appsScriptUrl: '',
    autoAdmin: true,
    autoResponsabili: true,
    autoSecondari: true,
    useABRotation: true,
    allowRoAuto: false
  };
export const STORAGE_KEY = 'atlas-118-turnazione-release-v4';
export const LEGACY_STORAGE_KEYS = ['atlas-118-turnazione-release-v3','atlas-118-turnazione-release-v2','atlas-118-turnazione-release-v1','atlas-118-turnazione-v15','atlas-118-turnazione-v14','atlas-118-turnazione-v13','atlas-118-turnazione-v12','atlas-118-turnazione-v11','atlas-118-turnazione-v10','atlas-118-turnazione-v9','atlas-118-turnazione-v8','atlas-118-turnazione-v7','atlas-118-turnazione-v6','aegis-118-turnazione-v6'];
export const APP_VERSION = 4;
export const COMPATIBLE_STORAGE_VERSIONS = new Set([1,2,3,4,6,7,8,9,10,11,12,13,14,15]);
export const PROTECTED_STORAGE_KEY = 'atlas-118-assenze-permanenti-v1';
export const AUTH_SESSION_KEY = 'atlas-118-user-session-release-v1';
export const AUTH_USERS = Object.freeze({
    'bosetti.danilo': {
      username:'bosetti.danilo',
      passwordHash:'5090f2606a3f554918e1b40034e463a9aeb3413b6090675f84a7d4f76b040229',
      displayName:'Danilo Bosetti',
      initials:'DB',
      role:'Responsabile Operativo'
    },
    'admin': {
      username:'Admin',
      passwordHash:'57f54e340ed69d630da3fd610f4e6afb1e4ba6f474b9f7358999d9f2ae67b286',
      displayName:'Admin',
      initials:'AD',
      role:'Amministratore'
    }
  });
export const DOW = ['dom','lun','mar','mer','gio','ven','sab'];
export const MONTHS = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
export const CREW_SLOTS = [
    {crew:'G2',site:'G',machine:'2',role:'A'}, {crew:'G2',site:'G',machine:'2',role:'C'},
    {crew:'G3',site:'G',machine:'3',role:'A'}, {crew:'G3',site:'G',machine:'3',role:'C'}, {crew:'G3',site:'G',machine:'3',role:'S'},
    {crew:'Somma',site:'S',machine:'3',role:'A'}, {crew:'Somma',site:'S',machine:'3',role:'C'}, {crew:'Somma',site:'S',machine:'3',role:'S'},
    {crew:'Sumirago',site:'SU',machine:'3',role:'A'}, {crew:'Sumirago',site:'SU',machine:'3',role:'C'}, {crew:'Sumirago',site:'SU',machine:'3',role:'S'}
  ];
export const ORDINARY_CREW_SLOTS = CREW_SLOTS.filter(slot => slot.crew!=='Sumirago');
export const crewSlotsForDayShift = (day,shift) => {
    const d = day instanceof Date ? day : new Date(`${day}T00:00:00`);

    // Sabato mattina: Gallarate macchina a 2, Gallarate macchina a 3 e Somma.
    if(d.getDay()===6 && shift==='M'){
      return ORDINARY_CREW_SLOTS.filter(slot => ['G2','G3','Somma'].includes(slot.crew));
    }

    // Sabato pomeriggio: Gallarate macchina a 2 e Somma.
    if(d.getDay()===6 && shift==='P'){
      return ORDINARY_CREW_SLOTS.filter(slot => ['G2','Somma'].includes(slot.crew));
    }

    // Di notte le postazioni ordinarie sono sempre a 3.
    if(shift==='N'){
      return ORDINARY_CREW_SLOTS.filter(slot => slot.crew!=='G2');
    }

    return ORDINARY_CREW_SLOTS;
  };
