#!/usr/bin/env node
/*
 * Сводит результаты tools/calc-balance.js в одну таблицу.
 *   node tools/calc-balance-report.js --dir . --prefix bd_
 * По умолчанию берёт все bd_*.json из текущей папки. Путь --dir считается от текущей папки.
 */
const fs = require('fs');
const path = require('path');

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const dir = path.resolve(arg('--dir', '.'));
const prefix = arg('--prefix', 'bd_');
const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
if (!files.length) {
  console.error('В ' + dir + ' нет файлов с префиксом ' + prefix);
  process.exit(1);
}

const rows = files.map(file => {
  const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const p = (d.best && d.best.state && d.best.state.parts) || {};
  const r = (d.best && d.best.state && d.best.state.resources) || {};
  return {
    file, estate: d.estate || '', objective: d.objective || '', score: d.best ? d.best.score : '',
    gold: r.zoloto, slava: r.slava, krest: r.krestyane,
    choiceGold: p.choiceGold, choiceSlava: p.choiceSlava, choiceIncome: p.choiceIncome,
    peasantIncome: p.peasantIncome, buildIncome: p.buildIncome, buildSlava: p.buildSlava,
    buildSpent: p.buildSpent, check: d.goldCheck,
    buildings: d.best ? Object.keys(d.best.state.buildings).join(', ') : ''
  };
});

const cols = ['file', 'estate', 'objective', 'score', 'gold', 'slava', 'krest',
  'choiceGold', 'choiceSlava', 'choiceIncome', 'peasantIncome', 'buildIncome', 'buildSlava', 'buildSpent', 'check'];
console.log('| ' + cols.join(' | ') + ' |');
console.log('|' + cols.map(() => '---:').join('|') + '|');
for (const r of rows) console.log('| ' + cols.map(c => r[c] === undefined ? '' : r[c]).join(' | ') + ' |');
console.log('\nКупленные постройки:');
for (const r of rows) console.log('  ' + r.file + ': ' + (r.buildings || '—'));
