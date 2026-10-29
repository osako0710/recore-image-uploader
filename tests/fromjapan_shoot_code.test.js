// Fromjapan 撮影画面の8桁番号の扱いと、主ボタンの状態を公開する画面の関数で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','fromjapan_shoot_20261029_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var app=new Function(pick('normCode')+'\n'+pick('codeDigits')+'\n'+pick('formatCode')+'\n'+pick('primaryState')+'\nreturn {normCode:normCode,codeDigits:codeDigits,formatCode:formatCode,primaryState:primaryState};')();
test('8桁の数字だけを番号として受け付ける',function(){
  assert.strictEqual(app.normCode('24130242'),'24130242');
  assert.strictEqual(app.normCode('2413 0242'),'24130242');
  assert.strictEqual(app.normCode('2413-0242'),'24130242');
  assert.strictEqual(app.normCode('２４１３０２４２'),'24130242');
  assert.strictEqual(app.normCode('2413024'),'');
  assert.strictEqual(app.normCode('241302421'),'');
  assert.strictEqual(app.normCode('2413O242'),'');
  assert.strictEqual(app.normCode(''),'');
});
test('入力中は数字だけを8桁まで残し、4桁ごとに区切って見せる',function(){
  assert.strictEqual(app.codeDigits('24a13 02'),'241302');
  assert.strictEqual(app.codeDigits('１２３４５６７８９'),'12345678');
  assert.strictEqual(app.formatCode('2413'),'2413');
  assert.strictEqual(app.formatCode('24130'),'2413 0');
  assert.strictEqual(app.formatCode('24130242'),'2413 0242');
});
test('番号の入力中は8桁がそろうまで主ボタンを押せない',function(){
  assert.deepStrictEqual(app.primaryState({stage:'code',codeReady:false,workerValid:true}),{action:'code',label:'この番号で進む',enabled:false});
  assert.deepStrictEqual(app.primaryState({stage:'code',codeReady:true,workerValid:true}),{action:'code',label:'この番号で進む',enabled:true});
  assert.strictEqual(app.primaryState({stage:'code',codeReady:true,workerValid:false}).enabled,false);
});
test('写真が2枚そろうまでは撮影、そろえば登録が主ボタンになる',function(){
  assert.strictEqual(app.primaryState({stage:'photos',photos:1}).label,'写真を撮る（あと1枚）');
  assert.deepStrictEqual(app.primaryState({stage:'photos',photos:2,ready:false,waiting:'この番号は登録済みです'}),{action:'save',label:'この番号は登録済みです',enabled:false});
  assert.deepStrictEqual(app.primaryState({stage:'photos',photos:2,ready:true,waiting:''}),{action:'save',label:'登録して次へ',enabled:true});
  assert.strictEqual(app.primaryState({stage:'receipt'}).label,'次の商品へ');
});
