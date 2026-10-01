// 箱ごと確認で、写真を付ける行にほかの端末が先に写真を付けていたときの写真の決め方を確かめる
// 実行: node --test tests/
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','physcheck_app_20261001_v6.html'),'utf8');

// 画面のファイルから、関数の行をそのまま取り出す（写しを持たない）
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
var app=new Function('var ST={view:""},bh=null,draft=null,draftKey=null;\n'+pick('bhImages')+'\n'+pick('bhMine')+
  '\nreturn {bhImages:bhImages,bhMine:bhMine,set:function(v,b,d,k){ST.view=v;bh=b;draft=d;draftKey=k;}};')();

test('ほかの端末が触っていなければ、この画面の写真がそのまま付く',function(){
  assert.deepStrictEqual(app.bhImages(['a'],['a'],['a','b'],12),['a','b']);
  assert.deepStrictEqual(app.bhImages(undefined,[],['b'],12),['b']);
});
test('ほかの端末が先に付けた写真は残り、撮った写真が後ろに足される',function(){
  assert.deepStrictEqual(app.bhImages(['x','y'],[],['b'],12),['x','y','b']);
  assert.deepStrictEqual(app.bhImages(['a','x'],['a'],['a','b'],12),['a','x','b']);
});
test('この画面で外した写真は戻らない',function(){
  assert.deepStrictEqual(app.bhImages(['a','c','x'],['a','c'],['c','b'],12),['c','x','b']);
});
test('同じ写真を二重に付けない',function(){
  assert.deepStrictEqual(app.bhImages(['b'],[],['b'],12),['b']);
});
test('上限を超えるときは null を返す',function(){
  assert.strictEqual(app.bhImages(['x','y'],[],['b'],2),null);
  assert.deepStrictEqual(app.bhImages(['x'],[],['b'],2),['x','b']);
});
test('箱ごと確認の画面で撮った写真だけを自分の写真として扱う',function(){
  app.set('boxhelp',{old:['a']},{images:['a','b']},'k1');
  assert.strictEqual(app.bhMine('k1','b'),true);
  assert.strictEqual(app.bhMine('k1','a'),false); // 開く前からあった写真
  assert.strictEqual(app.bhMine('k2','b'),false); // 別の行
  assert.strictEqual(app.bhMine('k1','z'),false); // この画面に無い写真
  app.set('edit',{old:['a']},{images:['a','b']},'k1');
  assert.strictEqual(app.bhMine('k1','b'),false); // 箱ごと確認の画面ではない
  app.set('boxhelp',null,{images:['b']},'k1');
  assert.strictEqual(app.bhMine('k1','b'),false);
});
