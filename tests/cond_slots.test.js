// 状態の内訳・写真と問題の結び付け・保存する形・1 行の大きさを確かめる
// 実行: node --test tests/
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','physcheck_app_20261001_v6.html'),'utf8');

// 画面のファイルから、関数と定数の行をそのまま取り出す（写しを持たない）
function pick(name){
  var s=html.indexOf('\nfunction '+name+'(');
  if(s<0)throw new Error('関数が見つかりません: '+name);
  var i=html.indexOf('{',s),d=0;
  for(;i<html.length;i++){
    if(html[i]==='{')d++;
    else if(html[i]==='}'){d--;if(!d)return html.slice(s,i+1);}
  }
  throw new Error('関数の終わりが見つかりません: '+name);
}
function pickVar(name){
  var s=html.indexOf('\nvar '+name+'=');
  if(s<0)throw new Error('定数が見つかりません: '+name);
  return html.slice(s,html.indexOf('\n',s+1));
}
var vars=['SLOTS','CONDS','COND_BAD','COND_ASK','PROBS','PROB_PHOTO','PLACES','MISSING','COND_LABEL','SHIPS','ISSUE_MIX','ISSUES','ROW_MAX','PHOTO_MAX','LONG_FIELDS'];
var fns=['labelMap','condBad','colorParts','slotOf','slotImgs','slotName','pickSlot','kbGap','linksIn','linksOf','setLinks','photoProbs','unlinked','linkSync','needSlots','missSlots','slim','rowBytes','rowTooBig'];
var out=fns.concat(['CONDS','PROBS','PROB_PHOTO','PLACES','MISSING','ISSUES','ROW_MAX','PHOTO_MAX','SHIPS']);
var app=new Function('var draft;function activeFields(){return [];}\n'+pick('labelMap')+vars.map(pickVar).join('')+'\n'+fns.slice(1).map(pick).join('\n')+
  '\nreturn {set:function(d){draft=d;},'+out.map(function(n){return n+':'+n;}).join(',')+'};')();

function mk(o){
  var d=Object.assign({absent:false,color:'',colorHard:false,cond:'',condProblems:[],condPlaces:{},missingParts:[],images:[],slots:{},shipClass:'',shipIrregular:false},o);
  app.set(d);return d;
}

test('状態は 6 段階を別の値で持ち、前からある値を残す',function(){
  assert.deepStrictEqual(app.CONDS.map(function(x){return x[0];}),['new','opened','used','fair','damaged','bad']);
  assert.deepStrictEqual(app.SHIPS.map(function(x){return x[1];}),['60','80','100','140','160','160超']);
  assert.deepStrictEqual(app.SHIPS.map(function(x){return x[0];}),['60','80','100','140','160','over']);
});

test('傷や汚れがある 3 つの状態では内訳を残し、それ以外では落とす',function(){
  ['fair','damaged','bad'].forEach(function(c){
    mk({cond:c,condProblems:['dirt']});
    assert.deepStrictEqual(app.needSlots(),['f','b','d'],c);
    assert.deepStrictEqual(app.slim({cond:c,condProblems:['dirt'],condPlaces:{dirt:['hem']}}).condProblems,['dirt'],c);
  });
  ['new','opened','used'].forEach(function(c){
    mk({cond:c,condProblems:['dirt']});
    assert.deepStrictEqual(app.needSlots(),['f','b'],c);
    assert.strictEqual(app.slim({cond:c,condProblems:['dirt'],condPlaces:{dirt:['hem']}}).condProblems,undefined,c);
  });
});

test('におい・付属品の欠けだけなら、傷の写真は要らない',function(){
  mk({cond:'damaged',condProblems:['smell','missing']});
  assert.deepStrictEqual(app.needSlots(),['f','b']);
  assert.deepStrictEqual(app.unlinked(),[]);
});

