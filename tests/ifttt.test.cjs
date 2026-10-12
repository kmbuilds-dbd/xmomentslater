/* eslint-disable @typescript-eslint/no-require-imports -- Node test loader transpiles isolated TypeScript modules to CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
function load(path, mocks={}) {
  const mod = new Module(path, module);
  mod.require = name => name in mocks ? mocks[name] : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,path);
  return mod.exports;
}
const path = require('node:path').resolve('src/lib/ifttt.ts');
test('validates and canonicalizes delivered posts, preserving paragraphs', () => {
  const {parseIftttPayload} = load(path);
  const result = parseIftttPayload({text:' First\n\nSecond ',author:' Alice ',url:'https://www.twitter.com/alice/status/123?s=20',created_at:'October 12, 2026 at 10:00AM PDT'});
  assert.equal(result.url,'https://x.com/alice/status/123');
  assert.equal(result.handle,'alice');
  assert.deepEqual(result.parsed.blocks,[{type:'text',content:'First'},{type:'text',content:'Second'}]);
});
test('rejects malformed fields and spoofed or non-post URLs', () => {
 const {parseIftttPayload} = load(path);
 const base={text:'Hello',author:'Alice Example',url:'https://x.com/alice/status/123',created_at:'2026-10-12T10:00:00Z'};
 for (const patch of [{text:''},{text:'x'.repeat(25001)},{author:'x'.repeat(201)},{created_at:'bad'},{url:'https://x.com.evil.test/alice/status/123'},{url:'ftp://x.com/alice/status/123'},{url:'https://x.com/alice/status/123/evil'},{url:'https://me@x.com/alice/status/123'}]) assert.throws(()=>parseIftttPayload({...base,...patch}));
 assert.equal(parseIftttPayload({...base,url:'https://x.com/i/web/status/123'}).handle,'');
 assert.equal(parseIftttPayload({...base,author:'@alice',url:'https://x.com/i/web/status/123'}).handle,'alice');
});
test('bounds streamed bodies even without a content length header',async()=>{
 const {readIftttBody}=load(path);
 const request=new Request('https://test',{method:'POST',body:'x'.repeat(65537)});
 await assert.rejects(readIftttBody(request),error=>error.status===413);
});
test('enrichment uses one call and validates model output; missing key degrades',async()=>{
 let calls=0;
 const mock={getAnthropicClient:()=>({messages:{create:async()=>{calls++;return {content:[{type:'text',text:JSON.stringify({summary:'Summary',tags:['AI','ai','tools'],category:'technology'})}]}}}})};
 const {enrichPost}=load(require('node:path').resolve('src/lib/enrich-post.ts'),{'@/lib/anthropic-client':mock});
 assert.deepEqual(await enrichPost('A substantial post'),{summary:'Summary',tags:['ai','tools'],category:'technology'});
 assert.equal(calls,1);
 const fallback=load(require('node:path').resolve('src/lib/enrich-post.ts'),{'@/lib/anthropic-client':{getAnthropicClient:()=>null}});
 assert.deepEqual(await fallback.enrichPost('Hello'),{summary:null,tags:[],category:null});
});
test('ingest authenticates before work, skips duplicates, handles race and nonfatal indexing', async()=>{
 const routePath=require('node:path').resolve('src/app/api/ifttt/ingest/route.ts');
 const parsed=load(path);
 process.env.SUPABASE_SERVICE_ROLE_KEY='test'; process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';
 let enrichments=0, insertions=0;
 let existing={id:'existing'}, lookupError=null, insertError=null, updateError=null, authData={user_id:'u'}, authError=null;
 const chain=(result)=>({select(){return this},eq(){return this},maybeSingle:async()=>result,single:async()=>result});
 const admin={from(table){
  if(table==='feed_tokens')return chain({data:authData,error:authError});
  return {...chain({data:existing,error:lookupError}),update(metadata){assert.equal(metadata.summary,null);const filters=[];return {eq(key,value){filters.push([key,value]);if(filters.length===2){assert.deepEqual(filters,[['id','new'],['user_id','u']]);return Promise.resolve({error:updateError})}return this}}},insert(row){insertions++;assert.equal(row.source,'ifttt');assert.equal(row.user_id,'u');assert.equal(row.x_post_id,'123');assert.equal(row.author_handle,'alice');assert.equal(row.text_content,'Hello');assert.equal(row.parsed_content.blocks[0].content,'Hello');assert.equal(row.raw_api_response.authorization,undefined);return chain({data:{id:'new',saved_at:'2026-10-12'},error:insertError})}};
 }};
 const {POST}=load(routePath,{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@supabase/supabase-js':{createClient:()=>admin},'@/lib/ifttt':parsed,
  '@/lib/enrich-post':{enrichPost:async()=>{enrichments++;return {summary:null,tags:[],category:null}}},
  '@/lib/vector-search':{indexSavedPostVector:async()=>{throw Error('offline')}},
 });
 const request=(headers={authorization:'Bearer test','content-type':'application/json'})=>new Request('https://test/api/ifttt/ingest',{method:'POST',headers,body:JSON.stringify({text:'Hello',author:'Alice',url:'https://x.com/alice/status/123',created_at:'2026-10-12T10:00:00Z',user_id:'attacker',authorization:'secret'})});
 assert.equal((await POST(request({}))).status,401);
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 assert.equal((await POST(request())).status,500);
 process.env.SUPABASE_SERVICE_ROLE_KEY='test';
 authData=null; assert.equal((await POST(request())).status,401);
 authError={message:'offline'};assert.equal((await POST(request())).status,500);
 authError=null;authData={user_id:'u'};
 assert.equal((await POST(request({authorization:'Bearer test','content-type':'text/plain'}))).status,415);
 assert.equal((await POST(request())).body.duplicate,true); assert.equal(enrichments,0);
 existing=null; lookupError={message:'db unavailable'};
 assert.equal((await POST(request())).status,500); assert.equal(enrichments,0);
 lookupError=null; insertError={code:'23505'};
 assert.equal((await POST(request())).body.duplicate,true);assert.equal(enrichments,0);
 insertError=null;updateError={message:'offline'};
 const result=await POST(request()); assert.equal(result.status,200);assert.equal(result.body.postId,'new');assert.equal(insertions,2);assert.equal(enrichments,1);
});
