import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../client.js',import.meta.url),'utf8');
const extract=name=>Function(`return (${source.match(new RegExp(`    function ${name}\\([^]*?\\n    }`))[0].trim()});`)();
const deprioritize=extract('deprioritizeProvider');
const fit=extract('fitProviders');
const shortName=extract('shortProviderName');
const row=(balances=[],windows=[],status='ok')=>({balances,windows,status});
const balance=(remaining,currency='USD')=>({remaining,currency});
const window=remainingPercent=>({remainingPercent});

test('only known zero quota, not rounded tiny positive quota or unknown values, is deprioritized',()=>{
  assert.equal(deprioritize(row([], [window(0)])),true);
  assert.equal(deprioritize(row([], [window(50),window(0)])),true);
  for(const value of [0.1,null,undefined,NaN,Infinity,'0'])assert.equal(deprioritize(row([], [window(value)])),false);
  assert.equal(deprioritize(row()),false);
});

test('currency thresholds are strict, configurable and require every balance to be low',()=>{
  assert.equal(deprioritize(row([balance(0.99)])),true);
  assert.equal(deprioritize(row([balance(1)])),false);
  assert.equal(deprioritize(row([balance(6.99,'CNY')])),true);
  assert.equal(deprioritize(row([balance(7,'CNY')])),false);
  assert.equal(deprioritize(row([balance(0),balance(380,'CNY')])),false);
  assert.equal(deprioritize(row([balance(0),balance(6,'CNY')])),true);
  assert.equal(deprioritize(row([balance(0,'EUR')])),false);
  assert.equal(deprioritize(row([balance(0,'EUR')]),{EUR:0.9}),true);
  assert.equal(deprioritize(row([balance(0)]),{}),false);
  assert.equal(deprioritize(row([balance(0)]),{USD:0}),false);
  for(const remaining of [null,undefined,NaN,Infinity,'0'])assert.equal(deprioritize(row([balance(remaining)])),false);
});

test('errors and stale data stay in the normal tier even when old metrics are zero',()=>{
  for(const status of ['stale','error','reauth-required','unsupported','missing-auth','disabled'])
    assert.equal(deprioritize(row([balance(0)],[window(0)],status)),false);
});

test('all providers remain visible on wide containers including low balances and zero quota',()=>{
  assert.deepEqual(fit([100,100,100],[true,false,true],316,28),{visible:[0,1,2],hidden:[]});
});

test('low priority is removed first even when it precedes funded providers',()=>{
  const widths=[70,100,90,80], priorities=[true,false,false,true];
  assert.deepEqual(fit(widths,priorities,240,28),{visible:[1,2],hidden:[0,3]});
  assert.deepEqual(fit(widths,priorities,320,28),{visible:[0,1,2],hidden:[3]});
  assert.deepEqual(widths,[70,100,90,80]);
  assert.deepEqual(priorities,[true,false,false,true]);
});

test('within tiers removal is stable from the end and disclosure space is always reserved',()=>{
  assert.deepEqual(fit([80,80,80],[false,false,false],204,28),{visible:[0,1],hidden:[2]});
  assert.deepEqual(fit([80,80,80],[true,true,true],100,28),{visible:[],hidden:[0,1,2]});
  assert.deepEqual(fit([200],[false],32,28),{visible:[],hidden:[0]});
  assert.deepEqual(fit([] ,[],0,28),{visible:[],hidden:[]});
  for(let width=32;width<=500;width++){
    const widths=[70,100,90,80], result=fit(widths,[true,false,false,true],width,28);
    const used=result.visible.reduce((sum,i)=>sum+widths[i],0)+Math.max(0,result.visible.length-1)*8+(result.hidden.length?28+(result.visible.length?8:0):0);
    assert.ok(used<=width,`Overflow at ${width}: ${used}`);
  }
});

test('expanding the strip reveals the funded third provider before an exhausted fourth provider',()=>{
  const widths=[160,72,88,56],low=[false,false,false,true];
  assert.deepEqual(fit(widths,low,280,28),{visible:[0,1],hidden:[2,3]});
  assert.deepEqual(fit(widths,low,375,28),{visible:[0,1,2],hidden:[3]});
  assert.deepEqual(fit(widths,low,400,28),{visible:[0,1,2,3],hidden:[]});
});

test('captured anonymous live widths reproduce narrow, boundary and expanded layouts',()=>{
  const widths=[165.03125,73.875,91.3359375,58.09375], low=[false,false,false,true], more=15.1171875;
  assert.deepEqual(fit(widths,low,363.15625,more),{visible:[0,1],hidden:[2,3]});
  assert.deepEqual(fit(widths,low,288.921875,more),{visible:[0,1],hidden:[2,3]});
  assert.deepEqual(fit(widths,low,370,more),{visible:[0,1,2],hidden:[3]});
  assert.deepEqual(fit(widths,low,636.2109375,more),{visible:[0,1,2,3],hidden:[]});
});

test('compact names preserve custom account names and identity',()=>{
  assert.equal(shortName('kimi-coding'),'Kimi');
  assert.equal(shortName('OpenAI (ChatGPT Pro)'),'OpenAI');
  assert.equal(shortName('Work OpenAI account 2'),'Work OpenAI account 2');
});

