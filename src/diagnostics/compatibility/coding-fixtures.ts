export type EvalCase = { id: string; objective: string; initial: string; hiddenTests: string };

export const cases: EvalCase[] = [
  {
    id: 'pagination',
    objective: 'Fix paginate so it returns the final partial page and returns [] for invalid page sizes. Keep the exported signature unchanged.',
    initial: `export function paginate<T>(items: T[], pageSize: number): T[][] {\n  const pages: T[][] = [];\n  for (let i = 0; i + pageSize < items.length; i += pageSize) {\n    pages.push(items.slice(i, i + pageSize));\n  }\n  return pages;\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { paginate } from './solution.js';\nassert.deepEqual(paginate([1,2,3,4,5], 2), [[1,2],[3,4],[5]]);\nassert.deepEqual(paginate([1,2,3,4], 2), [[1,2],[3,4]]);\nassert.deepEqual(paginate([], 2), []);\nassert.deepEqual(paginate([1,2], 0), []);\nassert.deepEqual(paginate([1,2], -1), []);\n`,
  },
  {
    id: 'dedupe',
    objective: 'Fix uniqueById so the last record for each id wins while preserving the order of each id’s first appearance. Do not mutate input.',
    initial: `export type RecordValue = { id: string; value: number };\nexport function uniqueById(items: RecordValue[]): RecordValue[] {\n  return [...new Map(items.map(item => [item.id, item])).values()].reverse();\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { uniqueById } from './solution.js';\nconst input = [{id:'a',value:1},{id:'b',value:2},{id:'a',value:3},{id:'c',value:4},{id:'b',value:5}];\nassert.deepEqual(uniqueById(input), [{id:'a',value:3},{id:'b',value:5},{id:'c',value:4}]);\nassert.deepEqual(input, [{id:'a',value:1},{id:'b',value:2},{id:'a',value:3},{id:'c',value:4},{id:'b',value:5}]);\nassert.deepEqual(uniqueById([]), []);\n`,
  },
  {
    id: 'index-by-key',
    objective: 'Fix indexByKey so it returns a null-prototype object, keeps the last value for duplicate keys, and safely supports keys such as __proto__. Do not mutate input.',
    initial: `export function indexByKey(items: Array<{key:string; value:number}>): Record<string, number> {\n  return Object.fromEntries(items.map(item => [item.key, item.value]));\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { indexByKey } from './solution.js';\nconst input=[{key:'a',value:1},{key:'__proto__',value:2},{key:'a',value:3}];\nconst result=indexByKey(input);\nassert.equal(Object.getPrototypeOf(result),null);\nassert.equal(result.a,3);\nassert.equal(result.__proto__,2);\nassert.deepEqual(input,[{key:'a',value:1},{key:'__proto__',value:2},{key:'a',value:3}]);\n`,
  },
  {
    id: 'parse-port',
    objective: 'Fix parsePort so it accepts only a complete base-10 integer string from 1 through 65535 after trimming, otherwise returns undefined.',
    initial: `export function parsePort(value: string): number | undefined {\n  const port = parseInt(value, 10);\n  return port > 0 ? port : undefined;\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { parsePort } from './solution.js';\nassert.equal(parsePort(' 443 '),443);\nfor (const value of ['0','65536','12px','1.5','','  ','+80','-2']) assert.equal(parsePort(value),undefined);\nassert.equal(parsePort('65535'),65535);\n`,
  },
  {
    id: 'merge-settings',
    objective: 'Fix mergeSettings so undefined override fields keep defaults, explicit false and zero are preserved, and neither input object is mutated.',
    initial: `export type Settings={enabled:boolean; retries:number; label:string};\nexport function mergeSettings(defaults: Settings, override: Partial<Settings>): Settings {\n  return {\n    enabled: override.enabled || defaults.enabled,\n    retries: override.retries || defaults.retries,\n    label: override.label || defaults.label,\n  };\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { mergeSettings } from './solution.js';\nconst defaults={enabled:true,retries:3,label:'base'};\nconst override={enabled:false,retries:0,label:undefined};\nassert.deepEqual(mergeSettings(defaults,override),{enabled:false,retries:0,label:'base'});\nassert.deepEqual(defaults,{enabled:true,retries:3,label:'base'});\nassert.deepEqual(override,{enabled:false,retries:0,label:undefined});\n`,
  },
  {
    id: 'stable-sort',
    objective: 'Fix sortByScore so it returns a new array sorted by descending score, preserving input order for ties, without mutating input.',
    initial: `export type Entry={name:string; score:number};\nexport function sortByScore(items: Entry[]): Entry[] {\n  return items.sort((a,b)=>a.score-b.score);\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { sortByScore } from './solution.js';\nconst input=[{name:'a',score:2},{name:'b',score:5},{name:'c',score:5},{name:'d',score:1}];\nassert.deepEqual(sortByScore(input),[{name:'b',score:5},{name:'c',score:5},{name:'a',score:2},{name:'d',score:1}]);\nassert.deepEqual(input,[{name:'a',score:2},{name:'b',score:5},{name:'c',score:5},{name:'d',score:1}]);\n`,
  },
  {
    id: 'range',
    objective: 'Fix range so it returns values from start inclusive to end exclusive for positive or negative non-zero steps, and returns [] for zero or a step pointing away from end.',
    initial: `export function range(start:number,end:number,step=1):number[]{\n  const result:number[]=[];\n  for(let value=start;value<=end;value+=step) result.push(value);\n  return result;\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { range } from './solution.js';\nassert.deepEqual(range(1,5),[1,2,3,4]);\nassert.deepEqual(range(5,1,-2),[5,3]);\nassert.deepEqual(range(1,5,-1),[]);\nassert.deepEqual(range(5,1,1),[]);\nassert.deepEqual(range(1,5,0),[]);\nassert.deepEqual(range(2,2),[]);\n`,
  },
  {
    id: 'count-by',
    objective: 'Fix countBy so it counts every item by the selector result using a Map and correctly handles duplicate and empty-string keys.',
    initial: `export function countBy<T>(items:T[], key:(item:T)=>string):Map<string,number>{\n  const counts=new Map<string,number>();\n  for(const item of items) counts.set(key(item), 1);\n  return counts;\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { countBy } from './solution.js';\nconst result=countBy(['a','ab','','b'], value=>String(value.length));\nassert.deepEqual([...result.entries()],[['1',2],['2',1],['0',1]]);\nassert.deepEqual([...countBy([],String).entries()],[]);\n`,
  },
  {
    id: 'compact-map',
    objective: 'Fix compactMap so it removes only null and undefined mapper results while retaining false, zero, and empty strings. Preserve order.',
    initial: `export function compactMap<T,U>(items:T[], map:(item:T)=>U|null|undefined):U[]{\n  return items.map(map).filter(Boolean) as U[];\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { compactMap } from './solution.js';\nassert.deepEqual(compactMap([0,1,2,3], n=>n===3?null:n===2?undefined:n),[0,1]);\nassert.deepEqual(compactMap(['a','b'], value=>value==='a'?'':false),['',false]);\n`,
  },
  {
    id: 'last-index',
    objective: 'Fix lastIndexBy so it returns the last matching index, returns -1 when absent, and does not mutate the array.',
    initial: `export function lastIndexBy<T>(items:T[], predicate:(item:T)=>boolean):number{\n  return items.findIndex(predicate);\n}\n`,
    hiddenTests: `import assert from 'node:assert/strict';\nimport { lastIndexBy } from './solution.js';\nconst input=[1,2,3,2];\nassert.equal(lastIndexBy(input,n=>n===2),3);\nassert.equal(lastIndexBy(input,n=>n===9),-1);\nassert.equal(lastIndexBy([],()=>true),-1);\nassert.deepEqual(input,[1,2,3,2]);\n`,
  },
];
