import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const images = [
  ['dialog-quota-strip.png',2120,476],
  ['quota-widget.png',904,1360],
  ['quota-overview.png',2000,1520],
];

function chunks(data) {
  const result=[];
  for(let offset=8;offset<data.length;) {
    const size=data.readUInt32BE(offset);
    const type=data.toString('ascii',offset+4,offset+8);
    result.push({type,data:data.subarray(offset+8,offset+8+size)});
    offset+=size+12;
  }
  return result;
}

test('README embeds all three full-resolution documentation illustrations', async () => {
  const readme=await readFile(new URL('README.md',root),'utf8');
  const manifest=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  assert.ok(manifest.files.includes('docs/images/*.png'));
  for(const [name,width,height] of images) {
    const data=await readFile(new URL(`docs/images/${name}`,root));
    assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(data.readUInt32BE(16),width);
    assert.equal(data.readUInt32BE(20),height);
    assert.ok(readme.includes(`docs/images/${name}`));
  }
  assert.ok(readme.includes('not real account screenshots'));
  const russian=await readFile(new URL('README.ru.md',root),'utf8');
  assert.ok(russian.includes('не снимки реальных аккаунтов'));
  for(const [name] of images)assert.ok(russian.includes(`docs/images/${name}`));
  assert.ok(readme.includes('[Русский](README.ru.md)'));
  assert.ok(russian.includes('[English](README.md)'));
});

test('documentation images carry only synthetic-data metadata and no captured EXIF', async () => {
  for(const [name] of images) {
    const data=await readFile(new URL(`docs/images/${name}`,root));
    const entries=chunks(data);
    assert.ok(!entries.some(chunk=>chunk.type==='eXIf'));
    const text=entries.filter(chunk=>chunk.type==='tEXt').map(chunk=>chunk.data.toString('utf8')).join('\n');
    assert.match(text,/Every provider label and value is fictional/);
    assert.match(text,/No real account names, identifiers, tokens or balances/);
    assert.doesNotMatch(text,/\/Users\/|@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|eyJ[A-Za-z0-9_-]{20}/);
  }
});

test('illustration generator uses fixed fictional labels without screenshot or account inputs', async () => {
  const generator=await readFile(new URL('src/docs/generate_previews.py',root),'utf8');
  for(const name of ['Provider A','Provider B','Provider C'])assert.ok(generator.includes(name));
  assert.doesNotMatch(generator,/Image\.open\(|requests\.|urllib\.|subprocess|os\.environ|\.dsh\/|attachments\/|readRecord\(/);
  assert.match(generator,/fictional providers and values - no account data/);
});
