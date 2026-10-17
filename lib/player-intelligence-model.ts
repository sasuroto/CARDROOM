export type Evidence={text:string;source:string;scope?:string};
export type PlayerMetric={label:string;value:string|number;scope:string;source:string};
export type PlayerInsight={name:string;team:string;role:string;facts:Evidence[];metrics:PlayerMetric[];availability:Evidence;strength:{likelihood:string;text:string};weakness:{likelihood:string;text:string};reason:string;fan:Evidence & {date?:string;kind?:string};sources:string[]};
export type PlayerMatchResearch={matchId:string;title:string;checkedAt:string;players:PlayerInsight[];note?:string;fanDiscussion?: (Evidence & {date?:string;kind?:string})[]};
export type PlayerResearch={checkedAt:string;matches:PlayerMatchResearch[]};
export const normalizePlayer=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-zа-я0-9]/g,'');
export function researchLineupStatus(name:string,lineups:any[]|undefined){
 const player=lineups?.flatMap(t=>t.players||[]).find(p=>normalizePlayer(p.name)===normalizePlayer(name));
 if(player?.starter===true)return 'В стартовом составе ESPN';
 if(player?.starter===false)return 'Вне стартового состава ESPN';
 return 'Участие и старт пока не подтверждены';
}
