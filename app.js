(function(){
  'use strict';
  const E=window.DecryptoEngine;
  // 存储键沿用旧版，已有的本地存档可以继续使用。
  const STATE_KEY='cipherdesk_2026_game_state';
  const CUSTOM_KEY='cipherdesk_2026_custom_vocabulary';
  const RECENT_KEY='cipherdesk_2026_recent_games';
  const MAX_ROUNDS=8, WIN_TOKENS=2;
  const TEAMS={red:'红队',blue:'蓝队'};
  const other=t=>t==='red'?'blue':'red';
  const $=id=>document.getElementById(id);
  const safe=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=n=>`<svg><use href="#i-${n}"/></svg>`;

  /* ---------- 存储 ---------- */
  function getJSON(key,fallback){try{const t=localStorage.getItem(key);return t?JSON.parse(t):fallback;}catch{return fallback;}}
  let storageWarned=false;
  function setJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{if(!storageWarned){storageWarned=true;toast('无法保存到浏览器，刷新后进度会丢失（可能是隐私模式）。',true);}return false;}}
  const cleanList=v=>Array.isArray(v)?E.unique(v.filter(x=>typeof x==='string')):[];

  let custom=cleanList(getJSON(CUSTOM_KEY,[]));
  let recent=getJSON(RECENT_KEY,[]);if(!Array.isArray(recent))recent=[];
  const builtinTotal=E.combinePool(window.BUILTIN_WORDS,[],'builtin').length;

  const emptyScore=()=>({red:{intercept:0,miss:0},blue:{intercept:0,miss:0}});
  function validState(s){return !!s&&['prepare','active'].includes(s.phase)&&['builtin','custom','mixed'].includes(s.mode)&&E.isValidGroups(s.words)&&Number.isInteger(s.round)&&s.round>=0&&s.round<=MAX_ROUNDS;}
  // 补齐旧版存档缺少的字段，修复损坏的密码 / 比分。
  function migrate(s){
    if(!validState(s))return null;
    if(s.phase==='prepare'){s.round=0;s.codes={red:null,blue:null};}
    else{
      if(s.round<1)s.round=1;
      if(!s.codes||!E.isValidCode(s.codes.red)||!E.isValidCode(s.codes.blue))s.codes={red:E.code(),blue:E.code()};
    }
    const sc=emptyScore();
    for(const t of ['red','blue'])for(const k of ['intercept','miss']){const v=s.score?.[t]?.[k];sc[t][k]=Number.isInteger(v)&&v>=0?Math.min(v,WIN_TOKENS):0;}
    s.score=sc;
    s.finished=s.phase==='active'&&s.finished===true;
    s.history=Array.isArray(s.history)?s.history.filter(h=>h&&Number.isInteger(h.round)&&E.isValidCode(h.red)&&E.isValidCode(h.blue)):[];
    return s;
  }
  const pool=mode=>E.combinePool(window.BUILTIN_WORDS,custom,mode);
  const lastWords=()=>recent.flatMap(x=>Array.isArray(x)?x:[]);
  function newState(mode='builtin'){
    return {phase:'prepare',mode,round:0,words:E.drawEight(pool(mode),lastWords()),codes:{red:null,blue:null},score:emptyScore(),history:[],createdAt:new Date().toISOString()};
  }
  let state=migrate(getJSON(STATE_KEY,null));
  if(!state){try{state=newState(getJSON(STATE_KEY,null)?.mode==='mixed'?'mixed':'builtin');}catch{state=newState('builtin');}}
  const save=()=>setJSON(STATE_KEY,state);

  /* ---------- 界面状态（不存档：刷新后一律遮住） ---------- */
  let team='red',showWords=false,editing=null,holding=false,flashIndex=null;

  /* ---------- 小组件 ---------- */
  let toastTimer=null;
  function toast(msg,error=false){const el=$('toast');el.textContent=msg;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,2800);}
  const dlg=$('confirmDlg');
  function ask(title,text,okLabel='确定'){
    if(typeof dlg.showModal!=='function')return Promise.resolve(window.confirm(`${title}\n${text}`));
    $('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmOk').textContent=okLabel;
    dlg.returnValue='';
    return new Promise(res=>{dlg.addEventListener('close',()=>res(dlg.returnValue==='ok'),{once:true});dlg.showModal();});
  }
  function download(name,text,type){
    const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  /* ---------- 规则判定 ---------- */
  function outcome(){
    const s=state.score,wins=[];
    for(const t of ['red','blue']){
      if(s[t].intercept>=WIN_TOKENS)wins.push(t);
      if(s[t].miss>=WIN_TOKENS)wins.push(other(t));
    }
    const uniq=[...new Set(wins)];
    if(uniq.length===1)return `🏆 ${TEAMS[uniq[0]]}获胜！`;
    if(uniq.length>1)return '双方同时达成条件：用「拦截 − 失误」比较，仍相同则互猜对方密词。';
    return '';
  }

  /* ---------- 渲染 ---------- */
  function render(){
    const started=state.phase==='active';
    const result=outcome();
    const over=started&&(!!result||state.finished);
    document.body.dataset.team=team;

    const chip=$('roundChip');
    chip.textContent=!started?'准备中':over?'已结束':`第 ${state.round} / ${MAX_ROUNDS} 轮`;
    chip.classList.toggle('live',started&&!over);

    for(const t of ['red','blue']){const b=$(t==='red'?'tabRed':'tabBlue');b.classList.toggle('active',team===t);b.setAttribute('aria-selected',String(team===t));}

    $('wordsTitle').textContent=`${TEAMS[team]}密词`;
    const rb=$('revealBtn');rb.setAttribute('aria-pressed',String(showWords));
    rb.innerHTML=icon(showWords?'eye-off':'eye')+`<span>${showWords?'隐藏':'显示'}</span>`;

    $('wordGrid').innerHTML=state.words[team].map((w,i)=>{
      const n=`<div class="num">${i+1}</div>`;
      if(!showWords)return `<div class="card is-covered">${n}<div class="word covered">•••</div></div>`;
      if(!started&&editing===i)return `<div class="card">${n}<input id="editInput" value="${safe(w)}" maxlength="${E.MAX_LEN}" autocomplete="off" enterkeyhint="done" aria-label="修改第${i+1}个词"><div class="card-tools"><button type="button" class="tool" data-act="cancel" aria-label="取消">${icon('x')}</button><button type="button" class="tool ok" data-act="save" data-i="${i}" aria-label="保存">${icon('check')}</button></div></div>`;
      const tools=started?'':`<div class="card-tools"><button type="button" class="tool" data-act="reroll" data-i="${i}" aria-label="重抽第${i+1}个词">${icon('refresh')}</button><button type="button" class="tool" data-act="edit" data-i="${i}" aria-label="修改第${i+1}个词">${icon('edit')}</button></div>`;
      return `<div class="card${flashIndex===i?' flash':''}">${n}<div class="word">${safe(w)}</div>${tools}</div>`;
    }).join('');
    flashIndex=null;
    const inp=$('editInput');if(inp){inp.focus();inp.select();}
    $('wordHint').textContent=started?`已锁定 · 只给${TEAMS[team]}看`:showWords?'不满意可以点 ↻ 换一个，或点 ✎ 自己改。':`点「显示」查看${TEAMS[team]}的 4 个词，确认后开始游戏。`;

    // 密码
    const code=state.codes?.[team];
    const pad=$('codePad');
    pad.disabled=!started||over;
    pad.classList.toggle('holding',holding&&started&&!over);
    $('codeDigits').innerHTML=[0,1,2].map(i=>`<b>${holding&&started&&!over&&E.isValidCode(code)?code[i]:'·'}</b>`).join('');
    $('codeLabel').textContent=!started?'开始游戏后生成':over?'本局已结束':holding?'松手隐藏':`按住查看 · ${TEAMS[team]}加密员`;
    $('codeTag').textContent=started&&!over?(state.round===1?'第 1 轮只解密，不拦截':'对手先拦截，本队再解密'):'';

    // 比分
    $('scoreBlock').hidden=!started;
    document.querySelectorAll('.tokens').forEach(el=>{
      const v=state.score[el.dataset.team][el.dataset.kind];
      el.innerHTML=Array.from({length:WIN_TOKENS},(_,i)=>`<button type="button" class="token${i<v?' on':''}" data-n="${i+1}" aria-label="${TEAMS[el.dataset.team]}${el.dataset.kind==='intercept'?'拦截成功':'传达失误'}记为${i+1===v?i:i+1}次"></button>`).join('');
    });
    $('winBanner').hidden=!result&&!state.finished;
    $('winBanner').textContent=result||(state.finished?'8 轮结束：用「拦截 − 失误」比较，仍相同则双方互猜对方密词。':'');

    // 底部按钮
    $('rerollAllBtn').hidden=started;
    const main=$('mainBtn');
    main.innerHTML=!started?icon('lock')+'开始游戏':over?'再来一局':state.round>=MAX_ROUNDS?'结束本局':`进入第 ${state.round+1} 轮`;

    renderSheet();
  }
  function renderSheet(){
    const started=state.phase==='active';
    document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===state.mode);b.setAttribute('aria-checked',String(b.dataset.mode===state.mode));b.disabled=started;});
    $('modeHint').textContent=started?'游戏进行中，词库来源已锁定。':{builtin:`从 ${builtinTotal} 个常用词中抽取。`,custom:`只用你的 ${custom.length} 个自定义词（至少 8 个）。`,mixed:`内置 ${builtinTotal} 个 + 自定义 ${custom.length} 个一起抽。`}[state.mode];
    $('customCaption').textContent=`自定义词 ${custom.length} 个`;
    $('customTags').innerHTML=custom.map((w,i)=>`<span class="t">${safe(w)}<button type="button" data-del="${i}" aria-label="删除 ${safe(w)}">${icon('x')}</button></span>`).join('');
    $('customTools').hidden=!custom.length;
    $('historyWrap').hidden=!state.history.length;
    $('historyList').innerHTML=state.history.map(h=>`<div class="h-row"><span>第 ${h.round} 轮</span><span class="r">红 ${h.red.join(' ')}</span><span class="b">蓝 ${h.blue.join(' ')}</span></div>`).join('');
  }

  /* ---------- 操作 ---------- */
  function setTeam(t){if(team===t)return;team=t;showWords=false;editing=null;holding=false;render();}
  $('tabRed').addEventListener('click',()=>setTeam('red'));
  $('tabBlue').addEventListener('click',()=>setTeam('blue'));
  $('revealBtn').addEventListener('click',()=>{showWords=!showWords;editing=null;render();});

  $('wordGrid').addEventListener('click',ev=>{
    const b=ev.target.closest('[data-act]');if(!b||state.phase!=='prepare')return;
    const i=Number(b.dataset.i);
    switch(b.dataset.act){
      case 'edit':editing=i;render();break;
      case 'cancel':editing=null;render();break;
      case 'save':
        try{state.words=E.editSlot(state.words,team,i,$('editInput').value);editing=null;flashIndex=i;save();render();}
        catch(e){toast(e.message,true);}
        break;
      case 'reroll':
        try{state.words=E.replaceSlot(state.words,team,i,pool(state.mode),lastWords());flashIndex=i;save();render();}
        catch(e){toast(e.message,true);}
    }
  });
  $('wordGrid').addEventListener('keydown',ev=>{
    if(ev.target.id!=='editInput')return;
    if(ev.key==='Enter'){ev.preventDefault();$('wordGrid').querySelector('[data-act="save"]')?.click();}
    if(ev.key==='Escape'){ev.preventDefault();editing=null;render();}
  });

  $('rerollAllBtn').addEventListener('click',async()=>{
    if(state.phase!=='prepare')return;
    if(!await ask('全部重抽？','红蓝两队的 8 个词都会换掉。','全部重抽'))return;
    try{state.words=E.drawEight(pool(state.mode),lastWords());editing=null;save();render();toast('已换成新的 8 个词');}
    catch(e){toast(e.message,true);}
  });

  // 按住看密码：松手、移出、切后台都会立即隐藏。
  const pad=$('codePad');
  const holdOn=ev=>{if(pad.disabled)return;ev.preventDefault();if(!holding){holding=true;render();}};
  const holdOff=()=>{if(holding){holding=false;render();}};
  pad.addEventListener('pointerdown',ev=>{try{pad.setPointerCapture(ev.pointerId);}catch{}holdOn(ev);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(t=>pad.addEventListener(t,holdOff));
  pad.addEventListener('keydown',ev=>{if(ev.key===' '||ev.key==='Enter')holdOn(ev);});
  pad.addEventListener('keyup',holdOff);
  pad.addEventListener('blur',holdOff);
  pad.addEventListener('contextmenu',ev=>ev.preventDefault());

  $('scoreBlock').addEventListener('click',ev=>{
    const b=ev.target.closest('.token');if(!b||state.phase!=='active')return;
    const box=b.parentElement,t=box.dataset.team,k=box.dataset.kind,n=Number(b.dataset.n);
    state.score[t][k]=state.score[t][k]===n?n-1:n;
    save();render();
    const r=outcome();if(r)toast(r.replace('🏆 ',''));
  });

  $('mainBtn').addEventListener('click',async()=>{
    if(state.phase==='prepare'){
      if(!E.isValidGroups(state.words)){toast('8 个词必须互不相同',true);return;}
      if(!await ask('开始游戏？','开始后两队的 8 个词会锁定，不能再改。','开始'))return;
      Object.assign(state,{phase:'active',round:1,codes:{red:E.code(),blue:E.code()},score:emptyScore(),history:[],finished:false});
      showWords=false;editing=null;team='red';save();render();toast('第 1 轮开始');
      return;
    }
    if(outcome()||state.finished){await newGame(true);return;}
    if(state.round>=MAX_ROUNDS){
      if(!await ask('结束本局？','8 轮已经打完，将按比分判定结果。','结束'))return;
      state.history.push({round:state.round,red:state.codes.red,blue:state.codes.blue});
      state.finished=true;save();render();return;
    }
    if(!await ask(`进入第 ${state.round+1} 轮？`,'请确认两队都已公布本轮密码。之后会生成新密码。','下一轮'))return;
    state.history.push({round:state.round,red:state.codes.red,blue:state.codes.blue});
    state.round+=1;state.codes={red:E.code(),blue:E.code()};showWords=false;team='red';save();render();toast(`第 ${state.round} 轮开始`);
  });

  async function newGame(skipAsk){
    if(!skipAsk&&!await ask('开新一局？','当前的词、密码和比分都会清空，自定义词库保留。','开新一局'))return false;
    recent.unshift([...state.words.red,...state.words.blue]);recent=recent.slice(0,5);setJSON(RECENT_KEY,recent);
    let mode=state.mode,fell=false;
    if(pool(mode).length<8){mode='builtin';fell=true;}
    state=newState(mode);team='red';showWords=false;editing=null;save();render();
    toast(fell?'自定义词不足 8 个，已改用内置词库':'新一局已准备好',fell);
    return true;
  }

  /* ---------- 设置面板 ---------- */
  const sheet=$('sheet');
  $('settingsBtn').addEventListener('click',()=>{renderSheet();typeof sheet.showModal==='function'?sheet.showModal():sheet.setAttribute('open','');});
  sheet.addEventListener('click',ev=>{if(ev.target===sheet||ev.target.closest('[data-close]'))sheet.close?sheet.close():sheet.removeAttribute('open');});
  $('newGameBtn').addEventListener('click',async()=>{if(await newGame(false))sheet.close?.();});

  document.querySelector('[role="radiogroup"]').addEventListener('click',async ev=>{
    const b=ev.target.closest('[data-mode]');if(!b||state.phase!=='prepare'||b.dataset.mode===state.mode)return;
    const next=b.dataset.mode;
    if(pool(next).length<8){toast('自定义词至少要 8 个，先在下面添加',true);return;}
    if(!await ask('切换词库？','会用新词库重新抽 8 个词。','切换'))return;
    try{state.words=E.drawEight(pool(next),lastWords());state.mode=next;showWords=false;editing=null;save();render();toast('已切换并重新抽词');}
    catch(e){toast(e.message,true);}
  });

  function addCustom(text){
    const {terms,tooLong}=E.parseBatch(text);
    if(!terms.length&&!tooLong.length){toast('没有找到可添加的词',true);return false;}
    const have=new Set(custom),before=custom.length;
    for(const w of terms)if(!have.has(w)){custom.push(w);have.add(w);}
    setJSON(CUSTOM_KEY,custom);render();
    const added=custom.length-before,dup=terms.length-added;
    let msg=`添加了 ${added} 个`;
    if(dup)msg+=`，${dup} 个重复已跳过`;
    if(tooLong.length)msg+=`，${tooLong.length} 个超过 ${E.MAX_LEN} 字`;
    toast(msg,!added);
    return true;
  }
  $('customAddBtn').addEventListener('click',()=>{if(addCustom($('customInput').value))$('customInput').value='';});
  $('customFileInput').addEventListener('change',async ev=>{
    const f=ev.target.files?.[0];if(!f)return;
    try{if(f.size>2*1024*1024)throw new Error('文件太大（上限 2MB）');addCustom(await f.text());}
    catch(e){toast(e.message||'无法读取文件',true);}finally{ev.target.value='';}
  });
  $('customTags').addEventListener('click',ev=>{
    const b=ev.target.closest('[data-del]');if(!b)return;
    const i=Number(b.dataset.del);if(custom[i]===undefined)return;
    const w=custom.splice(i,1)[0];setJSON(CUSTOM_KEY,custom);render();toast(`已删除「${w}」`);
  });
  $('customClearBtn').addEventListener('click',async()=>{
    if(!custom.length||!await ask('清空自定义词？',`将删除全部 ${custom.length} 个自定义词，建议先导出。`,'清空'))return;
    custom=[];setJSON(CUSTOM_KEY,custom);render();toast('已清空');
  });
  $('wordDownloadBtn').addEventListener('click',()=>{if(custom.length)download('密语_自定义词库.txt',custom.join('\n')+'\n','text/plain;charset=utf-8');});
  $('backupBtn').addEventListener('click',()=>{
    download('密语_主持人存档.json',JSON.stringify({app:'cipherdesk-2026',version:2,exportedAt:new Date().toISOString(),state,custom,recent},null,2),'application/json');
    toast('已导出。存档里有密词，别发给玩家');
  });
  $('restoreInput').addEventListener('change',async ev=>{
    const f=ev.target.files?.[0];if(!f)return;
    try{
      const d=JSON.parse(await f.text());
      const s=d&&d.app==='cipherdesk-2026'&&[1,2].includes(d.version)?migrate(d.state):null;
      if(!s||!Array.isArray(d.custom)||!Array.isArray(d.recent))throw new Error('不是有效的存档文件');
      if(!await ask('导入存档？','会替换本机当前的游戏和自定义词库。','导入'))return;
      state=s;custom=cleanList(d.custom);recent=d.recent.filter(Array.isArray).slice(0,5);
      save();setJSON(CUSTOM_KEY,custom);setJSON(RECENT_KEY,recent);team='red';showWords=false;editing=null;render();toast('存档已恢复');
    }catch(e){toast(e instanceof SyntaxError?'文件不是有效的 JSON':(e.message||'无法读取存档'),true);}
    finally{ev.target.value='';}
  });

  /* ---------- 隐私与同步 ---------- */
  document.addEventListener('visibilitychange',()=>{if(document.hidden){showWords=false;editing=null;holding=false;render();}});
  window.addEventListener('storage',ev=>{
    if(ev.key===STATE_KEY){const s=migrate(getJSON(STATE_KEY,null));if(s){state=s;showWords=false;editing=null;render();}}
    if(ev.key===CUSTOM_KEY){custom=cleanList(getJSON(CUSTOM_KEY,[]));render();}
  });

  save();render();
})();
