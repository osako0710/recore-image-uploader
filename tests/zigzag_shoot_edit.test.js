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
function pickAsync(name){var start=html.indexOf('async function '+name+'(');var end=html.indexOf('}}}',start)+3;return html.slice(start,end);}
test('送信中に直した内容は、送れるまで端末に残し、出品準備が始まっていたら知らせる',async function(){
  var make=new Function('postEdit','_cancelled','var _edited={a:{condition:"good",quantity:2}},_editLost=0;function saveEdited(){}\n'+pickAsync('applyEdit')+'\nreturn {run:applyEdit,state:function(){return {edited:_edited,lost:_editLost};}};');
  var down=make(async function(){var e=new Error('x');e.status=0;throw e;},{});await down.run('a');assert.ok(down.state().edited.a,'通信の失敗では消さない');
  var late=make(async function(){var e=new Error('x');e.status=409;throw e;},{});await late.run('a');assert.deepStrictEqual(late.state(),{edited:{},lost:1});
  var ok=make(async function(){},{});await ok.run('a');assert.deepStrictEqual(ok.state(),{edited:{},lost:0});
});
test('保存中は状態・数量・閉じる・取り消すを受け付けず、取り消しは確認のあとで編集欄を閉じる',function(){
  assert.ok(html.includes("data-editCondition&&_edit&&!_edit.busy".replace('data-editCondition','dataset.editCondition')));
  assert.ok(html.includes('dataset.editQuantity&&_edit&&!_edit.busy'));
  assert.ok(html.includes("if(target.dataset.cancel){if(_edit&&_edit.busy)return;cancelFromList"));
  var body=html.slice(html.indexOf('async function cancelFromList('));assert.ok(body.indexOf('window.confirm')<body.indexOf('_edit=null'));
});
