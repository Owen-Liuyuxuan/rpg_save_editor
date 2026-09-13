const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const assert=require('node:assert/strict');
const {_electron}=require('C:/Users/YuxuanLiu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseline=require('./output/report.json');
async function main(){
 const appRoot=path.join(__dirname,'app');
 const executablePath=process.argv[2]||require('./app/node_modules/electron');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath,args:process.argv[2]?[]:[appRoot],env,timeout:30000});
 try{
  const page=await app.firstWindow();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({dialog},game)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[game]})},baseline.game);
  await page.getByRole('button',{name:'选择游戏目录',exact:true}).click();
  await page.getByRole('button',{name:'file1.rpgsave',exact:true}).click();
  await page.getByText('金币',{exact:true}).waitFor();
  const exportTarget=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'rpg-ui-review-')),'edited.rpgsave');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target})},exportTarget);
  page.on('dialog',d=>d.accept());
  const gold=page.locator('.edit input').first();
  await gold.fill('1001');
  const exportButton=page.getByRole('button',{name:/导出副本/});
  assert.equal(await exportButton.isDisabled(),true,'Unapplied draft must block export');
  await page.getByRole('button',{name:'应用',exact:true}).click();
  await page.locator('.diff').getByText('1001',{exact:true}).waitFor();
  await exportButton.click();
  let exported;
  for(let i=0;i<50;i++){
   try{exported=await fs.readFile(exportTarget,'utf8');break}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  const {decode}=require('./app/dist-electron/domain.js');
  assert.equal(decode(exported).party._gold,1001);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.edit input')?.value==='1000');
  await page.screenshot({path:path.join(__dirname,'output','gui-overview.png'),fullPage:true});
  await page.getByRole('button',{name:'变量',exact:true}).click();
  await page.getByPlaceholder('搜索 ID、名称或 key 片段').fill('35');
  await page.screenshot({path:path.join(__dirname,'output','gui-variables.png'),fullPage:true});
  await page.getByRole('button',{name:'角色',exact:true}).click();
  const attack=page.getByRole('textbox',{name:'攻击 (atk)',exact:true}).first();
  const originalAttack=await attack.inputValue();
  await attack.fill('200');
  await attack.locator('..').getByRole('button',{name:'应用',exact:true}).click();
  await page.locator('.diff code').filter({hasText:'_paramPlus'}).waitFor();
  const actorTarget=exportTarget.replace('edited','actor');
  await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target})},actorTarget);
  await exportButton.click();
  for(let i=0;i<50;i++){if(await fs.stat(actorTarget).then(()=>true,()=>false))break;await new Promise(r=>setTimeout(r,100));}
  const actorRaw=decode(await fs.readFile(actorTarget,'utf8'));
  const classes=JSON.parse(await fs.readFile(path.join(baseline.game,'data','Classes.json'),'utf8'));
  const actor=actorRaw.actors._data['@a'].find(a=>a?._actorId===1);
  assert.equal(classes[actor._classId].params[2][actor._level]+actor._paramPlus['@a'][2],200);
  await page.getByRole('button',{name:'撤销',exact:true}).click();
  await page.waitForFunction(v=>document.querySelector('input[aria-label="攻击 (atk)"]')?.value===v,originalAttack);
  await page.screenshot({path:path.join(__dirname,'output','gui-actors.png'),fullPage:true});
  await page.getByRole('button',{name:'开关',exact:true}).click();
  const system=JSON.parse(await fs.readFile(path.join(baseline.game,'data','System.json'),'utf8'));
  const unnamed=system.switches.findIndex((v,i)=>i>0&&!v.trim());
  await page.getByPlaceholder('搜索 ID、名称或 key 片段').fill(`switches._data[${unnamed}]`);
  await page.getByLabel('隐藏未命名开关').uncheck();
  assert.equal(await page.locator('.table .row').count(),1);
  await page.getByLabel('隐藏未命名开关').check();
  assert.equal(await page.locator('.table .row').count(),0);
  await page.screenshot({path:path.join(__dirname,'output','gui-switch-filter.png'),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: Electron; gold + actor edit/export/undo; name/key search; unnamed-switch toggle. Export: '+exportTarget);
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
