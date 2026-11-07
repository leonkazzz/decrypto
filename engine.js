/* Decrypto 主持人工具 · 纯规则模块。无网络请求；浏览器和 Node 测试共用。 */
(function(root){
  'use strict';
  const MAX_LEN = 18;
  const normalize = value => String(value ?? '').trim().replace(/\s+/g,' ');
  const unique = values => Array.from(new Set(values.map(normalize).filter(Boolean)));
  const key = w => normalize(w).toLowerCase();

  // 优先使用浏览器的加密随机数，避免 Math.random 的可预测性。
  function secureRandom(){
    const c = root.crypto;
    if(c && typeof c.getRandomValues === 'function'){
      const buf = new Uint32Array(1); c.getRandomValues(buf); return buf[0] / 4294967296;
    }
    return Math.random();
  }
  const pick = (list, rng) => list[Math.min(list.length-1, Math.floor(rng()*list.length))];

  // 两个词互相包含（如「足球 / 足球鞋」）时视为相关，同一局尽量不同时出现。
  function related(a, b){
    const x = key(a), y = key(b);
    if(!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  }

  function combinePool(categories, custom, mode) {
    const builtin = unique(Object.values(categories).flat());
    if(mode === 'custom') return unique(custom);
    if(mode === 'mixed') return unique([...builtin, ...custom]);
    return builtin;
  }

  // 抽一个词：绝不与 blocked 完全相同；优先避开相关词和最近几局用过的词，候选不足时逐级放宽。
  function drawOne(pool, blocked, recent=[], rng=secureRandom) {
    const blockedKeys = new Set(blocked.map(key));
    const eligible = pool.filter(x => !blockedKeys.has(key(x)));
    if(!eligible.length) throw new Error('词库中没有足够的可用词语。');
    const recentSet = new Set(recent.map(key));
    const unrelated = eligible.filter(x => !blocked.some(b => related(x, b)));
    const tiers = [
      unrelated.filter(x => !recentSet.has(key(x))),
      unrelated,
      eligible.filter(x => !recentSet.has(key(x))),
      eligible,
    ];
    return pick(tiers.find(t => t.length), rng);
  }

  function drawEight(pool, recent=[], rng=secureRandom) {
    const clean = unique(pool);
    if(new Set(clean.map(key)).size < 8) throw new Error('词库至少需要8个不同词语才能开局。');
    const chosen=[];
    for(let i=0;i<8;i++) chosen.push(drawOne(clean,chosen,recent,rng));
    return {red:chosen.slice(0,4), blue:chosen.slice(4)};
  }

  function checkSlot(team, index){
    if(!['red','blue'].includes(team) || !Number.isInteger(index) || index<0 || index>3) throw new Error('无效的词语位置。');
  }
  const others = (groups, team, index) => [...groups.red,...groups.blue].filter((_,i)=>i!==(team==='red'?index:4+index));

  // 只替换指定词卡，其余 7 张保持不变；新词不能与旧词相同。
  function replaceSlot(groups, team, index, pool, recent=[], rng=secureRandom){
    checkSlot(team, index);
    const old = key(groups[team][index]);
    const candidatePool = unique(pool).filter(x => key(x) !== old);
    const blocked = others(groups, team, index);
    const blockedKeys = new Set(blocked.map(key));
    if(!candidatePool.some(x => !blockedKeys.has(key(x)))) throw new Error('没有其他可重抽的词语，请添加更多自定义词。');
    const replacement = drawOne(candidatePool, blocked, [...recent, groups[team][index]], rng);
    return {...groups,[team]:groups[team].map((word,i)=>i===index?replacement:word)};
  }

  function editSlot(groups, team, index, word) {
    checkSlot(team, index);
    const clean=normalize(word);
    if(!clean) throw new Error('词语不能为空。');
    if([...clean].length>MAX_LEN) throw new Error(`一个词最多${MAX_LEN}个字符。`);
    if(others(groups, team, index).some(w => key(w) === key(clean))) throw new Error('这个词已经在另一张词卡上，请换一个。');
    return {...groups,[team]:groups[team].map((w,i)=>i===index?clean:w)};
  }

  // 一轮密码：从 1–4 中取 3 个不重复数字，顺序随机。
  function code(rng=secureRandom){
    const digits=[1,2,3,4];
    for(let i=digits.length-1;i>0;i--){
      const j=Math.min(i,Math.floor(rng()*(i+1)));
      [digits[i],digits[j]]=[digits[j],digits[i]];
    }
    return digits.slice(0,3);
  }
  function isValidCode(c){return Array.isArray(c)&&c.length===3&&new Set(c).size===3&&c.every(n=>Number.isInteger(n)&&n>=1&&n<=4);}

  // 批量导入：支持换行、空格、中英文逗号、顿号、分号、竖线分隔。
  function parseBatch(text){
    const parts = String(text??'').split(/[\s,，、;；|｜]+/).map(normalize).filter(Boolean);
    const tooLong = parts.filter(x=>[...x].length>MAX_LEN);
    return {terms: unique(parts.filter(x=>[...x].length<=MAX_LEN)), tooLong: unique(tooLong)};
  }
  function readBatch(text){return parseBatch(text).terms;}

  function isValidGroups(g){
    if(!g||!Array.isArray(g.red)||g.red.length!==4||!Array.isArray(g.blue)||g.blue.length!==4) return false;
    const all=[...g.red,...g.blue];
    return all.every(w=>typeof w==='string'&&normalize(w).length>0)&&new Set(all.map(key)).size===8;
  }
  root.DecryptoEngine={MAX_LEN,normalize,unique,related,combinePool,drawOne,drawEight,replaceSlot,editSlot,code,isValidCode,parseBatch,readBatch,isValidGroups,secureRandom};
})(typeof window!=='undefined'?window:globalThis);
