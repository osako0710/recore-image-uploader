// 画面に出す「質問」「確認する点」の言い換えを、公開中の作業リストの全行で確かめる
// 実行: node --test tests/
var test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
var ROOT=path.join(__dirname,'..');
var html=fs.readFileSync(path.join(ROOT,'physcheck_app_20261001_v6.html'),'utf8');

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
var consts=/\nvar PT_MAP=[^\n]+\nvar PT_KEEP=[^\n]+/.exec(html)[0];
var names=['num','parseCSV','csvToItems','parseFields','plainWords','plainPoint'];
var app=new Function(consts+'\n'+names.map(pick).join('\n')+'\nreturn {'+names.map(function(n){return n+':'+n;}).join(',')+'};')();

var csvName=/var CSV_URL='([^']+)'/.exec(html)[1];
var items=app.csvToItems(fs.readFileSync(path.join(ROOT,csvName),'utf8'));
function kinds(col){var m={};items.forEach(function(it){m[it[col]]=(m[it[col]]||0)+1;});return m;}
var points=kinds('見るポイント'),questions=kinds('質問');

test('よく出る部品を言い換える',function(){
  assert.strictEqual(app.plainPoint('現物の有無と点数、サイズ・色、在庫ラベル(IT)の有無'),'現物の有無と点数、サイズ・色、在庫ラベルの有無');
  assert.strictEqual(app.plainPoint('タグ・JAN・型番・ブランド名を撮影、全体写真、数量'),'タグ・バーコード・型番・ブランド名を撮影、全体写真、数量');
  assert.strictEqual(app.plainPoint('数量、bonus_or_purchase_benefit_presence'),'数量、特典・購入特典の有無');
  assert.strictEqual(app.plainWords('タグ・JAN・型番が写るように撮影し、点数を数えてください'),'タグ・バーコード・型番が写るように撮影し、点数を数えてください');
});

test('同じ言葉になった部品は 1 つにまとめる',function(){
  assert.strictEqual(app.plainPoint('箱番号・実所在、数量、箱番号・所在'),'箱番号・実際の所在、数量');
  assert.strictEqual(app.plainPoint('箱・袋の所在 / 数量 / 数量'),'箱・袋の所在 / 数量');
});

test('出品の担当者向けの注意の文は言い換えない',function(){
  ['現物の色・サイズ・品番を確認。掲載SKUをJANとみなさない','別キャラのJANを採用しない','現物の3枚構成・キャラ・版を確認。JAN未確認',
   '元名と保存本文に中古/汚れ有。基本新品未使用の宣言から自動除外し'].forEach(function(s){
    assert.strictEqual(app.plainPoint(s),s);
  });
  // 同じ部品の中でも、作業者向けの文だけを言い換える
  assert.strictEqual(app.plainPoint('現物のJANタグ・キャラ・状態と数量を確認。掲載中古品の状態は転用しない'),'現物のバーコードタグ・キャラ・状態と数量を確認。掲載中古品の状態は転用しない');
});

test('判断が要る文言は変えない',function(){
  ['確認数量（元リストの商品単位）','色・サイズ・種類の現物と根拠照合','元帳数量保持・現物未確認','未確認',
   '説明文の未確認項目（サイズ・色・種類・構成など）','ANSI／ISO配列'].forEach(function(s){
    assert.strictEqual(app.plainPoint(s),s);
  });
});

test('作業リストの全種類: 決めた語のほかは 1 字も変わらない',function(){
  assert.ok(Object.keys(points).length>100);
  var changed=0,rows=0;
  Object.keys(points).forEach(function(s){
    var out=app.plainPoint(s);
    assert.ok(out.indexOf('(IT)')<0&&out.indexOf('bonus_or_purchase_benefit_presence')<0,s);
    if(out===s)return;
    changed++;rows+=points[s];
    // 言い換えを元の語に戻すと、まとめた重複を除いて元の文言と同じになる
    var back=out.replace(/バーコード/g,'JAN').replace(/元の商品名/g,'元名').replace('在庫ラベルの有無','在庫ラベル(IT)の有無')
      .replace('特典・購入特典の有無','bonus_or_purchase_benefit_presence').replace('箱番号・実際の所在','箱番号・実所在');
    assert.strictEqual(back,s.replace(/(、| \/ )箱番号・所在/,''),s);
  });
  assert.deepStrictEqual([changed,rows],[32,1026]);
});

test('質問の 8 種類: JAN のほかは変わらない',function(){
  var ks=Object.keys(questions);
  assert.strictEqual(ks.length,8);
  ks.forEach(function(s){assert.strictEqual(app.plainWords(s),s.replace(/JAN/g,'バーコード'));});
  assert.strictEqual(ks.filter(function(s){return app.plainWords(s)!==s;}).length,1);
});

test('カードは言い換えた文言を出し、一覧の値をそのまま出さない',function(){
  assert.ok(html.indexOf("esc(plainWords(it['質問']))")>0);
  assert.ok(html.indexOf("esc(plainPoint(it['見るポイント']))")>0);
  assert.ok(html.indexOf("esc(it['見るポイント'])")<0);
});
