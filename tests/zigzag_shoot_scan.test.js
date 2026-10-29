// ラベルの読み取り範囲と、番号の手入力を、公開する画面の関数で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var app=new Function(pick('normCode')+'\n'+pick('manualCode')+'\n'+pick('scanCrop')+'\nreturn {manualCode:manualCode,scanCrop:scanCrop};')();
test('読み取りはカメラの元の解像度で枠の部分を切り出す',function(){
  // 縦持ち 1080x1920 の映像を 390x600 の画面に cover で出す
  var box=app.scanCrop(1080,1920,390,600,1280);
  assert.ok(box.dw>=900,'枠の幅を元の解像度のまま解析する: '+box.dw);
  assert.strictEqual(box.dw,box.sw);
  assert.ok(box.sx>=0&&box.sy>=0&&box.sx+box.sw<=1080&&box.sy+box.sh<=1920);
});
test('切り出しが大きすぎるときは上限の幅に縮める',function(){
  var box=app.scanCrop(3840,2160,390,600,1280);
  assert.strictEqual(box.dw,1280);
  assert.ok(box.sx+box.sw<=3840&&box.sy+box.sh<=2160);
});
test('手入力は種類と数字からラベルの番号を作る',function(){
  assert.strictEqual(app.manualCode('PKGI','01053466'),'PKGI-01053466');
  assert.strictEqual(app.manualCode('PKGI','1053466'),'PKGI-01053466');
  assert.strictEqual(app.manualCode('BU',' 731744 '),'BU-00731744');
  assert.strictEqual(app.manualCode('PKG','０４５６０３８'),'PKG-00456038');
});
test('手入力で数字以外や9桁以上は受け付けない',function(){
  assert.strictEqual(app.manualCode('PKGI',''),'');
  assert.strictEqual(app.manualCode('PKGI','12a4'),'');
  assert.strictEqual(app.manualCode('BU','123456789'),'');
});
test('その他は書かれた番号をそのまま使う',function(){
  assert.strictEqual(app.manualCode('other','rog-001-1-1'),'ROG-001-1-1');
  assert.strictEqual(app.manualCode('other','bu00731744'),'BU-00731744');
  assert.strictEqual(app.manualCode('other','a'),'');
});
