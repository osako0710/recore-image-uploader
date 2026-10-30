// ラベルの読み取り（2回続けて同じ値で確定）と、番号の手入力を、公開する画面の関数で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var app=new Function(pick('normCode')+'\n'+pick('manualCode')+'\n'+pick('confirmRead')+'\nreturn {manualCode:manualCode,confirmRead:confirmRead};')();
test('同じ値を2回続けて読めたときだけ番号を確定する',function(){
  var last={text:'',count:0},r;
  r=app.confirmRead(last,'BU-00984099');assert.strictEqual(r.text,'');
  r=app.confirmRead(r.last,'BU-00984099');assert.strictEqual(r.text,'BU-00984099');
  assert.deepStrictEqual(r.last,{text:'',count:0});
});
test('途中で違う値を読んだら数え直す',function(){
  var r=app.confirmRead({text:'',count:0},'BU-00984099');
  r=app.confirmRead(r.last,'BU-00984098');assert.strictEqual(r.text,'');
  r=app.confirmRead(r.last,'BU-00984098');assert.strictEqual(r.text,'BU-00984098');
  assert.strictEqual(app.confirmRead({text:'',count:0},'  ').text,'');
});
test('読み取りはマクサスと同じ部品を自分の置き場から読む',function(){
  assert.ok(html.indexOf('vendor/barcode-detector_3.2.2/ponyfill.js')>=0);
  assert.ok(html.indexOf("'vendor/zxing/'+api.ZXING_WASM_VERSION+'/'")>=0);
  assert.ok(fs.existsSync(path.join(__dirname,'..','vendor','zxing','3.1.3','zxing_reader.wasm')));
  assert.ok(html.indexOf('html5-qrcode')<0,'古い読み取り部品を読まない');
  assert.ok(/width:\{ideal:1280\},height:\{ideal:720\}/.test(html),'カメラは 1280x720');
});
test('読んだ番号は確かめてから進む',function(){
  assert.ok(html.indexOf('id="read-no"')>=0&&html.indexOf('この番号で進む')>=0&&html.indexOf('読み直す')>=0);
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
test('古い窓口に送るときは番号と白抜きの項目を外す',function(){
  var f=new Function(pick('withoutNewFields')+'\nreturn withoutNewFields;')();
  assert.deepStrictEqual(f({action:'save',client_id:'x',label:'BU-1',whiteout:true,memo:''}),{action:'save',client_id:'x',memo:''});
});
