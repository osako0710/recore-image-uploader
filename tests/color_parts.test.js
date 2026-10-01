// 色の値の読み方と、色名を打つ欄が無いことを確かめる
// 実行: node --test tests/
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','physcheck_app_20260930_v3.html'),'utf8');

// 画面のファイルから、関数の本体をそのまま取り出す（写しを持たない）
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
var names=['colorParts','colorJoin','colorSum'];
var app=new Function(names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();

test('色ごとの数が付いた値は色ごとに分かれる',function(){
  assert.deepStrictEqual(app.colorParts('青×1・黄×2'),[{c:'青',n:1},{c:'黄',n:2}]);
  assert.strictEqual(app.colorSum(app.colorParts('青×1・黄×2')),3);
  assert.strictEqual(app.colorJoin(app.colorParts('青×1・黄×2')),'青×1・黄×2');
});

test('1 色の値は 1 色のまま',function(){
  assert.deepStrictEqual(app.colorParts('青'),[{c:'青',n:null}]);
  assert.deepStrictEqual(app.colorParts(''),[]);
});

test('「×数」の無い部分が混じる値は、分けずに 1 つの色名として扱う',function(){
  assert.deepStrictEqual(app.colorParts('黒・白'),[{c:'黒・白',n:null}]);
  assert.deepStrictEqual(app.colorParts('青×1・黒'),[{c:'青×1・黒',n:null}]);
  assert.strictEqual(app.colorJoin(app.colorParts('黒・白')),'黒・白');
});

var COLORS=JSON.parse(/var COLORS=(\[[^\]]+\])/.exec(html)[1].replace(/'/g,'"'));

test('「その他」を含む 2 色は、開き直しても同じに戻る',function(){
  var saved=app.colorJoin([{c:'青',n:1},{c:'その他',n:1}]);
  assert.strictEqual(saved,'青×1・その他×1');
  assert.deepStrictEqual(app.colorParts(saved),[{c:'青',n:1},{c:'その他',n:1}]);
  assert.deepStrictEqual(app.colorParts('その他'),[{c:'その他',n:null}]);
});

test('色ボタンから作った値は、ボタンの色名だけでできている',function(){
  assert.ok(COLORS.indexOf('その他')>=0);
  var saved=app.colorJoin(COLORS.map(function(c,i){return {c:c,n:i+1};}));
  app.colorParts(saved).forEach(function(p){assert.ok(COLORS.indexOf(p.c)>=0,p.c);});
});

test('色名を打つ欄と、色名の置き換えが画面に無い',function(){
  assert.ok(html.indexOf('data-k="color"')<0);
  assert.ok(html.indexOf('function colorName(')<0);
});
