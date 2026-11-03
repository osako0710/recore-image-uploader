// 判定の候補表示（top_ids の順）と draft の送り方を、公開する画面の関数と本文で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0;for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('閉じ括弧が見つかりません');}
var orderedCandidates=new Function(pick('orderedCandidates')+'\nreturn orderedCandidates;')();
var list=[{candidate_id:'a',name:'A'},{candidate_id:'b',name:'B'},{candidate_id:'c',name:'C'},{candidate_id:'d',name:'D'}];
test('AI の候補を先に出し、残りの候補もすべて後ろに出す',function(){assert.deepStrictEqual(orderedCandidates(list,['d','b']).map(function(x){return x.candidate_id;}),['d','b','a','c']);});
test('候補にない ID と重複は捨て、件数で切らない',function(){assert.deepStrictEqual(orderedCandidates(list,['x','c','c','a','b','d']).map(function(x){return x.candidate_id;}),['c','a','b','d']);var many=[];for(var i=0;i<11;i++)many.push({candidate_id:'m'+i,name:'M'+i});assert.strictEqual(orderedCandidates(many,['m5']).length,11);});
test('top_ids が空なら元の順ですべて出す',function(){assert.deepStrictEqual(orderedCandidates(list,[]).map(function(x){return x.candidate_id;}),['a','b','c','d']);assert.strictEqual(orderedCandidates(list,undefined).length,4);});
test('draft はラベルを送り、候補一覧は送らない',function(){var line=html.split('\n').find(function(l){return l.indexOf("action:'draft'")>=0;});assert.ok(line.indexOf('label:state.label')>=0);assert.ok(line.indexOf('candidates:')<0);});
test('候補の表示を3件で切らない',function(){assert.ok(html.indexOf('orderedCandidates(state.candidates,value.top_ids,3)')<0);assert.ok(html.indexOf('state.candidates.slice(0,3)')<0);});
test('番号の入力欄は白い背景に濃い文字で出す',function(){var m=html.match(/\.manual input\{[^}]*\}/);assert.ok(m);assert.ok(/background:#fff/.test(m[0]));assert.ok(/[^-]color:#14231e/.test(m[0]));assert.ok(/-webkit-text-fill-color:#14231e/.test(m[0]));});
var doneText=new Function(pick('doneText')+'\nreturn doneText;')();
test('登録済みの数を候補に出し、残数に達したら残数ぶん登録済みと出す',function(){assert.strictEqual(doneText({done:0,remaining:2}),'');assert.strictEqual(doneText({remaining:2}),'');assert.strictEqual(doneText({done:1,remaining:2}),'登録済み 1点');assert.strictEqual(doneText({done:3,remaining:2}),'残数ぶん登録済み');});
