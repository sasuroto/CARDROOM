// ESPN uses both position and type for officials' roles. Never pick the first
// official when the role is absent: that could be an assistant or VAR.
export function espnOfficials(officials:any[] = []) {
 const role=(o:any)=>String(o.position?.displayName||o.position?.name||o.position||o.type?.text||o.type?.name||o.type||'').trim().toLowerCase();
 const name=(o:any)=>o?.displayName||o?.fullName||[o?.firstName,o?.lastName].filter(Boolean).join(' ')||null;
 const find=(roles:string[])=>name(officials.find(o=>roles.includes(role(o))));
 return {referee:find(['referee','head referee','main referee']),var:find(['var','video assistant referee']),avar:find(['avar','assistant video assistant referee']),fourthOfficial:find(['fourth official','fourth referee']),assistants:officials.filter(o=>['assistant referee','assistant referee 1','assistant referee 2','linesman'].includes(role(o))).map(name).filter(Boolean)};
}
