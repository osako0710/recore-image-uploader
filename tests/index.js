// Node.jsの版にかかわらず「node --test tests/」で全テストを動かす入口
var fs=require('fs'),path=require('path');
fs.readdirSync(__dirname).filter(function(name){return /\.test\.js$/.test(name);}).sort().forEach(function(name){require(path.join(__dirname,name));});
