// 登録の「編集する」（状態と数量）を、公開する画面の関数で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var names=['canEdit','conditionText','editErrorText','primaryState'];
var app=new Function(names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();
test('直せるのは取込前と未送信の登録だけ',function(){
  assert.strictEqual(app.canEdit({editable:true,condition:'good'}),true);
  assert.strictEqual(app.canEdit({pending:true}),true);
  assert.strictEqual(app.canEdit({editable:false,condition:'good'}),false);
  assert.strictEqual(app.canEdit({editable:true,condition:'good',cancelled:true}),false);
  assert.strictEqual(app.canEdit({cancellable:true}),false);
});
test('状態は作業者の言葉で出す',function(){assert.strictEqual(app.conditionText('new'),'新品・未使用');assert.strictEqual(app.conditionText('damaged'),'傷や汚れあり');assert.strictEqual(app.conditionText('x'),'');});
test('直せない理由を作業者の言葉で返す',function(){assert.match(app.editErrorText(409),/出品の準備が始まっている/);assert.match(app.editErrorText(404),/見つかりません/);assert.match(app.editErrorText(undefined),/電波/);});
test('一覧に直すの入口と保存ボタンがある',function(){assert.ok(html.includes('data-edit="'));assert.ok(html.includes("action:'edit'"));assert.ok(html.includes('管理番号は変わりません'));});
test('直している間は主ボタンが保存になり、主ボタンは1つだけ',function(){assert.deepStrictEqual(app.primaryState({stage:'mine',editing:true}),{action:'edit-save',label:'この内容で保存',enabled:true});assert.deepStrictEqual(app.primaryState({stage:'mine',editing:true,editBusy:true}),{action:'edit-save',label:'保存しています',enabled:false});assert.deepStrictEqual(app.primaryState({stage:'mine'}),{action:'back',label:'撮影に戻る',enabled:true});assert.ok(!html.includes('class="save"'));});
test('一覧のボタン名は「編集する」',function(){assert.ok(html.includes('>編集する</button>'));assert.ok(!html.includes('>直す</button>'));});
