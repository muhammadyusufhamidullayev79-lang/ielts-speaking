// Run: node --test tests/account-storage.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('js/app.js','utf8');
function harness(){
  const local=new Map([['streak','99'],['mockHistory','[{"old":true}]']]);
  const writes=[];
  const context=vm.createContext({
    window:{IELTS_DATA:{},addEventListener(){}},
    document:{addEventListener(){},getElementById(){return {textContent:''};}},
    localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v)},
    console,setTimeout,clearTimeout,URL,
  });
  vm.runInContext(source,context);
  context.writes=writes;
  return {run:code=>vm.runInContext(code,context),local,writes};
}
test('guest progress is isolated from legacy localStorage and cannot persist',()=>{
  const h=harness();
  assert.equal(h.run("safeGet('streak','1')"),'1');
  assert.equal(h.run("safeSet('streak','2')"),false);
  assert.equal(h.local.get('streak'),'99');
  assert.equal(h.run("safeJSON('mockHistory',[]).length"),0);
});
test('theme preferences still use localStorage',()=>{
  const h=harness();assert.equal(h.run("safeSet('theme','dark')"),true);
  assert.equal(h.local.get('theme'),'dark');
});
test('authenticated progress writes only to the UID path, and clearing is persisted',async()=>{
  const h=harness();
  h.run(`accountUser={uid:'alice'}; accountReady=true;accountDB={};
    firebaseAPI={doc:(db,...path)=>path.join('/'),setDoc:(ref,data)=>{writes.push({ref,data});return Promise.resolve();}};`);
  assert.equal(h.run("safeSet('streak','4')"),true);
  assert.equal(h.writes[0].ref,'users/alice/progress/streak');
  assert.equal(h.run("safeGet('streak')"),'4');
  assert.equal(h.local.get('streak'),'99');
  h.run("safeRemove('mockHistory');safeRemove('mockDone');");
  assert.equal(h.run("safeJSON('mockHistory',[]).length"),0);
  assert.equal(h.run("safeGet('mockDone')"),'0');
  h.run("accountReady=false");
  assert.equal(h.run("safeSet('streak','5')"),false);
});
