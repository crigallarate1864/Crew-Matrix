const slug = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export const ATLAS_SERVER_URL = 'https://script.google.com/macros/s/AKfycbwC6wNURko6ZZeK7yRW9yePVe-366JrH4BGQN38FY-HObBRWPK6FbBOeQmGJ37wSCXq/exec';
export const MATRIX_CSV_URL = '';
export const DATABASE_CSV_URL = '';
export const FALLBACK_EMPLOYEES = [];
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
    appsScriptUrl: ATLAS_SERVER_URL,
    autoAdmin: true,
    autoResponsabili: true,
    autoSecondari: true,
    useABRotation: true,
    allowRoAuto: false,
    weeklyStandardHours: 38,
    weeklyMinHours: 28,
    weeklyMaxHours: 44,
    weeklyAverageMax: 48,
    weeklyRestHours: 35,
    weeklyRestOccurrences14: 2,
    annualOvertimeLimit: 150,
    annualOvertimeExtended: 250,
    vacationAnnualHours: 190,
    suppressedHolidayAnnualHours: 26,
    personalPermitAnnualHours: 36,
    personalPermitRecoveryMonths: 2,
    holidayRecoveryDays: 30,
    bankHoursMinBlock: 4,
    patronHoliday: '',
    enforceNoSplitDay: true,
    autoCompensatoryRestDefault: false
  };
export const STORAGE_KEY = 'atlas-118-turnazione-production-v1-4-2';
export const LEGACY_STORAGE_KEYS = ['atlas-118-turnazione-production-v1-4-1','atlas-118-turnazione-production-v1-3-9','atlas-118-turnazione-production-v1-3-8','atlas-118-turnazione-production-v1-3-7','atlas-118-turnazione-production-v1-3-6','atlas-118-turnazione-production-v1-3-5','atlas-118-turnazione-production-v1-3-4','atlas-118-turnazione-production-v1-3-3','atlas-118-turnazione-production-v1-3-1','atlas-118-turnazione-production-v1-3','atlas-118-turnazione-production-v1-2','atlas-118-turnazione-production-v1-1','atlas-118-turnazione-production-v1','atlas-118-turnazione-release-v6','atlas-118-turnazione-release-v5','atlas-118-turnazione-release-v4','atlas-118-turnazione-release-v3','atlas-118-turnazione-release-v2','atlas-118-turnazione-release-v1','atlas-118-turnazione-v15','atlas-118-turnazione-v14','atlas-118-turnazione-v13','atlas-118-turnazione-v12','atlas-118-turnazione-v11','atlas-118-turnazione-v10','atlas-118-turnazione-v9','atlas-118-turnazione-v8','atlas-118-turnazione-v7','atlas-118-turnazione-v6','aegis-118-turnazione-v6'];
export const APP_VERSION = 142;
export const COMPATIBLE_STORAGE_VERSIONS = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,100,110,120,130,131,133,134,135,136,137,138,139,140,141,142]);
export const PROTECTED_STORAGE_KEY = 'atlas-118-assenze-permanenti-v1';
export const SERVER_SESSION_KEY = 'atlas-118-server-session-v1';
export const SERVER_URL_STORAGE_KEY = 'atlas-118-server-url-v1';


export const OPERATIONAL_SHIFT_CATALOG = Object.freeze({
  GM: {
    label:'Gallarate mattina',
    site:'G',
    shift:'M',
    start:'08:00',
    end:'14:00',
    hours:6,
    tag:'M'
  },
  GP: {
    label:'Gallarate pomeriggio',
    site:'G',
    shift:'P',
    start:'14:00',
    end:'20:00',
    hours:6,
    tag:'P'
  },
  GN: {
    label:'Gallarate notte',
    site:'G',
    shift:'N',
    start:'20:00',
    end:'08:00',
    hours:12,
    nextDay:true,
    night:true,
    tag:'N'
  },
  GG: {
    label:'Gallarate giornata',
    site:'G',
    shift:'G',
    start:'08:00',
    end:'20:00',
    hours:12,
    tag:'G'
  },
  GSA: {
    label:'Giornata Somma Lombardo · Autista',
    site:'S',
    role:'A',
    shift:'G',
    start:'08:00',
    end:'20:00',
    hours:12,
    tag:'G'
  },
  GSC: {
    label:'Giornata Somma Lombardo · Capo equipaggio',
    site:'S',
    role:'C',
    shift:'G',
    start:'08:00',
    end:'20:00',
    hours:12,
    tag:'G'
  },
  GSS: {
    label:'Giornata Somma Lombardo · Soccorritore',
    site:'S',
    role:'S',
    shift:'G',
    start:'08:00',
    end:'20:00',
    hours:12,
    tag:'G'
  },
  N: {
    label:'Notte',
    site:'',
    shift:'N',
    start:'20:00',
    end:'08:00',
    hours:12,
    nextDay:true,
    night:true,
    tag:'N'
  },
  NS: {
    label:'Notte Somma Lombardo',
    site:'S',
    shift:'N',
    start:'20:00',
    end:'08:00',
    hours:12,
    nextDay:true,
    night:true,
    tag:'N'
  }
});

export const operationalShiftMeta = code =>
  OPERATIONAL_SHIFT_CATALOG[String(code || '').trim().toUpperCase()] || null;

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
