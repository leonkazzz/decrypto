// 运行：node --test
const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const context={};context.globalThis=context;context.window=context;
vm.runInNewContext(fs.readFileSync(__dirname+'/words.js','utf8'),context);
vm.runInNewContext(fs.readFileSync(__dirname+'/engine.js','utf8'),context);
const E=context.DecryptoEngine;
const categories=context.BUILTIN_WORDS;
const words=Object.values(categories).flat();
const all8=d=>[...d.red,...d.blue];

test('at least 3000 unique, clean Chinese terms',()=>{
  assert.ok(words.length>=3000,`only ${words.length}`);
  assert.equal(new Set(words).size,words.length,'duplicate word in list');
  assert.ok(Object.keys(categories).length>=12);
  for(const w of words){
    assert.equal(w,E.normalize(w),`untrimmed: ${w}`);
    assert.ok(!/\s/.test(w),`whitespace: ${w}`);
    assert.ok([...w].length<=E.MAX_LEN,`too long: ${w}`);
    assert.ok(/[一-鿿]/.test(w)||/^[A-Z0-9]+$/.test(w),`not Chinese: ${w}`);
  }
});
test('each new game has eight unique, unrelated words',()=>{
  for(let i=0;i<500;i++){
    const d=E.drawEight(words),a=all8(d);
    assert.equal(new Set(a).size,8);
    for(let x=0;x<8;x++)for(let y=x+1;y<8;y++)assert.ok(!E.related(a[x],a[y]),`${a[x]} / ${a[y]}`);
  }
});
test('redraw only affects target card and avoids related words',()=>{
  for(let i=0;i<200;i++){
    const d=E.drawEight(words),before=all8(d);
    const updated=E.replaceSlot(d,'red',2,words);const after=all8(updated);
    assert.notEqual(after[2],before[2]);
    after.forEach((w,j)=>{if(j!==2)assert.equal(w,before[j]);});
    assert.equal(new Set(after).size,8);
    after.forEach((w,j)=>{if(j!==2)assert.ok(!E.related(w,after[2]));});
  }
});
test('blue slots can be redrawn too',()=>{const d=E.drawEight(words);const u=E.replaceSlot(d,'blue',3,words);assert.deepEqual(Array.from(u.red),Array.from(d.red));assert.notEqual(u.blue[3],d.blue[3]);});
test('editing cannot duplicate other team (case-insensitive)',()=>{
  const d=E.drawEight(words);assert.throws(()=>E.editSlot(d,'red',0,d.blue[2]),/已经/);
  const g={red:['Apple','b','c','d'],blue:['e','f','g','h']};assert.throws(()=>E.editSlot(g,'blue',0,' apple '),/已经/);
});
test('editing a single word stays valid',()=>{const d=E.drawEight(words);const a=E.editSlot(d,'blue',1,'新式秘密词');assert.equal(a.blue[1],'新式秘密词');assert.equal(new Set(all8(a)).size,8);});
test('editing rejects empty and overlong words',()=>{const d=E.drawEight(words);assert.throws(()=>E.editSlot(d,'red',0,'   '),/不能为空/);assert.throws(()=>E.editSlot(d,'red',0,'一'.repeat(19)),/最多/);});
test('every three digit code is in 1..4 and unique',()=>{for(let i=0;i<10000;i++){const c=E.code();assert.ok(E.isValidCode(c));}});
test('all 24 possible codes appear',()=>{const s=new Set();for(let i=0;i<5000;i++)s.add(E.code().join(''));assert.equal(s.size,24);});
test('isValidCode rejects bad codes',()=>{for(const c of [[1,1,2],[0,1,2],[1,2,5],[1,2],null,'123'])assert.ok(!E.isValidCode(c));});
test('custom words batch de-duplicates and reports too-long words',()=>{
  assert.deepEqual(Array.from(E.readBatch('熊猫，火锅\n熊猫;飞机、地铁|高铁')),['熊猫','火锅','飞机','地铁','高铁']);
  const r=E.parseBatch('好词 '+'长'.repeat(19));assert.deepEqual(Array.from(r.terms),['好词']);assert.equal(r.tooLong.length,1);
});
test('custom only requires enough words',()=>{assert.throws(()=>E.drawEight(['a','b','c']),/至少/);});
test('small custom pool still works when words are related',()=>{const p=['猫','小猫','黑猫','熊猫','狗','小狗','鱼','金鱼'];const d=E.drawEight(p);assert.equal(new Set(all8(d)).size,8);});
test('redraw rejects unchanged word when pool exhausted',()=>{assert.throws(()=>E.replaceSlot({red:['a','b','c','d'],blue:['e','f','g','h']},'red',0,['a','b','c','d','e','f','g','h']),/没有其他/);});
test('recent games are excluded when alternatives exist',()=>{const r=words.slice(0,1200);const d=E.drawEight(words,r);assert.ok(all8(d).every(w=>!r.includes(w)));});
test('isValidGroups catches duplicates and bad shapes',()=>{assert.ok(!E.isValidGroups({red:['a','b','c','d'],blue:['a','f','g','h']}));assert.ok(!E.isValidGroups({red:['a','b','c'],blue:['e','f','g','h']}));assert.ok(E.isValidGroups({red:['a','b','c','d'],blue:['e','f','g','h']}));});
