// Integration checks independent of implementation-agent tests. Real game remains read-only.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {SaveService}=require('./app/dist-electron/service.js');
const {decode,encode}=require('./app/dist-electron/domain.js');
const baseline=require('./output/report.json');
async function main(){
 const service=new SaveService();
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rpg-save-review-'));
 const results=[];
 for(const s of baseline.saves){
  const original=await fs.readFile(path.join(baseline.game,'save',s.name),'utf8');
  assert.equal(encode(decode(original)),original.trim(),`production codec ${s.name}`);
  if(!s.editCopyRoundtrip)continue;
  let view=await service.open(baseline.game,s.name);
  const initial=JSON.parse(JSON.stringify(view.raw));
  view=await service.patch(view.sessionId,{kind:'gold',value:view.gold+1});
  assert.equal(view.changes.length,1);
  const target=path.join(temp,s.name);
  await service.exportCopy(view.sessionId,target);
  const edited=decode(await fs.readFile(target,'utf8'));
  assert.equal(edited.party._gold,initial.party._gold+1);
  edited.party._gold=initial.party._gold;assert.deepEqual(edited,initial);
  await assert.rejects(()=>service.exportCopy(view.sessionId,target));
  assert.equal(await fs.readFile(path.join(baseline.game,'save',s.name),'utf8'),original);
  const undone=await service.undo(view.sessionId);assert.deepEqual(undone.raw,initial);
  for(const bad of [{kind:'gold',value:-1},{kind:'gold',value:NaN},{kind:'gold',value:'100'}, {kind:'switch',id:100000000,value:true},{kind:'__proto__',id:1,value:1},{kind:'variable',id:35,value:151}]){
   await assert.rejects(async()=>service.patch(view.sessionId,bad),`must reject ${JSON.stringify(bad)}`);
  }
  const after=service.view(view.sessionId);assert.deepEqual(after.raw,initial);
  const item=after.inventory.find(x=>Number.isInteger(x.count)&&x.count<x.limit.max);
  const str=after.variables.find(x=>typeof x.value==='string');
  const patches=[{kind:'switch',id:1,value:!after.switches.find(x=>x.id===1)?.value},
    {kind:'actor',id:after.actors[0].id,field:'atk',value:after.actors[0].params[2].value===200?201:200},
    ...(item?[{kind:item.kind,id:item.id,value:item.count+1}]:[]),
    ...(str?[{kind:'variable',id:str.id,value:str.value+'测试'}]:[])];
  for(const p of patches){
   const changed=await service.patch(view.sessionId,p);
   assert.equal(changed.changes.length,1,'single target patch');
   const out=path.join(temp,s.name+'.'+p.kind+'.rpgsave');await service.exportCopy(view.sessionId,out);
   assert.deepEqual(decode(await fs.readFile(out,'utf8')),changed.raw);
   const reset=await service.undo(view.sessionId);assert.deepEqual(reset.raw,initial);
  }
  results.push({file:s.name,patchExportUndo:true,metadataPreserved:true,invalidInputsRejected:true,originalUnchanged:true});
 }
 const testGame=path.join(temp,'game');
 for(const relative of ['js/rpg_core.js','js/plugins.js',...['System','Actors','Classes','Items','Weapons','Armors','MapInfos'].map(n=>'data/'+n+'.json'),'save/file1.rpgsave']){
  const dest=path.join(testGame,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(baseline.game,relative),dest);
 }
 const conflict=await service.open(testGame,'file1.rpgsave');
 await fs.appendFile(path.join(testGame,'save','file1.rpgsave'),'\n');
 await assert.rejects(()=>service.exportCopy(conflict.sessionId,path.join(temp,'conflict.rpgsave')),/源存档/);
 assert.equal(await fs.stat(path.join(temp,'conflict.rpgsave')).then(()=>true,()=>false),false);
 await fs.writeFile(path.join(__dirname,'output','app-integration-check.json'),JSON.stringify({temp,results},null,2));
 console.log(`PASS: ${results.length} real game saves; codec, patches, export, exclusive create, undo, input validation and source integrity.\nArtifacts: ${temp}`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
