const fs=require('node:fs'),assert=require('node:assert/strict');
const panel=fs.readFileSync(require.resolve('../app/selected-matches.tsx'),'utf8');
const today=fs.readFileSync(require.resolve('../app/today-matches.tsx'),'utf8');
assert.ok(panel.includes("match.state==='post'?'Имя не получено'"));
assert.ok(panel.includes("match.state==='post'?'Имя арбитра не получено из источника'"));
assert.ok(today.includes('live-счёт выбранных игр проверяется каждые 30 с, при ошибках — реже'));
assert.ok(!today.includes('каждую минуту'));
console.log('PASS completed missing-referee copy and consistent polling disclosure');
