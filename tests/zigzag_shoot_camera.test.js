// 正方形の撮影画面とカメラロールからの選択を、公開する画面の関数で確かめる
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','zigzag_shoot_20261026_v1.html'),'utf8');
function pick(name){var start=html.indexOf('\nfunction '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0,quote='',escape=false;for(;i<html.length;i++){var c=html[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(!depth)return html.slice(start,i+1);}}throw new Error('関数の終わりが見つかりません: '+name);}
var names=['normalShape','cropRect','camTarget','camTitle','camAspect','fitBox','pickRoom'];
var app=new Function(names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();
test('最初は2枚、追加は1枚撮ったら撮影画面を閉じる',function(){assert.strictEqual(app.camTarget(0,8),2);assert.strictEqual(app.camTarget(1,8),2);assert.strictEqual(app.camTarget(2,8),3);assert.strictEqual(app.camTarget(7,8),8);assert.strictEqual(app.camTarget(8,8),8);});
test('見出しは撮った枚数で替わる',function(){assert.strictEqual(app.camTitle(0),'正面を撮ってください');assert.strictEqual(app.camTitle(1),'裏かタグを撮ってください');assert.strictEqual(app.camTitle(3),'追加の写真を撮ってください');});
test('1:1 の枠は正方形、4:3 はカメラの縦横比のまま',function(){assert.strictEqual(app.camAspect('1:1',1440,1920),1);assert.strictEqual(app.camAspect('4:3',1440,1920),0.75);assert.strictEqual(app.camAspect('4:3',0,0),0.75);});
test('枠は画面に収まる大きさにする',function(){assert.deepStrictEqual(app.fitBox(360,500,1),{w:360,h:360});assert.deepStrictEqual(app.fitBox(360,300,1),{w:300,h:300});assert.deepStrictEqual(app.fitBox(360,400,0.75),{w:300,h:400});});
test('1:1 の枠に映る範囲は、登録時の切り抜きと同じ',function(){
  // 縦長のカメラ映像（1440x1920）を正方形の枠に object-fit:cover で映すと、中央の 1440x1440 が見える
  var w=1440,h=1920,side=Math.min(w,h),shown={x:(w-side)/2,y:(h-side)/2,w:side,h:side};
  assert.deepStrictEqual(app.cropRect(w,h,'1:1'),shown);
});
test('選んだ写真は残りの枚数までしか入れない',function(){assert.strictEqual(app.pickRoom(0,8,3),3);assert.strictEqual(app.pickRoom(6,8,5),2);assert.strictEqual(app.pickRoom(8,8,1),0);});
test('撮影画面とカメラロールの入口がある',function(){
  assert.ok(html.includes('id="cam-layer"'));assert.ok(html.includes('aria-label="撮る写真の形"'));
  assert.ok(html.includes('data-action="pick-photo">写真を選ぶ'));
  assert.match(html,/<input id="pick-input"[^>]*accept="image\/\*" multiple>/);
  assert.doesNotMatch(html.match(/<input id="pick-input"[^>]*>/)[0],/capture/);
  assert.match(html,/action==='photo'\)openShotCam\(\)/);
  assert.match(html,/action==='add-photo'\)\{openShotCam\(\)/);
});
test('カメラを起動できない端末は端末のカメラに戻す',function(){
  assert.match(pick('openShotCam'),/getUserMedia\)\{document\.getElementById\('photo-input'\)\.click\(\)/);
  assert.match(pick('shootFrame'),/_camFallback\)\{closeShotCam\(\);document\.getElementById\('photo-input'\)\.click\(\)/);
  assert.match(html,/visibilitychange',function\(\)\{if\(document\.hidden\)\{stopShotCam\(\)/);
});
// async 関数は中括弧を数えて抜き出す（中の文字列に中括弧は無い）
function pickAsync(name){var start=html.indexOf('\nasync function '+name+'(');if(start<0)throw new Error('関数が見つかりません: '+name);var i=html.indexOf('{',start),depth=0;for(;i<html.length;i++){if(html[i]==='{')depth++;else if(html[i]==='}'){depth--;if(depth===0)break;}}return html.slice(start+1,i+1);}
function photoApp(){
  var body=pickAsync('addPicked')+'\n'+pickAsync('addPhoto')+'\n'+pick('pickRoom')+'\n'+pick('readyToSave')+'\n'+pick('waitingText');
  return new Function('ctx',"var MAX_PHOTOS=8,_shape='4:3',state=ctx.state;function render(){ctx.renders++;}function createDraft(){}function loadImageFile(f){return f();}function toJpeg(){return 'data:image/jpeg;base64,AA';}"+body+"\nreturn {addPicked:addPicked,readyToSave:readyToSave,waitingText:waitingText,get state(){return state;},set state(v){state=v;}};");
}
function baseState(){return {photos:[],draftDone:true,draftBusy:false,selectedSet:true,condition:'new',error:''};}
test('まとめて選んだ写真を読み終えるまで登録できない',async function(){
  var ctx={state:baseState(),renders:0},app=photoApp()(ctx),release,gate=new Promise(function(r){release=r;});
  var files=[function(){return {};},function(){return {};},function(){return gate.then(function(){return {};});}];
  var done=app.addPicked(files);
  await new Promise(function(r){setTimeout(r,0);});
  assert.strictEqual(app.state.photos.length,2);
  assert.strictEqual(app.readyToSave(),false);
  assert.strictEqual(app.waitingText(),'写真を読み込んでいます');
  release();await done;
  assert.strictEqual(app.state.photos.length,3);
  assert.strictEqual(app.readyToSave(),true);
});
test('読み込み中に次の商品へ移ったら、残りの写真は次の商品に入れない',async function(){
  var ctx={state:baseState(),renders:0},app=photoApp()(ctx),release,gate=new Promise(function(r){release=r;});
  var files=[function(){return {};},function(){return gate.then(function(){return {};});},function(){return {};}];
  var done=app.addPicked(files);
  await new Promise(function(r){setTimeout(r,0);});
  var next=baseState();app.state=next;
  release();await done;
  assert.strictEqual(next.photos.length,0);
  assert.ok(!next.photoLoading);
});
test('カメラの形の切り替えで、選んでいない側の文字を濃い色にする',function(){
  assert.match(html,/\.shape button\{[^}]*background:#fff;color:#14231e/);
  assert.match(html,/\.shape button\.on\{[^}]*color:#fff/);
});
