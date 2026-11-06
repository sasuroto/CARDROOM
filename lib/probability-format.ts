export const percent=(n:number)=>!Number.isFinite(n)||n<0||n>1?'—':n>.99?'>99%':n<.01?'<1%':Math.round(n*100)+'%';
