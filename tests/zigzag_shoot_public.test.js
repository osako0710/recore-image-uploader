// 候補表示とモック分岐に内部情報が混ざらないことを確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var app=new Function(pick('isMockMode')+'\n'+pick('publicText')+'\n'+pick('candidateViewNames')+'\nreturn {isMockMode:isMockMode,publicText:publicText,candidateViewNames:candidateViewNames};')();
test('候補には価格と内部番号を表示しない',function(){var names=app.candidateViewNames([{name:'PKGI-01234567 IT-9988 バッグ 価格 3,980円'},{name:'￥1200 ポーチ'}],3).join(' ');assert.doesNotMatch(names,/PKGI|\bIT\b|価格|[¥￥]|円/);assert.match(names,/バッグ/);});
test('通常の候補は最大3件だけ返す',function(){assert.strictEqual(app.candidateViewNames([{name:'a'},{name:'b'},{name:'c'},{name:'d'}],3).length,3);});
test('モックはmock=1のときだけ有効になる',function(){assert.strictEqual(app.isMockMode('?mock=1'),true);assert.strictEqual(app.isMockMode('?mock=1&ai=0'),true);assert.strictEqual(app.isMockMode('?mock=0'),false);assert.strictEqual(app.isMockMode('?w=ABCDEFGH'),false);});
