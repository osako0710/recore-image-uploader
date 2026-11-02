// Fromjapan 撮影画面の棚番の整え方と、出品済みの商品の主ボタンを画面の関数で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','fromjapan_shoot_20261030_v2.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false,regex=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var app=new Function(pick('primaryState')+'\nreturn {primaryState:primaryState};')();
// normShelf は正規表現に引用符を含むので、行ごと取り出す
var line=html.split('\n').find(function(l){return l.indexOf('function normShelf(')===0;});
var normShelf=new Function(line+'\nreturn normShelf;')();
test('棚番は全角を半角に、英字を大文字にし、空白を詰める',function(){
  assert.strictEqual(normShelf('ａ－１２'),'A-12');
  assert.strictEqual(normShelf(' b 3 '),'B3');
  assert.strictEqual(normShelf(''),'');
  assert.strictEqual(normShelf('x'.repeat(21)),'');
  assert.strictEqual(normShelf('A<1'),'');
});
test('出品中の商品は棚番が入るまで登録できず、売れた商品は棚番なしで渡せる',function(){
  assert.deepStrictEqual(app.primaryState({stage:'listed',listingState:'listed',shelfReady:false}),{action:'shelf',label:'棚番を登録',enabled:false});
  assert.deepStrictEqual(app.primaryState({stage:'listed',listingState:'listed',shelfReady:true}),{action:'shelf',label:'棚番を登録',enabled:true});
  assert.deepStrictEqual(app.primaryState({stage:'listed',listingState:'listed_by_name',shelfReady:true,busy:true}),{action:'shelf',label:'登録しています',enabled:false});
  assert.deepStrictEqual(app.primaryState({stage:'listed',listingState:'sold'}),{action:'shelf',label:'担当者に渡す',enabled:true});
});
