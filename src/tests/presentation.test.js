import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8');
// Test the actual pure geometry function, not a fake React tree or a DOM renderer.
const geometrySource = source.match(/    function floatingPosition\([^]*?\n    }/)[0].trim();
const floatingPosition = Function(`return (${geometrySource});`)();
const css = source.match(/const css = `([^]*?)\n    `;/)[1];

test('floating surface aligns with the chip and sits eight pixels above its actual content height', () => {
  const result = floatingPosition({left:120,top:600,bottom:624},200,1024,800,360);
  assert.equal(result.left,120);
  assert.equal(result.width,360);
  assert.equal(result.top,392);
  assert.equal(result.top+200,592);
});

test('floating surface flips below near the viewport top and stays inside the right edge', () => {
  const result = floatingPosition({left:990,top:20,bottom:44},180,1024,800,320);
  assert.equal(result.top,52);
  assert.equal(result.left+result.width,1012);
  assert.ok(result.maxHeight>=180);
});

test('narrow and short viewports preserve margins and usable header/actions', () => {
  const narrow = floatingPosition({left:290,top:540,bottom:560},200,320,600,360);
  assert.equal(narrow.left,12);
  assert.equal(narrow.width,296);
  assert.ok(narrow.top>=12);
  assert.ok(narrow.top+Math.min(200,narrow.maxHeight)<=588);
  const short = floatingPosition({left:30,top:100,bottom:120},500,240,200,360);
  assert.equal(short.top,12);
  assert.equal(short.maxHeight,176);
  assert.equal(short.width,216);
});

test('long lists scroll in the available space instead of placing a fixed-height popup offscreen', () => {
  const result = floatingPosition({left:80,top:400,bottom:424},2000,1024,800,360);
  assert.equal(result.top,12);
  assert.equal(result.maxHeight,380);
  assert.equal(result.top+result.maxHeight,392);
  assert.doesNotMatch(source, /a\.top-520|viewportHeight-540/);
  assert.match(css,/\.dq-surface-body\{[^}]*overflow:auto/);
  assert.match(css,/\.dq-surface-foot\{[^}]*flex:none/);
});

test('popover and tooltip use neutral DSH surfaces, subtle borders and shared metric rows', () => {
  assert.doesNotMatch(css,/--dsw-alias-bg-overlay/);
  assert.match(css,/\.dq-surface\{[^}]*background:var\(--dsw-specific-menu,var\(--dsw-alias-bg-base\)\)/);
  assert.match(css,/\.dq-surface\{[^}]*backdrop-filter:var\(--dsw-menu-backdrop-filter,none\)/);
  assert.match(css,/\.dq-surface\{[^}]*--dsw-elevation-stroke-color:var\(--dsw-alias-border-l1\)/);
  assert.match(css,/\.dq-surface\{[^}]*box-shadow:var\(--dsw-elevation-prominent,/);
  assert.match(css,/\.dq-surface\{[^}]*border-radius:var\(--dsw-radius-lg,16px\)/);
  assert.match(css,/\.dq-surface \.dq-metric dt\{color:var\(--dsw-alias-label-tertiary,/);
  assert.match(css,/\.dq-surface \.dq-metric dd\{color:var\(--dsw-alias-label-secondary\)/);
  assert.match(css,/\.dq-metric\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.doesNotMatch(css,/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  const providerBody = source.slice(source.indexOf('function ProviderCard('),source.indexOf('function ErrorNotice('));
  assert.match(providerBody,/'dl',\{className:'dq-metrics'\}/);
  assert.doesNotMatch(providerBody,/h\(Ring|className:'dq-card'|dq-money/);
  assert.match(source,/h\(ProviderCard,\{p:provider,compact:true,tooltip:true\}\)/);
});

test('popup scrollbar stays flush with a compact 16px text inset', () => {
  const bodyRule=css.match(/\.dq-pop \.dq-surface-body\{([^}]+)\}/)[1];
  const padding=Number(bodyRule.match(/padding-right:(\d+)px/)[1]);
  assert.match(bodyRule,/margin-right:calc\(-1 \* var\(--dq-surface-padding\)\)/);
  assert.equal(padding,16);
  assert.match(bodyRule,/scrollbar-gutter:stable/);
  assert.match(bodyRule,/scrollbar-width:thin/);
  for(const inset of [16,14])for(const reservedWidth of [0,8,15])for(const hoverWidth of [6,10,12]) {
    const width=360,margin=-inset;
    const scrollbarRight=width-inset-margin;
    const valueRight=scrollbarRight-reservedWidth-padding;
    assert.equal(width-scrollbarRight,0);
    assert.ok(scrollbarRight-hoverWidth-valueRight>=4,'A thin scrollbar expanded to 12px retains a compact text gap');
  }
  assert.match(css,/@media\(max-width:500px\)[^]*\.dq-surface\{--dq-surface-padding:14px\}/);
});

test('floating panel typography matches compact native surfaces without changing page typography', () => {
  assert.match(css,/\.dq-surface\{[^}]*font-size:12px/);
  assert.match(css,/\.dq-surface-title h3\{font-size:12px/);
  assert.match(css,/\.dq-surface \.dq-provider-head h3\{font-size:12px/);
  assert.match(css,/\.dq-surface \.dq-metrics\{gap:4px\}/);
  assert.match(css,/\.dq\{[^}]*font-size:13px/);
});

test('floating interactions preserve Escape, outside focus and cleanup without importing private UI packages', () => {
  assert.match(source,/e\.key==='Escape'/);
  assert.match(source,/close\(false\)/);
  assert.match(source,/focus\(\{preventScroll:true\}\)/);
  for(const event of ['keydown','pointerdown','focusin','scroll']) {
    assert.ok(source.includes(`addEventListener('${event}'`));
    assert.ok(source.includes(`removeEventListener('${event}'`));
  }
  assert.match(source,/'aria-expanded':!!s.overlay/);
  assert.doesNotMatch(source,/require\(['"]@deepseek-ai\/dsh-client-/);
});
