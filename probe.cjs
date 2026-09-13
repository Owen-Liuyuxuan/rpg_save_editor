// Read-only MV probe. All generated files must be outside the game directory.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const game = path.resolve(process.argv[2] || '');
const out = path.resolve(process.argv[3] || path.join(__dirname, 'output'));
const relative = path.relative(game, out);
if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw Error('Output must be outside game directory');
const read = p => fs.readFileSync(path.join(game, p), 'utf8');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
// Use this game's exact codec; no game/plugin scripts are executed.
const context = vm.createContext({});
vm.runInContext(read('js/libs/lz-string.js'), context, {timeout: 2000});
function codec(method, input) {
  context.input = input;
  return vm.runInContext(`LZString.${method}(input)`, context, {timeout: 10000});
}
const unwrap = v => v && !Array.isArray(v) && Array.isArray(v['@a']) ? v['@a'] : v;
const database = {};
for (const name of ['System','Actors','Classes','Items','Weapons','Armors','Skills','States','MapInfos']) database[name] = JSON.parse(read(`data/${name}.json`));
const pluginText = read('js/plugins.js');
const plugins = JSON.parse(pluginText.slice(pluginText.indexOf('[')).trim().replace(/;\s*$/, ''));
fs.mkdirSync(out, {recursive:true});
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value,null,2));
write('database-index.json', database);
const report = {
  game, engine: 'MV', version: read('js/rpg_core.js').match(/RPGMAKER_VERSION\s*=\s*"([^"]+)"/)[1],
  gameTitle: database.System.gameTitle,
  codecSha256: hash(read('js/libs/lz-string.js')),
  databaseCounts: Object.fromEntries(Object.entries(database).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.filter(Boolean).length])),
  namedVariables: database.System.variables.filter(Boolean).length,
  namedSwitches: database.System.switches.filter(Boolean).length,
  enabledPlugins: plugins.filter(p=>p.status).map(p=>p.name),
  variableLimitation: plugins.find(p=>p.name==='VariableLimitation'), saves: []
};
for (const name of fs.readdirSync(path.join(game, 'save')).filter(n=>n.endsWith('.rpgsave'))) {
  const file = path.join(game,'save',name);
  const before = fs.readFileSync(file);
  const encoded = before.toString('utf8').trim();
  const json = codec('decompressFromBase64', encoded);
  assert.ok(json, `${name}: decompression failed`);
  const raw = JSON.parse(json);
  assert.equal(codec('decompressFromBase64', codec('compressToBase64',json)),json);
  const reencoded = codec('compressToBase64',json);
  assert.deepEqual(JSON.parse(codec('decompressFromBase64',codec('compressToBase64',JSON.stringify(raw)))),raw);
  write(name+'.json',raw);
  const info = {name, bytes:before.length, sha256:hash(before), codecRoundtrip:true, byteIdentical:reencoded===encoded, jsonRoundtrip:true};
  if (raw.party) {
    const actors = unwrap(raw.actors._data);
    info.gold = raw.party._gold;
    info.mapId = raw.map._mapId;
    info.mapName = database.MapInfos[info.mapId]?.name;
    info.actors = actors.filter(Boolean).map(a=>({id:a._actorId,name:a._name,level:a._level,hp:a._hp,mp:a._mp}));
    info.variables = unwrap(raw.variables._data).map((value,id)=>({id,name:database.System.variables[id]||'',value})).filter(v=>v.value!==null&&v.value!==0).slice(0,25);
    info.items = Object.entries(raw.party._items).filter(([id])=>!id.startsWith('@')).map(([id,count])=>({id:Number(id),name:database.Items[id]?.name,count}));
    const edited = JSON.parse(json);
    edited.party._gold += 1;
    const copyName = name+'.gold-plus-one.rpgsave';
    fs.writeFileSync(path.join(out,copyName),codec('compressToBase64',JSON.stringify(edited)));
    const reread = JSON.parse(codec('decompressFromBase64',fs.readFileSync(path.join(out,copyName),'utf8')));
    assert.equal(reread.party._gold,raw.party._gold+1);
    reread.party._gold = raw.party._gold;
    assert.deepEqual(reread,raw, 'Unrelated data changed');
    info.editCopyRoundtrip = true;
  }
  assert.equal(hash(fs.readFileSync(file)),info.sha256,'Source file changed');
  info.sourceUnchanged = true;
  report.saves.push(info);
}
write('report.json',report);
console.log(JSON.stringify(report,null,2));
