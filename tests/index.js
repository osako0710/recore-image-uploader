// Node.jsの版にかかわらず「node --test tests/」で全テストを動かす入口
var fs=require('fs'),path=require('path');
fs.readdirSync(__dirname).filter(function(name){return /\.test\.js$/.test(name);}).sort().forEach(function(name){require(path.join(__dirname,name));});
// API 本体（TypeScript）を読むテストは、Node が TS をそのまま読める版のときだけ動かす
if(process.features&&process.features.typescript){fs.readdirSync(__dirname).filter(function(name){return /\.test\.mjs$/.test(name);}).sort().forEach(function(name){import(require('url').pathToFileURL(path.join(__dirname,name)).href);});}
