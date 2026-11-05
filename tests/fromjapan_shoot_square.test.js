// Fromjapan の撮影画面でも、写真の形（4:3 / 1:1）を選べて 1:1 は中央を正方形に切り抜く
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','fromjapan_shoot_20261030_v2.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var names=['normalShape','cropRect'];
var app=new Function(names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();
test('Fromjapan: 形は 4:3 か 1:1 だけで、知らない値は 4:3 に戻す',function(){assert.strictEqual(app.normalShape('1:1'),'1:1');assert.strictEqual(app.normalShape('x'),'4:3');});
test('Fromjapan: 1:1 は横長でも縦長でも中央を正方形に切り抜く',function(){assert.deepStrictEqual(app.cropRect(4032,3024,'1:1'),{x:504,y:0,w:3024,h:3024});assert.deepStrictEqual(app.cropRect(3024,4032,'1:1'),{x:0,y:504,w:3024,h:3024});assert.deepStrictEqual(app.cropRect(1600,1200,'4:3'),{x:0,y:0,w:1600,h:1200});});
test('Fromjapan: 写真の欄に形の切り替えがあり、押すと切り抜き直す',function(){assert.ok(html.includes('aria-label="写真の形"'));assert.ok(html.includes("if(target.dataset.shape){setShape(target.dataset.shape);return;}"));assert.ok(html.includes("orig:orig"));});

test('Fromjapan: 形を変えている間は登録できない',function(){assert.ok(html.includes('function readyToSave(){return !_reshaping&&'));assert.ok(html.includes('}finally{_reshaping--;render();}'));});
