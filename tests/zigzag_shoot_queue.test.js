// 未送信の再送を同じ管理用UUIDで重複させないことを確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)start=html.indexOf('\nasync function '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0;for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var source=pick('dedupeQueue')+'\n'+pick('flushQueueList')+'\nreturn {dedupeQueue:dedupeQueue,flushQueueList:flushQueueList};';
var app=new Function(source)();
test('同じUUIDの未送信データは新しい1件だけを残す',function(){var out=app.dedupeQueue([{client_id:'a',n:1},{client_id:'b',n:1},{client_id:'a',n:2}]);assert.deepStrictEqual(out,[{client_id:'a',n:2},{client_id:'b',n:1}]);});
test('再送は順番を守り、同じUUIDを二度送らない',async function(){var sent=[];var rest=await app.flushQueueList([{client_id:'a'},{client_id:'a'},{client_id:'b'}],async function(row){sent.push(row.client_id);});assert.deepStrictEqual(sent,['a','b']);assert.deepStrictEqual(rest,[]);});
test('送信に失敗したデータ以降を次回用に残す',async function(){var rest=await app.flushQueueList([{client_id:'a'},{client_id:'b'},{client_id:'c'}],async function(row){if(row.client_id==='b')throw new Error('offline');});assert.deepStrictEqual(rest,[{client_id:'b'},{client_id:'c'}]);});
