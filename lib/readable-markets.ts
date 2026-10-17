export function readableScenario(m:{metric:string;title:string;line:number},home:string,away:string){
 if(['result','double'].includes(m.metric))return m.title;
 if(m.metric==='btts')return m.title.endsWith(': да')?'Каждая команда забьёт хотя бы один гол':m.title.endsWith(': нет')?'Хотя бы одна команда останется без гола':m.title;
 if(!/^Т[БМ] /.test(m.title))return m.title.split(' · тотал ')[0];
 const over=m.title.startsWith('ТБ '),count=over?Math.floor(m.line)+1:Math.floor(m.line),range=over?`${count} и больше`:`Не больше ${count}`;
 if(['home','away'].includes(m.metric)){const name=m.metric==='home'?home:away;return count===1&&over?`${name} забьёт хотя бы один гол`:count===0&&!over?`${name} останется без гола`:`${name}: ${range.toLowerCase()} голов`;}
 const units:Record<string,string>={goals:'голов',corners:'угловых',yellow:'жёлтых карточек',red:'удалений',shots:'ударов',target:'ударов в створ',fouls:'нарушений',offsides:'офсайдов',saves:'спасений ворот'};
 if(m.metric==='red')return over?'В матче будет хотя бы одно удаление':'Матч без удалений';
 return `${range} ${units[m.metric]||m.metric} за матч`;
}
export function sampleText(n:number){return `${n} ${n%10===1&&n%100!==11?'матч':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'матча':'матчей'}`}
