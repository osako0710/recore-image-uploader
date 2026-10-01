// 番号の読み替えを、公開中の作業リストにある箱 1 つ・商品 1 つの別表記で確かめる
// 実行: node --test tests/
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var ROOT=path.join(__dirname,'..');
var html=fs.readFileSync(path.join(ROOT,'physcheck_app_20261001_v5.html'),'utf8');

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
var names=['num','parseCSV','csvToItems','parseFields','normCode','findCode'];
var app=new Function(names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();

var csvName=/var CSV_URL='([^']+)'/.exec(html)[1];
var items=app.csvToItems(fs.readFileSync(path.join(ROOT,csvName),'utf8'));
var BOX='BU-00731744',ITEM='PKGI-01930770';

test('作業リストに確かめる箱と商品がある',function(){
  assert.ok(items.length>0);
  assert.ok(items.some(function(it){return it['箱']===BOX;}));
  assert.strictEqual(items.filter(function(it){return it['PKGI']===ITEM;}).length,1);
});

var boxForms={'そのまま':'BU-00731744','小文字':'bu-00731744','空白入り':' BU - 0073 1744 ','ハイフンなし':'BU00731744','0 落ち':'BU-731744','小文字・ハイフンなし・0 落ち':'bu731744'};
Object.keys(boxForms).forEach(function(label){
  test('箱の番号（'+label+'）で箱が開く',function(){
    var hit=app.findCode(items,boxForms[label]);
    assert.strictEqual(hit.code,BOX);
    assert.ok(hit.box.length>0);
    assert.ok(hit.box.every(function(it){return it['箱']===BOX;}));
    assert.strictEqual(hit.one.length,0);
  });
});

var itemForms={'そのまま':'PKGI-01930770','小文字':'pkgi-01930770','空白入り':'PKGI 0193 0770\n','ハイフンなし':'PKGI01930770','0 落ち':'PKGI-1930770','小文字・ハイフンなし・0 落ち':'pkgi1930770'};
Object.keys(itemForms).forEach(function(label){
  test('商品の番号（'+label+'）で商品が開く',function(){
    var hit=app.findCode(items,itemForms[label]);
    assert.strictEqual(hit.code,ITEM);
    assert.strictEqual(hit.box.length,0);
    assert.strictEqual(hit.one.length,1);
    assert.strictEqual(hit.one[0]['PKGI'],ITEM);
  });
});

test('作業リストに無い番号はどれにも当たらない',function(){
  var hit=app.findCode(items,'bu-99999999');
  assert.strictEqual(hit.code,'BU-99999999');
  assert.strictEqual(hit.box.length+hit.one.length+hit.bag.length,0);
});
