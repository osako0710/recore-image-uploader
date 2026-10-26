// 判定の候補表示（top_ids の順）と draft の送り方を、公開する画面の関数と本文で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0;for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('閉じ括弧が見つかりません');}
var orderedCandidates=new Function(pick('orderedCandidates')+'\nreturn orderedCandidates;')();
var list=[{candidate_id:'a',name:'A'},{candidate_id:'b',name:'B'},{candidate_id:'c',name:'C'},{candidate_id:'d',name:'D'}];
test('候補は top_ids の順に出す',function(){assert.deepStrictEqual(orderedCandidates(list,['d','b'],3).map(function(x){return x.candidate_id;}),['d','b']);});
test('候補にない ID と重複は捨て、最大3件にする',function(){assert.deepStrictEqual(orderedCandidates(list,['x','c','c','a','b','d'],3).map(function(x){return x.candidate_id;}),['c','a','b']);});
test('top_ids が空なら先頭3件を出す',function(){assert.deepStrictEqual(orderedCandidates(list,[],3).map(function(x){return x.candidate_id;}),['a','b','c']);assert.deepStrictEqual(orderedCandidates(list,undefined,3).length,3);});
test('draft はラベルを送り、候補一覧は送らない',function(){var line=html.split('\n').find(function(l){return l.indexOf("action:'draft'")>=0;});assert.ok(line.indexOf('label:state.label')>=0);assert.ok(line.indexOf('candidates:')<0);});
test('確定候補が上位にないときも候補表示に空きを作らない',function(){var line=html.split('\n').find(function(l){return l.indexOf('state.visibleCandidates[')>=0;});assert.ok(line.indexOf('Math.min(state.visibleCandidates.length,2)')>=0);});
