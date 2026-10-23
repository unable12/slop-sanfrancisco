const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const banned=/\b(new york|manhattan|brooklyn|queens|bronx|hudson|east river|central park|times square|nyc)\b/i;
test('visible HTML and assigned UI text contain no inherited city names',()=>{
  const html=fs.readFileSync('index.html','utf8').replace(/<!--[\s\S]*?-->/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const text=html.replace(/<[^>]+>/g,' ');
  assert.equal(banned.test(text),false);
  for(const file of fs.readdirSync('js').filter(f=>f.endsWith('.js'))){
    const source=fs.readFileSync(`js/${file}`,'utf8');
    for(const m of source.matchAll(/\.(?:textContent|innerHTML)\s*=\s*(['"`])([\s\S]*?)\1/g))assert.equal(banned.test(m[2]),false,`${file}: ${m[2].slice(0,100)}`);
  }
  for(const m of fs.readFileSync('css/style.css','utf8').matchAll(/content:\s*(['"])(.*?)\1/g))assert.equal(banned.test(m[2]),false);
});
