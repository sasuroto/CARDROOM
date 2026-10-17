const flags:Record<string,{file:string;label:string}>={
 EN:{file:'gb-eng',label:'Флаг Англии'},
 EU:{file:'european_union',label:'Европейский флаг'},
 ES:{file:'es',label:'Флаг Испании'},
 IT:{file:'it',label:'Флаг Италии'},
 DE:{file:'de',label:'Флаг Германии'},
 FR:{file:'fr',label:'Флаг Франции'},
 TR:{file:'tr',label:'Флаг Турции'},
 PT:{file:'pt',label:'Флаг Португалии'},
};

export default function CountryFlag({code,className='code'}:{code:string;className?:string}){
 const flag=flags[code];
 return <span className={className+(flag?' countryFlag':'')}>
  {flag?<img src={'/flags/'+flag.file+'.svg'} alt={flag.label} width={32} height={32}/>:code}
 </span>;
}