test('汚れ・傷・破れやこわれは、問題ごとに写真が要る',function(){
  var d=mk({cond:'damaged',condProblems:['scratch','dirt'],images:['a.jpg','b.jpg','c.jpg'],slots:{'a.jpg':'f','b.jpg':'b','c.jpg':'d:dirt'}});
  assert.deepStrictEqual(app.needSlots(),['f','b','d']);
  assert.deepStrictEqual(app.missSlots(),[]);
  assert.deepStrictEqual(app.unlinked(),['scratch']);
  app.setLinks('c.jpg',['dirt','scratch']); // 1 枚に 2 つ写っている
  assert.strictEqual(d.slots['c.jpg'],'d:dirt+scratch');
  assert.deepStrictEqual(app.unlinked(),[]);
});

test('問題が 1 つだけなら、傷の枠の写真は自動でその問題の写真になる',function(){
  var d=mk({cond:'damaged',condProblems:['broken','smell'],images:['c.jpg'],slots:{'c.jpg':'d'}});
  assert.deepStrictEqual(app.unlinked(),['broken']);
  app.linkSync();
  assert.strictEqual(d.slots['c.jpg'],'d:broken');
  assert.deepStrictEqual(app.unlinked(),[]);
});

test('問題を外したら、その問題との結び付きも外れる',function(){
  var d=mk({cond:'damaged',condProblems:['dirt','broken'],images:['c.jpg'],slots:{'c.jpg':'d:dirt+scratch'}});
  app.linkSync();
  assert.strictEqual(d.slots['c.jpg'],'d:dirt');
  assert.deepStrictEqual(app.unlinked(),['broken']);
});

test('前の形（結び付きの無い枠の値）もそのまま読める',function(){
  mk({images:['a.jpg','c.jpg'],slots:{'a.jpg':'f','c.jpg':'d'}});
  assert.strictEqual(app.slotOf('a.jpg'),'f');
  assert.strictEqual(app.slotOf('c.jpg'),'d');
  assert.deepStrictEqual(app.linksOf('c.jpg'),[]);
  assert.strictEqual(app.slotName('d:dirt'),'傷・汚れの所');
});

test('保存する形: 選んでいない内訳と前の項目名は残さない',function(){
  var o=app.slim({cond:'used',condProblems:['dirt'],condPlaces:{dirt:['hem']},missingParts:['box'],condParts:['タグ'],
    ship:'80',shipOdd:true,shipClass:'80',shipIrregular:false,colorHard:false,images:['c.jpg'],slots:{'c.jpg':'d:dirt','x.jpg':'f'}});
  assert.deepStrictEqual(o,{cond:'used',shipClass:'80',images:['c.jpg'],slots:{'c.jpg':'d'}});
  o=app.slim({cond:'damaged',condProblems:['dirt','missing'],condPlaces:{dirt:['hem','tag'],scratch:['front']},missingParts:['box','cable'],
    shipClass:'',shipIrregular:true,images:['c.jpg'],slots:{'c.jpg':'d:dirt+scratch'}});
  assert.deepStrictEqual(o,{cond:'damaged',condProblems:['dirt','missing'],condPlaces:{dirt:['hem','tag']},missingParts:['box','cable'],
    shipIrregular:true,images:['c.jpg'],slots:{'c.jpg':'d:dirt'}});
});

// 1 行の記録を作る。nD: 傷の枠の写真の枚数、linkAll: 傷の写真 1 枚に問題を全部結び付けるか
function bigRow(nPhoto,nD,linkAll,nProb,nPlace,nMissing,nIssue,color){
  var ids=function(a){return a.map(function(x){return x[0];});};
  var images=[],slots={},i,places={},probs=app.PROB_PHOTO.slice(0,nProb);
  for(i=1;i<=nPhoto;i++){
    var nm='PKGI-00012345_123_'+i+'.jpg';
    images.push(nm);slots[nm]=i===1?'f':i===2?'b':i>nPhoto-nD?'d:'+(linkAll?probs.join('+'):probs[i%nProb]):'x';
  }
  probs.forEach(function(p){places[p]=ids(app.PLACES).slice(0,nPlace);});
  return app.slim({absent:false,qty:9999,candidateOk:false,refUrl:'',color:color,
    size:'フリーサイズ',edition:'',setContents:'',expiry:'2026-12-31',storage:'高温多湿あり',condition:'開封済み未使用',hasLabel:'あり',
    images:images,issues:app.ISSUES.slice(0,nIssue),note:'',cond:'damaged',condProblems:probs.concat(['smell','missing']),condPlaces:places,
    missingParts:ids(app.MISSING).slice(0,nMissing),
    shipClass:'over',shipIrregular:true,colorHard:true,slots:slots,qtyScope:'box',checkedAt:'2026-10-01T12:34:56.789Z',skipped:true});
}
var COLOR8='ホワイト×99・ブラック×99・グレー×99・ネイビー×99・ベージュ×99・ブラウン×99・グリーン×99・その他×99';

