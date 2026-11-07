// Experimental league-level goal models. No DOT thresholds or market selection.
// Dixon & Coles (1997), JRSS C 46(2), doi:10.1111/1467-9876.00065.
export const EXACT_VERSION='cardroom-11/1';
export const MODEL_VERSIONS={poisson:'poisson-league-mle/1',dc:'dixon-coles-joint-mle/1',baseline:'historical-11-frequency/1'};
export const POLICY={minMatches:100,minTeamMatches:8,minVenueMatches:2,windowDays:365,maxAgeDays:30,maxTeams:40,maxIterations:500,tolerance:1e-5};
export type GoalGame={key:string;league:string;homeId:string;awayId:string;home:string;away:string;kickoff:string;availableAt:string;source:string;homeGoals:number;awayGoals:number};
export type GoalFit={status:'ok';version:string;teams:string[];parameters:number[];rho:number;iterations:number;gradient:number;n:number;homeAdvantage:number;strengths:Record<string,{attack:number;defence:number}>}|{status:'unavailable';reason:string};
export function tau(x:number,y:number,l:number,m:number,rho:number){
 return x===0&&y===0?1-l*m*rho:x===0&&y===1?1+l*rho:x===1&&y===0?1+m*rho:x===1&&y===1?1-rho:1;
}
export function probability11(l:number,m:number,rho=0):number|null{
 if(![l,m,rho].every(Number.isFinite)||l<=0||m<=0||[tau(0,0,l,m,rho),tau(0,1,l,m,rho),tau(1,0,l,m,rho),tau(1,1,l,m,rho)].some(t=>t<=0))return null;
 const p=Math.exp(-l-m)*l*m*(1-rho);return Number.isFinite(p)&&p>0&&p<1?p:null;
}
const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
const fail=(reason:string):GoalFit=>({status:'unavailable',reason});
function designIdentifiable(rows:{h:number;a:number}[],n:number){
 const size=2*n,gram=Array.from({length:size},()=>Array(size).fill(0));
 for(const r of rows)for(const home of [true,false]){
  const attack=home?r.h:r.a,defence=home?r.a:r.h,x=Array(size).fill(0);x[0]=1;x[1]=Number(home);
  for(let i=0;i<n-1;i++){x[2+i]=Number(attack===i)-Number(attack===n-1);x[n+1+i]=Number(defence===i)-Number(defence===n-1)}
  for(let i=0;i<size;i++)for(let j=0;j<size;j++)gram[i][j]+=x[i]*x[j]/rows.length;
 }
 for(let col=0;col<size;col++){
  let pivot=col;for(let row=col+1;row<size;row++)if(Math.abs(gram[row][col])>Math.abs(gram[pivot][col]))pivot=row;
  if(Math.abs(gram[pivot][col])<1e-9)return false;
  [gram[col],gram[pivot]]=[gram[pivot],gram[col]];
  for(let row=col+1;row<size;row++){const k=gram[row][col]/gram[col][col];for(let j=col;j<size;j++)gram[row][j]-=k*gram[col][j];}
 }return true;
}
function effects(p:number[],n:number){
 const a=p.slice(2,n+1),d=p.slice(n+1,2*n);a.push(-a.reduce((s,x)=>s+x,0));d.push(-d.reduce((s,x)=>s+x,0));return {a,d};
}
function rates(p:number[],n:number,h:number,a:number){const e=effects(p,n);return [Math.exp(p[0]+p[1]+e.a[h]+e.d[a]),Math.exp(p[0]+e.a[a]+e.d[h])];}
// Analytic gradients, sum-to-zero attack AND defence constraints; joint DC likelihood.
function objective(p:number[],rows:{h:number;a:number;x:number;y:number}[],n:number,dc:boolean){
 const e=effects(p,n),rho=dc?p[2*n]:0,g=Array(p.length).fill(0),ga=Array(n).fill(0),gd=Array(n).fill(0);let loss=0;
 if(p.some(x=>!Number.isFinite(x)||Math.abs(x)>20))return {loss:Infinity,g};
 // All possible pairings must define a nonnegative score distribution, not just training pairs.
 if(dc)for(let h=0;h<n;h++)for(let a=0;a<n;a++)if(h!==a){const l=Math.exp(p[0]+p[1]+e.a[h]+e.d[a]),m=Math.exp(p[0]+e.a[a]+e.d[h]);if([1-l*m*rho,1+l*rho,1+m*rho,1-rho].some(t=>t<=1e-8))return {loss:Infinity,g};}
 for(const r of rows){
  const lh=p[0]+p[1]+e.a[r.h]+e.d[r.a],la=p[0]+e.a[r.a]+e.d[r.h],l=Math.exp(lh),m=Math.exp(la),t=tau(r.x,r.y,l,m,rho);
  if(!Number.isFinite(l+m)||t<=0)return {loss:Infinity,g};
  loss+=l-r.x*lh+m-r.y*la-Math.log(t);let dl=l-r.x,dm=m-r.y;
  if(dc){let tl=0,tm=0,tr=0;
   if(r.x===0&&r.y===0){tl=-l*m*rho;tm=tl;tr=-l*m}
   else if(r.x===0&&r.y===1){tl=l*rho;tr=l}
   else if(r.x===1&&r.y===0){tm=m*rho;tr=m}
   else if(r.x===1&&r.y===1)tr=-1;
   dl-=tl/t;dm-=tm/t;g[2*n]-=tr/t;
  }
  g[0]+=dl+dm;g[1]+=dl;ga[r.h]+=dl;ga[r.a]+=dm;gd[r.a]+=dl;gd[r.h]+=dm;
 }
 for(let i=0;i<n-1;i++){g[2+i]=ga[i]-ga[n-1];g[n+1+i]=gd[i]-gd[n-1]}
 return {loss:loss/rows.length,g:g.map(x=>x/rows.length)};
}
export function fitGoals(games:GoalGame[],dc=false,initial?:GoalFit,maxIterations=POLICY.maxIterations):GoalFit{
 if(games.length<POLICY.minMatches)return fail(`Нужно ≥${POLICY.minMatches} подтверждённых матчей лиги; доступно ${games.length}.`);
 if(games.some(r=>r.homeId===r.awayId||!r.homeId||!r.awayId||![r.homeGoals,r.awayGoals].every(x=>Number.isInteger(x)&&x>=0&&x<=30)))return fail('Некорректная история голов или идентификация команд.');
 const teams=[...new Set(games.flatMap(r=>[r.homeId,r.awayId]))].sort(),n=teams.length;
 if(n<4||n>POLICY.maxTeams)return fail(`Недопустимое число команд: ${n}.`);
 const rows=games.map(r=>({h:teams.indexOf(r.homeId),a:teams.indexOf(r.awayId),x:r.homeGoals,y:r.awayGoals}));
 if(dc&&!rows.some(r=>r.x<=1&&r.y<=1))return fail('Нет низких счетов для идентификации поправки Диксона–Колза.');
 for(let i=0;i<n;i++)if(rows.reduce((s,r)=>s+(r.h===i?r.y:r.a===i?r.x:0),0)===0)return fail(`Команда ${teams[i]}: нет пропущенных голов, конечная MLE защиты не определена.`);
 for(let i=0;i<n;i++){const home=rows.filter(r=>r.h===i),away=rows.filter(r=>r.a===i),all=[...home,...away];if(all.length<POLICY.minTeamMatches||Math.min(home.length,away.length)<POLICY.minVenueMatches)return fail(`Команда ${teams[i]}: ${all.length} игр (${home.length} дома / ${away.length} в гостях); нужно ≥8 и ≥2 на каждом поле.`);if(home.reduce((s,r)=>s+r.x,0)+away.reduce((s,r)=>s+r.y,0)===0)return fail(`Команда ${teams[i]}: нет забитых голов, конечная MLE не определена.`);}
 const connected=new Set([0]);for(let k=0;k<n;k++)for(const r of rows)if(connected.has(r.h)||connected.has(r.a)){connected.add(r.h);connected.add(r.a)}
 if(connected.size!==n)return fail('История лиги несвязная: силы команд несопоставимы.');
 if(!designIdentifiable(rows,n))return fail('История не позволяет раздельно идентифицировать атаку, защиту и домашнее поле (неполный ранг).');
 const avgH=rows.reduce((s,r)=>s+r.x,0)/rows.length,avgA=rows.reduce((s,r)=>s+r.y,0)/rows.length;
 if(!avgH||!avgA)return fail('Нет голов для оценки домашнего преимущества.');
 let p=initial?.status==='ok'&&initial.teams.join('|')===teams.join('|')?initial.parameters.slice(0,2*n):[Math.log(avgA),Math.log(avgH/avgA),...Array(2*n-2).fill(0)];if(dc)p.push(0);
 const size=p.length,identity=()=>Array.from({length:size},(_,i)=>Array.from({length:size},(_,j)=>Number(i===j)));
 let H=identity(),v=objective(p,rows,n,dc),iteration=0;
 for(;iteration<maxIterations;iteration++){
  if(Math.max(...v.g.map(Math.abs))<POLICY.tolerance)break;
  let direction=H.map(row=>-dot(row,v.g));if(dot(direction,v.g)>=0){H=identity();direction=v.g.map(x=>-x)}
  let step=1,next=objective(p,rows,n,dc),q=p;
  for(let bt=0;bt<35;bt++){q=p.map((x,i)=>x+step*direction[i]);next=objective(q,rows,n,dc);if(Number.isFinite(next.loss)&&next.loss<=v.loss+1e-4*step*dot(v.g,direction))break;step*=.5;}
  if(!Number.isFinite(next.loss)||next.loss>v.loss+1e-4*step*dot(v.g,direction))return fail('Обучение не сошлось: поиск шага MLE.');
  const s=q.map((x,i)=>x-p[i]),y=next.g.map((x,i)=>x-v.g[i]),ys=dot(y,s);
  if(ys>1e-12){const hy=H.map(row=>dot(row,y)),factor=(ys+dot(y,hy))/(ys*ys);H=H.map((row,i)=>row.map((x,j)=>x+factor*s[i]*s[j]-(hy[i]*s[j]+s[i]*hy[j])/ys));}else H=identity();
  p=q;v=next;
 }
 const gradient=Math.max(...v.g.map(Math.abs));if(gradient>=POLICY.tolerance||!Number.isFinite(v.loss))return fail('Обучение не сошлось за допустимое число итераций.');
 const e=effects(p,n);return {status:'ok',version:dc?MODEL_VERSIONS.dc:MODEL_VERSIONS.poisson,teams,parameters:p,rho:dc?p[2*n]:0,iterations:iteration,gradient,n:games.length,homeAdvantage:Math.exp(p[1]),strengths:Object.fromEntries(teams.map((t,i)=>[t,{attack:Math.exp(e.a[i]),defence:Math.exp(e.d[i])}]))};
}
export function predict11(fit:GoalFit,homeId:string,awayId:string){
 if(fit.status!=='ok')return {status:'unavailable' as const,reason:fit.reason,probability:null};
 const h=fit.teams.indexOf(homeId),a=fit.teams.indexOf(awayId);if(h<0||a<0||h===a)return {status:'unavailable' as const,reason:'Команда отсутствует в обучающей истории.',probability:null};
 const [lambdaHome,lambdaAway]=rates(fit.parameters,fit.teams.length,h,a),probability=probability11(lambdaHome,lambdaAway,fit.rho);
 return probability===null?{status:'unavailable' as const,reason:'Недопустимая оценка распределения.',probability:null}:{status:'ok' as const,version:fit.version,probability,lambdaHome,lambdaAway,rho:fit.rho,homeAdvantage:fit.homeAdvantage,homeStrength:fit.strengths[homeId],awayStrength:fit.strengths[awayId],iterations:fit.iterations,gradient:fit.gradient};
}
