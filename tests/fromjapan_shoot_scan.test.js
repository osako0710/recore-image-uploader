// 撮影画面のラベル読み取り（バーコード・QR）から8桁を取り出す処理を確かめる
// 実行: node --test tests/
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var html=fs.readFileSync(path.join(__dirname,'..','fromjapan_shoot_20261030_v2.html'),'utf8');

// 画面のファイルから、関数の本体をそのまま取り出す（写しを持たない）
function pick(name){
  var s=html.indexOf('\nfunction '+name+'(');
  if(s<0)throw new Error('関数が見つかりません: '+name);
  var i=html.indexOf('{',s),d=0;
  for(;i<html.length;i++){
    if(html[i]==='{')d++;
    else if(html[i]==='}'){d--;if(!d)return html.slice(s,i+1);}
  }
  throw new Error('関数の終わりが見つかりません: '+name);
}
var names=['codeFromScan','confirmRead','normCode'];
var app=new Function(names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();

test('バーコードの8桁はそのまま採る',function(){
  assert.strictEqual(app.codeFromScan('23213671'),'23213671');
  assert.strictEqual(app.codeFromScan(' 23213671\n'),'23213671');
});
test('QR に他の文字が入っていても、8桁の並びが1つなら採る',function(){
  assert.strictEqual(app.codeFromScan('(検)23213671'),'23213671');
  assert.strictEqual(app.codeFromScan('https://example.com/item?no=23213671'),'23213671');
  assert.strictEqual(app.codeFromScan('NO:23213671 NO:23213671'),'23213671');
});
test('区切りの入った8桁と全角の数字も採る',function(){
  assert.strictEqual(app.codeFromScan('2321-3671'),'23213671');
  assert.strictEqual(app.codeFromScan('２３２１３６７１'),'23213671');
});
test('8桁を決められない中身は採らない',function(){
  assert.strictEqual(app.codeFromScan(''),'');
  assert.strictEqual(app.codeFromScan('4901234567894'),'');
  assert.strictEqual(app.codeFromScan('1234567'),'');
  assert.strictEqual(app.codeFromScan('11111111 22222222'),'');
  assert.strictEqual(app.codeFromScan('order=980662&qty=12'),'');
  assert.strictEqual(app.codeFromScan('A2321-3671'),'');
  assert.strictEqual(app.codeFromScan(null),'');
});
test('取り出した番号は手打ちと同じ判定を通る',function(){
  assert.strictEqual(app.normCode(app.codeFromScan('(検)23213671')),'23213671');
});
test('同じ番号を2回続けて読めたときだけ確定する',function(){
  var r=app.confirmRead({text:'',count:0},'23213671');assert.strictEqual(r.text,'');
  r=app.confirmRead(r.last,'23213679');assert.strictEqual(r.text,'');
  r=app.confirmRead(r.last,'23213679');assert.strictEqual(r.text,'23213679');
});
test('入力欄と読み取りボタンが両方ある',function(){
  assert.ok(html.includes('id="code-input"'));
  assert.ok(html.includes('data-action="scan"'));
  assert.ok(html.includes('vendor/barcode-detector_3.2.2/ponyfill.js'));
  assert.ok(fs.existsSync(path.join(__dirname,'..','vendor','barcode-detector_3.2.2','ponyfill.js')));
});
test('端末が対応しているときだけライトとズームを出し、ズームは初期値のまま始める',function(){
  var els={};['scan-tools','scan-torch','scan-zoom'].forEach(function(id){els[id]={hidden:true,classList:{remove:function(){}}};});
  var doc={getElementById:function(id){return els[id];}};
  var setup=new Function('document',pick('setupCameraTools')+'\nreturn setupCameraTools;')(doc);
  var cam={};
  setup({getCapabilities:function(){return {torch:true,zoom:{min:1,max:5,step:0.5}};},getSettings:function(){return {zoom:1.5};}},cam);
  assert.strictEqual(els['scan-tools'].hidden,false);
  assert.strictEqual(els['scan-torch'].hidden,false);
  assert.strictEqual(els['scan-zoom'].hidden,false);
  assert.strictEqual(els['scan-zoom'].value,1.5);
  assert.strictEqual(cam.torch,false);
  setup({getCapabilities:function(){return {};}},{});
  assert.strictEqual(els['scan-tools'].hidden,true);
  assert.strictEqual(els['scan-torch'].hidden,true);
  assert.strictEqual(els['scan-zoom'].hidden,true);
  setup({},{});
  assert.strictEqual(els['scan-tools'].hidden,true);
});
test('画面が裏に回ったら読み取りを閉じる',function(){
  assert.match(html,/visibilitychange[^\n]*closeScan/);
});
test('撮影して読み取るときは、読めなければ写真を回して読み直す',function(){
  var s=html.indexOf('async function decodeStill('),body=html.slice(s,html.indexOf('\nfunction guideBox(',s));
  assert.ok(s>=0);
  assert.match(body,/angles=\[-25,25,-45,45\]/);
  assert.match(body,/cx\.rotate\(rad\)/);
});
