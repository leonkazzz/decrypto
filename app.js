(function(){
  'use strict';
  const E=window.DecryptoEngine;
  // 存储键沿用旧版，升级后老玩家的本地存档仍可继续使用。
  const STATE_KEY='cipherdesk_2026_game_state';
  const CUSTOM_KEY='cipherdesk_2026_custom_vocabulary';
  const RECENT_KEY='cipherdesk_2026_recent_games';
  const MAX_ROUNDS=8, WIN_TOKENS=2;
  const TEAMS={red:'红队',blue:'蓝队'};
  const $=id=>document.getElementById(id);
  const safe=val=>String(val).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function getJSON(key,fallback){try{let t=localStorage.getItem(key);return t?JSON.parse(t):fallback;}catch{return fallback;}}
  let storageWarned=false;
  function setJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{if(!storageWarned){storageWarned=true;notify('无法写入浏览器存储，刷新后数据会丢失。请退出隐私模式或检查浏览器权限。',true);}return false;}}
  let toastTimer=null;
  function notify(msg,error=false){const el=$('toast');el.textContent=msg;el.classList.toggle('error',error);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3900);}

  let custom=E.unique((()=>{const c=getJSON(CUSTOM_KEY,[]);return Array.isArray(c)?c.filter(x=>typeof x==='string'):[];})());
  let recent=getJSON(RECENT_KEY,[]);if(!Array.isArray(recent))recent=[];
  const builtinTotal=E.combinePool(window.BUILTIN_WORDS,[],'builtin').length;

  const emptyScore=()=>({red:{intercept:0,miss:0},blue:{intercept:0,miss:0}});
  function validState(s){return !!s&&['prepare','active'].includes(s.phase)&&['builtin','custom','mixed'].includes(s.mode)&&E.isValidGroups(s.words)&&Number.isInteger(s.round)&&s.round>=0&&s.round<=MAX_ROUNDS;}
  // 补齐旧版存档缺少的字段，并修复损坏的密码 / 比分。
  function migrate(s){
    if(!validState(s))return null;
    if(s.phase==='prepare'){s.round=0;s.codes={red:null,blue:null};}
    else{
      if(s.round<1)s.round=1;
      if(!s.codes||!E.isValidCode(s.codes.red)||!E.isValidCode(s.codes.blue))s.codes={red:E.code(),blue:E.code()};
    }
    const sc=emptyScore();
    for(const t of ['red','blue'])for(const k of ['intercept','miss']){const v=s.score?.[t]?.[k];sc[t][k]=Number.isInteger(v)&&v>=0&&v<=9?v:0;}
    s.score=sc;
    s.history=Array.isArray(s.history)?s.history.filter(h=>h&&Number.isInteger(h.round)&&E.isValidCode(h.red)&&E.isValidCode(h.blue)):[];
    return s;
  }
  function pool(mode){return E.combinePool(window.BUILTIN_WORDS,custom,mode);}
  function lastWords(){return recent.flatMap(x=>Array.isArray(x)?x:[]);}
  function newState(mode='builtin'){
    return {phase:'prepare',mode,round:0,words:E.drawEight(pool(mode),lastWords()),codes:{red:null,blue:null},score:emptyScore(),history:[],createdAt:new Date().toISOString()};
  }
  let state=migrate(getJSON(STATE_KEY,null));
  if(!state){
    try{state=newState(getJSON(STATE_KEY,null)?.mode==='mixed'?'mixed':'builtin');}catch{state=newState('builtin');}
  }

  // 隐私：刷新页面、切换队伍、切到后台后都自动遮住密词和密码；显示状态永不存档。
  let team='red',showWords=false,showCode=false,editing=null;
  function save(){setJSON(STATE_KEY,state);}
  function currentWords(){return state.words[team];}
  function result(){
    const s=state.score;
    const notes=[];
    for(const t of ['red','blue']){
      const other=t==='red'?'blue':'red';
      if(s[t].intercept>=WIN_TOKENS)notes.push(`${TEAMS[t]}拦截成功 ${s[t].intercept} 次，${TEAMS[t]}获胜！`);
      if(s[t].miss>=WIN_TOKENS)notes.push(`${TEAMS[t]}传达失误 ${s[t].miss} 次，${TEAMS[other]}获胜！`);
    }
    if(notes.length>1)return '双方同时达成胜负条件：按规则用「拦截成功 − 传达失误」比较总分，仍平局则互猜对方4个密词，猜中多者胜。';
    if(notes.length)return notes[0];
    if(state.phase==='active'&&state.round>=MAX_ROUNDS)return `已完成 ${MAX_ROUNDS} 轮且无人提前获胜：用「拦截成功 − 传达失误」比较总分，仍平局则互猜对方4个密词。`;
    return '';
  }
  function redraw(){
    const started=state.phase==='active';
    const ending=result();
    $('phasePill').textContent=started?'词语已锁定':'准备阶段';
    $('phasePill').classList.toggle('done',started);
    $('gameRound').textContent=started?`第 ${state.round} / ${MAX_ROUNDS} 轮`:'尚未开始';
    $('totalCount').textContent=builtinTotal.toLocaleString('zh-CN');
    $('customCount').textContent=custom.length.toString();
    $('mode').value=state.mode;$('mode').disabled=started;
    $('mode').options[0].textContent=`仅内置词库（${builtinTotal}词）`;
    $('modeHint').textContent=started?'已开局，抽词模式已锁定。':{builtin:`只从${builtinTotal}个内置词中抽取。`,custom:`只从你的${custom.length}个自定义词中抽取，至少需要8个。`,mixed:'内置词与自定义词一起参与随机抽取。'}[state.mode];
    $('tabRed').className=`tab ${team==='red'?'active-red':''}`;
    $('tabBlue').className=`tab ${team==='blue'?'active-blue':''}`;
    $('tabRed').setAttribute('aria-pressed',String(team==='red'));
    $('tabBlue').setAttribute('aria-pressed',String(team==='blue'));
    $('teamPanel').className=`panel team-${team}`;
    $('teamName').textContent=TEAMS[team];
    $('teamPrivateNotice').textContent=`只向${TEAMS[team]}展示这4个词`;
    $('wordRevealBtn').textContent=showWords?'隐藏本队密词':'查看本队密词';
    $('wordRevealBtn').setAttribute('aria-pressed',String(showWords));
    $('wordActionsHelp').textContent=started?'已开局：本局8个密词已锁定，不可再修改或重抽。':'准备阶段：点「查看本队密词」后，可以单张重抽或手动修改。';
    $('wordGrid').innerHTML=currentWords().map((word,i)=>{
      const editingThis=editing===i && !started && showWords;
      const content=showWords?safe(word):'••••';
      let actions='';
      if(editingThis){actions=`<div class="word-actions editing"><input id="editingInput" aria-label="修改 ${i+1} 号词" maxlength="${E.MAX_LEN}" value="${safe(word)}" autocomplete="off" enterkeyhint="done"><button type="button" class="btn btn-small" data-action="save-edit" data-index="${i}">保存</button><button type="button" class="btn btn-small btn-ghost" data-action="cancel-edit">取消</button></div>`;}
      else if(!started&&showWords){actions=`<div class="word-actions"><button type="button" class="btn" data-action="replace" data-index="${i}" aria-label="重抽 ${i+1} 号词">↻ 重抽</button><button type="button" class="btn" data-action="edit" data-index="${i}" aria-label="修改 ${i+1} 号词">✎ 修改</button></div>`;}
      return `<div class="word"><div class="word-index">密词 0${i+1}</div><div class="word-content ${showWords?'':'covered'}">${content}</div>${actions}</div>`;
    }).join('');
    if(editing!==null && $('editingInput')){$('editingInput').focus();$('editingInput').select();}
    const digits=state.codes?.[team];
    const reveal=showCode&&started&&E.isValidCode(digits);
    $('codeCaption').textContent=!started?'正式开始后生成第1轮密码':`第 ${state.round} 轮 · ${TEAMS[team]}加密员专用`;
    $('codeDigits').innerHTML=[0,1,2].map(i=>`<div class="digit ${reveal?'':'hidden'}">${reveal?digits[i]:'?'}</div>`).join('');
    $('codeBtn').textContent=showCode?'隐藏密码':'查看密码';
    $('codeBtn').disabled=!started;
    $('codeBtn').setAttribute('aria-pressed',String(showCode));
    $('codeHelp').textContent=!started?'每轮两队各有一组三位密码（数字 1–4 不重复），开局后才能查看。':state.round===1?'第一轮双方只解密，不进行拦截。':'从第二轮开始，对手先报拦截猜测，本队再报解密猜测，最后揭晓密码。';
    $('startBtn').hidden=started;
    $('nextBtn').hidden=!started;
    $('nextBtn').disabled=state.round>=MAX_ROUNDS||!!ending;
    $('nextBtn').textContent=ending?'本局已分出结果':state.round>=MAX_ROUNDS?`已完成${MAX_ROUNDS}轮`:'下一轮 · 生成新密码';
    $('progressHint').textContent=ending?'点右侧「准备新一局」开始下一局。':started?'词语已锁定；每轮更换密码，不更换密词。':'确认双方四个词后，再正式开始。';
    renderScore(ending,started);
    renderCustom();
  }
  function renderScore(ending,started){
    for(const t of ['red','blue'])for(const k of ['intercept','miss'])$(`score-${t}-${k}`).textContent=state.score[t][k];
    document.querySelectorAll('[data-score]').forEach(b=>{
      const [t,k,d]=b.dataset.score.split('.');const v=state.score[t][k];
      b.disabled=!started||(d==='-1'?v<=0:v>=9);
    });
    $('winBanner').hidden=!ending;$('winBanner').textContent=ending;
    const list=$('historyList');
    list.innerHTML=state.history.length?state.history.map(h=>`<div class="history-row"><span>第 ${h.round} 轮</span><span class="h-red">红 ${h.red.join('')}</span><span class="h-blue">蓝 ${h.blue.join('')}</span></div>`).join(''):'<span class="tiny">每进入下一轮，上一轮的密码会记录在这里（此时已当众公布）。</span>';
  }
  function renderCustom(){
    const box=$('customTags');
    $('customListCaption').textContent=`已保存 ${custom.length} 个自定义词（保存在当前浏览器）`;
    $('customClearBtn').disabled=!custom.length;
    $('wordDownloadBtn').disabled=!custom.length;
    if(!custom.length){box.innerHTML='<span class="tiny">暂无自定义词，可以在上方批量添加。</span>';return;}
    box.innerHTML=custom.map((w,i)=>`<span class="tag">${safe(w)}<button type="button" data-custom-index="${i}" aria-label="删除自定义词 ${safe(w)}">×</button></span>`).join('');
  }
  function hideSecrets(){showWords=false;showCode=false;editing=null;}
  function download(name,text,type){
    const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function addCustom(text){
    const {terms,tooLong}=E.parseBatch(text);
    if(!terms.length&&!tooLong.length){notify('没有找到可添加的词语。',true);return false;}
    const existing=new Set(custom),before=custom.length;
    for(const w of terms){if(!existing.has(w)){custom.push(w);existing.add(w);}}
    setJSON(CUSTOM_KEY,custom);redraw();
    const added=custom.length-before,dup=terms.length-added;
    let msg=`新增 ${added} 个词`;
    if(dup)msg+=`，${dup} 个重复已跳过`;
    if(tooLong.length)msg+=`，${tooLong.length} 个超过${E.MAX_LEN}字未添加（如「${tooLong[0].slice(0,10)}…」）`;
    notify(msg+'。',!added);
    return true;
  }

  $('tabRed').addEventListener('click',()=>{team='red';hideSecrets();redraw();});
  $('tabBlue').addEventListener('click',()=>{team='blue';hideSecrets();redraw();});
  $('wordRevealBtn').addEventListener('click',()=>{showWords=!showWords;showCode=false;editing=null;redraw();});
  $('codeBtn').addEventListener('click',()=>{showCode=!showCode;showWords=false;editing=null;redraw();});
  $('wordGrid').addEventListener('click',ev=>{
    const b=ev.target.closest('button[data-action]');if(!b || state.phase!=='prepare')return;
    const action=b.dataset.action,index=Number(b.dataset.index);
    if(action==='edit'){editing=index;redraw();return;}
    if(action==='cancel-edit'){editing=null;redraw();return;}
    if(action==='save-edit'){
      try{state.words=E.editSlot(state.words,team,index,$('editingInput').value);editing=null;save();redraw();notify('密词已修改。');}
      catch(e){notify(e.message,true);}
      return;
    }
    if(action==='replace'){
      try{state.words=E.replaceSlot(state.words,team,index,pool(state.mode),lastWords());editing=null;save();redraw();notify('只重抽了这一张词卡，其他7张保持不变。');}
      catch(e){notify(e.message,true);}
    }
  });
  $('wordGrid').addEventListener('keydown',ev=>{
    if(ev.target.id!=='editingInput')return;
    if(ev.key==='Enter'){ev.preventDefault();const b=$('wordGrid').querySelector('[data-action="save-edit"]');if(b)b.click();}
    if(ev.key==='Escape'){ev.preventDefault();editing=null;redraw();}
  });
  $('mode').addEventListener('change',ev=>{
    if(state.phase==='active'){ev.target.value=state.mode;notify('已经开局，不能切换抽词模式。',true);return;}
    const next=ev.target.value;
    if(next===state.mode)return;
    if(!confirm('切换抽词模式会重新抽取本局全部8个词，是否继续？')){ev.target.value=state.mode;return;}
    try{const words=E.drawEight(pool(next),lastWords());state.mode=next;state.words=words;hideSecrets();save();redraw();notify('抽词模式已切换，8张词卡已重新生成。');}
    catch(e){ev.target.value=state.mode;notify(e.message,true);}
  });
  $('startBtn').addEventListener('click',()=>{
    if(state.phase!=='prepare')return;
    if(!E.isValidGroups(state.words)){notify('两队共8个密词必须全部不同。',true);return;}
    if(!confirm('正式开始后，所有8个密词将被锁定，不能修改或重抽。确认开始吗？'))return;
    state.phase='active';state.round=1;state.codes={red:E.code(),blue:E.code()};state.score=emptyScore();state.history=[];
    hideSecrets();save();redraw();notify('游戏开始！第1轮密码已经生成。');
  });
  $('nextBtn').addEventListener('click',()=>{
    if(state.phase!=='active'||state.round>=MAX_ROUNDS||result())return;
    if(!confirm('确定双方都已完成本轮、并已公布真实密码？进入下一轮后密码会更新。'))return;
    state.history.push({round:state.round,red:state.codes.red,blue:state.codes.blue});
    state.round+=1;state.codes={red:E.code(),blue:E.code()};hideSecrets();save();redraw();notify(`已进入第 ${state.round} 轮。`);
  });
  $('scorePanel').addEventListener('click',ev=>{
    const b=ev.target.closest('button[data-score]');if(!b||state.phase!=='active')return;
    const [t,k,d]=b.dataset.score.split('.');
    const v=state.score[t][k]+Number(d);if(v<0||v>9)return;
    state.score[t][k]=v;save();redraw();
  });
  $('newGameBtn').addEventListener('click',()=>{
    if(!confirm('重新开局会替换当前8个词和本局密码、比分。自定义词库不会清空。确定继续吗？'))return;
    try{
      recent.unshift([...state.words.red,...state.words.blue]);recent=recent.slice(0,5);setJSON(RECENT_KEY,recent);
      let mode=state.mode,fellBack=false;
      if(pool(mode).length<8){mode='builtin';fellBack=true;}
      state=newState(mode);hideSecrets();team='red';save();redraw();
      notify(fellBack?'自定义词不足8个，已改用内置词库开新局。':'新一局已就绪，可以继续调整密词。',fellBack);
    }catch(e){notify(e.message,true);}
  });
  $('customAddBtn').addEventListener('click',()=>{if(addCustom($('customInput').value))$('customInput').value='';});
  $('customFileInput').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    try{
      if(file.size>2*1024*1024)throw new Error('文件太大（上限 2MB）。');
      addCustom(await file.text());
    }catch(e){notify(e.message||'无法读取文件。',true);}finally{ev.target.value='';}
  });
  $('customTags').addEventListener('click',ev=>{
    const b=ev.target.closest('button[data-custom-index]');if(!b)return;
    const i=Number(b.dataset.customIndex),word=custom[i];
    if(word===undefined||!confirm(`从自定义词库删除「${word}」？已抽到的当前词卡不会变化。`))return;
    custom.splice(i,1);setJSON(CUSTOM_KEY,custom);redraw();notify('已从自定义词库删除。');
  });
  $('customClearBtn').addEventListener('click',()=>{
    if(!custom.length||!confirm(`确定清空全部 ${custom.length} 个自定义词？建议先导出备份。当前词卡不会变化。`))return;
    custom=[];setJSON(CUSTOM_KEY,custom);redraw();notify('自定义词库已清空。');
  });
  $('wordDownloadBtn').addEventListener('click',()=>{
    if(!custom.length)return;
    download('decrypto_自定义词库.txt',custom.join('\n')+'\n','text/plain;charset=utf-8');
  });
  $('backupBtn').addEventListener('click',()=>{
    const data={app:'cipherdesk-2026',version:2,exportedAt:new Date().toISOString(),state,custom,recent};
    download('decrypto_主持人存档.json',JSON.stringify(data,null,2),'application/json');
    notify('存档已下载。注意：文件含两队秘密词和密码，请勿发给队员。');
  });
  $('restoreInput').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];if(!file)return;
    try{
      const d=JSON.parse(await file.text());
      const restored=d&&d.app==='cipherdesk-2026'&&[1,2].includes(d.version)?migrate(d.state):null;
      if(!restored||!Array.isArray(d.custom)||!Array.isArray(d.recent))throw new Error('存档格式不正确。');
      if(!confirm('导入会替换本机当前游戏、自定义词库和近期记录。确定继续吗？'))return;
      state=restored;custom=E.unique(d.custom.filter(x=>typeof x==='string'));recent=d.recent.filter(Array.isArray).slice(0,5);
      save();setJSON(CUSTOM_KEY,custom);setJSON(RECENT_KEY,recent);hideSecrets();team='red';redraw();notify('存档恢复成功。');
    }catch(e){notify(e instanceof SyntaxError?'无法读取存档：不是有效的 JSON 文件。':(e.message||'无法读取存档。'),true);}finally{ev.target.value='';}
  });
  // 切到后台或锁屏时自动遮盖，防止回来时被旁人看到。
  document.addEventListener('visibilitychange',()=>{ if(document.hidden){hideSecrets();redraw();} });
  // 另一个标签页改了存档时同步过来，避免两个标签页互相覆盖。
  window.addEventListener('storage',ev=>{
    if(ev.key===STATE_KEY){const s=migrate(getJSON(STATE_KEY,null));if(s){state=s;hideSecrets();redraw();}}
    if(ev.key===CUSTOM_KEY){const c=getJSON(CUSTOM_KEY,[]);custom=Array.isArray(c)?E.unique(c.filter(x=>typeof x==='string')):[];redraw();}
  });
  save();redraw();
})();
