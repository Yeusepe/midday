const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const braces = require('braces');
const { minimatch } = require('minimatch');
const { globSync } = require('glob');

test('brace walkers preserve normal patterns and reject excessive or cyclic ASTs', () => {
  assert.deepEqual(braces.expand('a{b,c}{1..2}'), ['ab1','ab2','ac1','ac2']);
  assert.equal(braces.compile('a{b,c}'), 'a(b|c)');
  assert.equal(braces.stringify(braces.parse('a{b,c}')), 'a{b,c}');
  assert.deepEqual(braces.expand('literal\\{x\\}'), ['literal{x}']);
  for (const method of ['compile','expand','stringify']) {
    const deep = braces.parse('{'.repeat(2000)+'x'+ '}'.repeat(2000));
    assert.throws(() => braces[method](deep), {code:'ERR_BRACES_AST_LIMIT'});
    const cyclic={type:'root',nodes:[]};cyclic.nodes.push(cyclic);
    assert.throws(() => braces[method](cyclic), {code:'ERR_BRACES_AST_LIMIT'});
  }
});

test('updated glob and minimatch preserve file-selection behavior', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pattern-security-'));
  try {
    fs.mkdirSync(path.join(dir,'nested'));
    fs.writeFileSync(path.join(dir,'a.txt'),'');
    fs.writeFileSync(path.join(dir,'nested','b.txt'),'');
    fs.writeFileSync(path.join(dir,'nested','c.js'),'');
    assert.deepEqual(globSync('**/*.txt',{cwd:dir}).sort(),['a.txt','nested/b.txt']);
    assert.equal(minimatch('nested/b.txt','**/*.{txt,md}'),true);
    assert.equal(minimatch('nested/c.js','**/*.{txt,md}'),false);
    assert.equal(minimatch('x/y','**/z'),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('URI decoding preserves malformed-input fallback and valid UTF-8', async () => {
  const {default:decode}=await import('decode-uri-component');
  assert.equal(decode('hello%20world'),'hello world');
  assert.equal(decode('%E2%9C%93'),'✓');
  assert.equal(decode('%'),'%');
  assert.equal(typeof decode('%E0%A4%A'), 'string');
});