test('ふつうの行と重めの現実的な行は、窓口の上限に収まる',function(t){
  var usual=app.rowBytes(bigRow(5,2,false,2,2,2,1,'青'));
  var heavy=app.rowBytes(bigRow(12,9,false,3,3,3,2,'青×1・黄×1'));
  t.diagnostic('ふつうの行: '+usual+' バイト／重めの行: '+heavy+' バイト（上限 '+app.ROW_MAX+'）');
  assert.ok(usual<=app.ROW_MAX,'ふつうの行が '+usual+' バイト');
  assert.ok(heavy<=app.ROW_MAX,'重めの行が '+heavy+' バイト');
});

test('上限を超える行は送る前に止まり、保存済みにならない',function(t){
  // 選ぶ欄を全部いちばん大きく埋めた行は、自由入力が空でも上限を超える
  var row=bigRow(app.PHOTO_MAX,9,true,3,10,9,8,COLOR8),n=app.rowBytes(row);
  t.diagnostic('選ぶ欄だけの最大: '+n+' バイト（上限 '+app.ROW_MAX+'）');
  assert.ok(n>app.ROW_MAX);
  var big=app.rowTooBig(row);
  assert.deepStrictEqual(big,{f:'note',msg:'この商品の記録が大きすぎて保存できません。担当者に伝えてください'});
  // 保存の処理は、止めたあとに記録を書かず、送る列にも入れない
  var c=pick('commit'),stop=c.indexOf('if(big){'),ret=c.indexOf('return false;',stop);
  assert.ok(stop>0&&ret>stop);
  assert.ok(c.indexOf('ST.results[k]=o')>ret&&c.indexOf('enqueue(k)')>ret);
  assert.strictEqual(app.rowTooBig(bigRow(5,2,false,2,2,2,1,'青')),null);
});

test('まとめて選んだ写真は、空いている枠へ順に入り、埋まったら別の角度に足す',function(){
  var d=mk({images:[],slots:{}}),got=[];
  ['a.jpg','b.jpg','c.jpg','e.jpg'].forEach(function(nm,i){
    d.images.push(nm);var use=app.pickSlot('f',i);d.slots[nm]=use;got.push(use);
  });
  assert.deepStrictEqual(got,['f','b','x','x']);
});
test('先に写真がある枠は飛ばす。傷の枠とメモ用は、選んだ所にそのまま入る',function(){
  var d=mk({images:['p.jpg','n.jpg'],slots:{'p.jpg':'b'}});
  assert.strictEqual(app.pickSlot('f',0),'f');
  d.slots['n.jpg']='f';
  assert.strictEqual(app.pickSlot('f',1),'x');
  assert.strictEqual(app.pickSlot('d',2),'d');
  assert.strictEqual(app.pickSlot('',2),'');
  assert.strictEqual(app.pickSlot(undefined,1),undefined);
});
test('画面の文言に絵文字を使わない（設定の歯車だけは記号として残す）',function(){
  var hit=(html.match(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu)||[]).filter(function(c){return c!=='\u2699';});
  assert.deepStrictEqual(hit,[]);
});
test('キーボードが出たら、その高さだけ下端の表示を上げる。拡大中と小さな変化では上げない',function(){
  assert.strictEqual(app.kbGap(812,476,0,1),336);
  assert.strictEqual(app.kbGap(812,400,76,1),336);
  assert.strictEqual(app.kbGap(812,812,0,1),0);
  assert.strictEqual(app.kbGap(812,762,0,1),0);
  assert.strictEqual(app.kbGap(812,406,100,2),0);
  assert.strictEqual(app.kbGap(812,NaN,0,1),0);
});
