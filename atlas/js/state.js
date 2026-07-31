import { DEFAULT_SETTINGS, FALLBACK_EMPLOYEES } from './config.js';

const clone = value => structuredClone(value);

export const state = {
  month:'2026-09',
  employees:clone(FALLBACK_EMPLOYEES),
  assignments:{},
  requirements:{},
  monthPlans:{},
  settings:clone(DEFAULT_SETTINGS),
  activeCell:null,
  staffEditingId:null,
  validations:[],
  confirmAction:null,
  dbRecords:[],
  dbLoaded:false,
  matrixLoaded:false,
  localDirty:false,
  lastAutoSummary:null
};

export function resetStateToDefaults(){
  state.month='2026-09';
  state.employees=clone(FALLBACK_EMPLOYEES);
  state.assignments={};
  state.requirements={};
  state.monthPlans={};
  state.settings=clone(DEFAULT_SETTINGS);
  state.activeCell=null;
  state.staffEditingId=null;
  state.validations=[];
  state.confirmAction=null;
  state.dbRecords=[];
  state.dbLoaded=false;
  state.matrixLoaded=false;
  state.localDirty=false;
  state.lastAutoSummary=null;
}