test('responsive strip measures only its own subtree, stays single-line and cleans up observers',()=>{
  const css=source.match(/const css = `([^]*?)\n    `;/)[1];
  const bar=css.match(/\.dq-bar\{([^}]+)\}/)[1];
  // Keep a measured nonzero intrinsic basis until actual owner sizing is verified in the running app.
  assert.match(bar,/flex:1 \.5 var\(--dq-natural-width,max-content\)/);
  assert.doesNotMatch(bar,/(?:^|;)flex:1 1 0(?:;|$)/);
  assert.match(source,/'--dq-natural-width':fit.naturalWidth===null/);
  assert.match(source,/fitProviders\(widths,[^\n]*rect.width/);
  const labelCaps=[...css.matchAll(/\.dq-(?:measure \.dq-)?chip-label\{[^}]*max-width:(\d+)px/g)].map(m=>Number(m[1]));
  assert.ok(labelCaps.length>=2);
  assert.ok(labelCaps.every(cap=>cap===156),'Visible and measured labels must have identical width caps');
  assert.match(bar,/flex-wrap:nowrap/);
  assert.match(bar,/height:24px/);
  assert.match(bar,/min-width:28px/);
  assert.match(bar,/border:0;background:none/);
  assert.match(source,/new ResizeObserver\(update\)/);
  assert.match(source,/observer\?\.disconnect\(\)/);
  assert.match(source,/document\.fonts\?\.ready/);
  assert.match(source,/measure\.current\.children/);
  assert.doesNotMatch(source,/parentElement|parentNode|document\.querySelector/);
  assert.match(source,/'aria-hidden':true,inert:''/);
  assert.match(source,/'aria-label':`\$\{t\('moreProviders'\)\}/);
  assert.match(source,/h\(OverflowProviders,\{ids:s\.overlay\.hiddenIds\}\)/);
  assert.match(source,/hiddenIds.includes\(active\?\.dataset\?\.providerId\)/);
  assert.match(source,/recoverFocus.current=true;publish\(\{overlay:null,hover:null\}\)/);
  assert.match(source,/s\.overlay\.triggerId===id/);
  assert.match(source,/const resize=\(\)=>close\(true\)/);
  assert.match(source,/if\(fit!==lastFit.current\)return;/);
  assert.match(source,/top:rect.top,signature/);
  assert.match(source,/frame=requestAnimationFrame\(checkAnchor\)/);
  assert.match(source,/cancelAnimationFrame\(frame\)/);
});

test('measured slot-anchor owner selector preserves intrinsic sizing and anonymous own-element reports',()=>{
  const css=source.match(/const css = `([^]*?)\n    `;/)[1];
  const owner=css.match(/\[data-composer-dock\]:has\(\[data-slot="conversation\.composer\.dock"\] \.dq-bar\)\{([^}]+)\}/);
  assert.ok(owner,'Match quota through the real display:contents slot anchor');
  assert.match(owner[1],/width:100%;max-width:100%;box-sizing:border-box/);
  assert.doesNotMatch(css,/:has\(> \.dq-bar\)/,'A direct-child selector never matched the observed slot DOM');
  assert.doesNotMatch(source,/parentElement|parentNode|closest\(/,'No host DOM mutation or traversal');
  const reporting=source.match(/reportLayout\(\{version:'1\.1\.0'[^]*?\}\);/)[0];
  for(const field of ['viewportWidth','barWidth','moreWidth','chipWidths','visibleCount','hiddenCount','flexGrow','flexShrink','flexBasisPx','supportsHas','directDockChild'])assert.ok(reporting.includes(`${field}:`));
  assert.doesNotMatch(reporting,/p\.name|p\.id|token|email|location|href/);
  assert.match(source,/clearTimeout\(layoutTimer\);pendingLayout=null/);
  assert.match(source,/if\(!alive\|\|layoutFlight\|\|!pendingLayout\)return/);
  assert.match(source,/root\.current\.matches\('\[data-composer-dock\] > \.dq-bar'\)/);
  assert.match(source,/if\(cfg\?\.showBar===false\)return null/);
});

test('fractional container widths do not discard a provider that actually fits',()=>{
  assert.deepEqual(fit([100.125,100.125],[false,false],208.25,28),{visible:[0,1],hidden:[]});
  assert.deepEqual(fit([100.125,100.125],[false,false],208,28),{visible:[0],hidden:[1]});
});

test('settings save waits for old snapshot and prevents polling from overwriting newly persisted preferences',async()=>{
  const loadSource=source.match(/        function load\([^]*?\n        }/)[0];
  const saveSource=source.match(/        async function save\([^]*?\n        }/)[0];
  const requests=[],published=[];
  let releaseSnapshot,releaseSettings;
  const oldSnapshot=new Promise(resolve=>{releaseSnapshot=resolve;});
  const savedSettings=new Promise(resolve=>{releaseSettings=resolve;});
  const api=Function('request','publish',`let flight=null,saving=false;${loadSource}\n${saveSource}\nreturn {load,save};`)(
    (path)=>{requests.push(path);return path==='settings'?savedSettings:oldSnapshot;},
    patch=>published.push(patch)
  );
  const loading=api.load();
  const saving=api.save({lowBalanceThresholds:{USD:2}});
  assert.deepEqual(requests,['snapshot']);
  releaseSnapshot({providers:[],settings:{lowBalanceThresholds:{USD:1}}});
  await loading;
  // The save continuation may start only after load's shared finally has settled.
  await Promise.resolve();
  assert.deepEqual(requests,['snapshot','settings']);
  await api.load();
  assert.deepEqual(requests,['snapshot','settings']);
  releaseSettings({providers:[],settings:{lowBalanceThresholds:{USD:2}}});
  assert.equal(await saving,true);
  const updates=published.filter(p=>p.data);
  assert.equal(updates.at(-1).data.settings.lowBalanceThresholds.USD,2);
  assert.equal(published.at(-1).busy,false);
});
