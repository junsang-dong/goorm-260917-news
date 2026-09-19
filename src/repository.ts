import { openDB, type IDBPDatabase } from 'idb';
import { backupSchema, contentSchema, companySchema, sourceSchema, type Backup, type Content, type Item, type Note, type Source, type Company, type Analysis } from '../shared/schemas';
import { createSeed } from './seed';
import { canonicalUrl, classify, dedup, filterItems, type Filters } from './domain';
import { apiHeaders } from './auth/firebase-auth';
import { createReferenceCatalog } from './reference-catalog';
const stores=['workspaces','contents','contentSources','analyses','bookmarks','notes','sources','companyProfiles','runs','meta'];
export const changes=typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('bcr-radar'):null;
export class RadarError extends Error {constructor(public code:string,message:string){super(message);}}
function storageError(e:unknown):never{if(e instanceof RadarError)throw e;if(e instanceof DOMException&&e.name==='QuotaExceededError')throw new RadarError('QUOTA_EXCEEDED','저장 공간이 부족합니다. 백업 후 불필요한 자료를 정리해 주세요.');throw e;}
export class RadarRepository {
 private connection?:Promise<IDBPDatabase>;
 private cloudRevision=0;
 private syncing=false;
 private syncQueue:Promise<void>=Promise.resolve();
 constructor(private name='bcr-robotics-radar',private seed=true){}
 private emitStorageError(detail:string){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('bcr-storage-error',{detail}));}
 async db(){
  if(!this.connection){
   this.connection=openDB(this.name,1,{
    upgrade(db){
     for(const s of stores){
      const keyPath=s==='meta'?'key':s==='companyProfiles'?'version':['notes','bookmarks'].includes(s)?['workspaceId','contentId']:s==='contentSources'?['contentId','sourceId']:'id';
      const st=db.createObjectStore(s,{keyPath});
      if(s==='contents'){st.createIndex('dedupKey','dedupKey',{unique:true});st.createIndex('publishedAt','publishedAt');st.createIndex('type','type');}
      if(s==='analyses'){st.createIndex('analysisKey','analysisKey',{unique:true});st.createIndex('contentId','contentId');}
      if(['bookmarks','notes'].includes(s))st.createIndex('workspaceId','workspaceId');
      if(s==='runs')st.createIndex('startedAt','startedAt');
     }
    },
    blocked:()=>this.emitStorageError('다른 탭이 저장소 업그레이드를 막고 있습니다. 기존 탭을 닫고 새로고침하세요.'),
   }).then(db=>{
    db.addEventListener('versionchange',()=>{db.close();this.connection=undefined;this.emitStorageError('저장소 버전이 변경되었습니다. 탭을 새로고침하세요.');});
    return db;
   }).catch(()=>{this.connection=undefined;throw new RadarError('STORAGE_UNAVAILABLE','저장소를 사용할 수 없습니다. 브라우저의 사이트 저장 허용을 확인하고 새로고침하세요.');});
  }
  return this.connection;
 }
 async initialize(){const db=await this.db();const tx=db.transaction(stores,'readwrite');if(!(await tx.objectStore('meta').get('seedVersion'))){const b=createSeed();for(const store of stores){if(['runs','meta'].includes(store))continue;const data=store==='workspaces'?[b.workspace]:(b as unknown as Record<string,unknown[]>)[store];for(const row of (this.seed||['workspaces','companyProfiles'].includes(store)?data:[]))await tx.objectStore(store).put(row);}await tx.objectStore('meta').put({key:'seedVersion',value:1});await tx.objectStore('meta').put({key:'currentProfileVersion',value:1});}await tx.done;if(import.meta.env?.VITE_APP_MODE==='cloud')await this.initializeCloud();if(this.seed)await this.installReferenceCatalog();}
 private async installReferenceCatalog(){const db=await this.db();const version=Number((await db.get('meta','referenceCatalogVersion'))?.value||0);if(version>=2)return;const profiles:Company[]=await db.getAll('companyProfiles');const profileVersion=Math.max(1,...profiles.map(p=>p.version));const catalog=createReferenceCatalog(profileVersion);const tx=db.transaction(['contents','analyses','contentSources','sources','runs','meta'],'readwrite');let added=0;for(let i=0;i<catalog.contents.length;i++){const content=catalog.contents[i],source=catalog.sources[i],analysis=catalog.analyses[i],link=catalog.links[i];const allSources:Source[]=await tx.objectStore('sources').getAll();const existingSource=allSources.find(s=>s.url===source.url||s.id===source.id);const byDedup=await tx.objectStore('contents').index('dedupKey').get(content.dedupKey);const byId=await tx.objectStore('contents').get(content.id);const existingContent=byDedup||byId;const sourceId=existingSource?.id||source.id;if(!existingSource)await tx.objectStore('sources').put(source);else if(existingSource.id===source.id&&existingSource.url!==source.url)await tx.objectStore('sources').put({...existingSource,url:source.url,name:source.name});if(!existingContent){await tx.objectStore('contents').put(content);await tx.objectStore('analyses').put(analysis);added++;}else if(existingContent.id===content.id&&existingContent.url!==content.url)await tx.objectStore('contents').put({...existingContent,url:content.url,dedupKey:content.dedupKey,checkedAt:content.checkedAt});await tx.objectStore('contentSources').put({contentId:existingContent?.id||link.contentId,sourceId});}await tx.objectStore('meta').put({key:'referenceCatalogVersion',value:2});await tx.objectStore('runs').put({id:crypto.randomUUID(),startedAt:new Date().toISOString(),type:'C46 참고 출처 30개 등록',count:added,status:'성공'});await tx.done;this.notify();}
 private async initializeCloud(){const res=await fetch('/api/v1/workspace',{headers:await apiHeaders()});if(!res.ok)throw new RadarError('CLOUD_UNAVAILABLE',await this.apiError(res));const remote=await res.json() as {state:null|((Backup&{runs:unknown[]})&Record<string,unknown>);revision:number};this.cloudRevision=remote.revision;if(remote.state)await this.restoreCloudState(remote.state);else{await this.restoreCloudState({...createSeed(),runs:[]});await this.pushCloud();}}
 private async apiError(res:Response){try{return ((await res.json()) as {message?:string}).message||`클라우드 요청 실패 (${res.status})`;}catch{return `클라우드 요청 실패 (${res.status})`;}}
 private async restoreCloudState(state:Backup&{runs:unknown[]}){this.syncing=true;try{const parsed=backupSchema.parse(state);const db=await this.db();const tx=db.transaction(stores,'readwrite');for(const s of stores.filter(s=>s!=='meta'))await tx.objectStore(s).clear();for(const s of stores){if(['meta','runs'].includes(s))continue;const rows=s==='workspaces'?[parsed.workspace]:(parsed as unknown as Record<string,unknown[]>)[s];for(const row of rows)await tx.objectStore(s).put(row);}for(const run of state.runs||[])await tx.objectStore('runs').put(run);await tx.objectStore('meta').put({key:'seedVersion',value:1});await tx.objectStore('meta').put({key:'currentProfileVersion',value:Math.max(...parsed.companyProfiles.map(p=>p.version))});await tx.done;}finally{this.syncing=false;}}
 private queueCloudSync(){if(import.meta.env?.VITE_APP_MODE!=='cloud'||this.syncing)return;this.syncQueue=this.syncQueue.then(()=>this.pushCloud()).catch(e=>this.emitStorageError(e instanceof Error?e.message:'Neon 동기화에 실패했습니다.'));}
 private async pushCloud(){if(this.syncing)return;const state=await this.snapshot();const res=await fetch('/api/v1/workspace',{method:'PUT',headers:await apiHeaders(true),body:JSON.stringify({state,expectedRevision:this.cloudRevision||undefined})});if(!res.ok)throw new RadarError('CLOUD_SYNC_FAILED',await this.apiError(res));this.cloudRevision=((await res.json()) as {revision:number}).revision;}
 async snapshot():Promise<Backup & {runs:{id:string;startedAt:string;type:string;count:number;status:string}[]}>{const db=await this.db(),tx=db.transaction(stores,'readonly');const values=await Promise.all(stores.map(s=>tx.objectStore(s).getAll()));await tx.done;const data=Object.fromEntries(stores.map((s,i)=>[s,values[i]]));return {app:'bcr-robotics-radar',schemaVersion:1,exportedAt:new Date().toISOString(),workspace:data.workspaces[0],contents:data.contents,contentSources:data.contentSources,analyses:data.analyses,bookmarks:data.bookmarks,notes:data.notes,sources:data.sources,companyProfiles:data.companyProfiles,runs:data.runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt))};}
 async items():Promise<Item[]>{const b=await this.snapshot();return b.contents.map(c=>({...c,analysis:b.analyses.filter(a=>a.contentId===c.id).sort((a,b)=>b.profileVersion-a.profileVersion)[0],bookmarked:b.bookmarks.some(s=>s.contentId===c.id),note:b.notes.find(n=>n.contentId===c.id)}));}
 async listContents(f:Filters,cursor?:string,limit=20){const list=filterItems(await this.items(),f);const parsed=cursor?JSON.parse(cursor):null;const start=parsed?Math.max(0,list.findIndex(c=>c.id===parsed.id)+1):0;const items=list.slice(start,start+Math.min(50,limit));const last=items.at(-1);return {items,total:list.length,nextCursor:start+items.length<list.length&&last?JSON.stringify({id:last.id,publishedAt:last.publishedAt,score:last.analysis?.score}):null};}
 async getContent(id:string){return (await this.items()).find(c=>c.id===id)||null;}
 async setBookmark(contentId:string,saved:boolean){const db=await this.db();try{const tx=db.transaction(['contents','workspaces','bookmarks'],'readwrite');if(!await tx.objectStore('contents').get(contentId))throw new RadarError('NOT_FOUND','자료를 찾을 수 없습니다.');const w=(await tx.objectStore('workspaces').getAll())[0];if(saved)await tx.objectStore('bookmarks').put({workspaceId:w.id,contentId,createdAt:new Date().toISOString()});else await tx.objectStore('bookmarks').delete([w.id,contentId]);await tx.done;this.notify();}catch(e){storageError(e);}}
 async saveNote(contentId:string,body:string,expectedVersion:number):Promise<Note>{if(body.length>5000)throw new RadarError('VALIDATION_ERROR','메모는 최대 5,000자입니다.');const db=await this.db();const tx=db.transaction(['contents','workspaces','notes'],'readwrite');if(!await tx.objectStore('contents').get(contentId))throw new RadarError('NOT_FOUND','자료를 찾을 수 없습니다.');const w=(await tx.objectStore('workspaces').getAll())[0];const previous=await tx.objectStore('notes').get([w.id,contentId]);if((previous?.version||0)!==expectedVersion){await tx.done;throw new RadarError('VERSION_CONFLICT','다른 탭에서 메모가 변경되었습니다. 작성한 내용을 복사한 후 상세를 다시 열어 최신 메모를 확인해 주세요.');}const note={workspaceId:w.id,contentId,body,version:expectedVersion+1,updatedAt:new Date().toISOString()};try{await tx.objectStore('notes').put(note);await tx.done;this.notify();return note;}catch(e){return storageError(e);}}
 async upsertContent(input:Content,summary=''){const c=contentSchema.parse(input);c.url=canonicalUrl(c.url);c.dedupKey=dedup(c.type,c.url);const db=await this.db(),tx=db.transaction(['contents','analyses','companyProfiles','runs'],'readwrite');const prev=await tx.objectStore('contents').index('dedupKey').get(c.dedupKey);if(prev){await tx.done;return prev.id as string;}const profiles=await tx.objectStore('companyProfiles').getAll();const a=classify(c,Math.max(...profiles.map(p=>p.version)));if(summary){a.summary=summary;a.method='manual';a.analysisKey=`${c.id}:${a.profileVersion}:manual`;}await tx.objectStore('contents').put(c);await tx.objectStore('analyses').put(a);await tx.objectStore('runs').put({id:crypto.randomUUID(),startedAt:new Date().toISOString(),type:'직접 등록',count:1,status:'성공'});await tx.done;this.notify();return c.id;}
 async saveSummary(contentId:string,summary:string){if(summary.length>10000)throw new RadarError('VALIDATION_ERROR','요약은 10,000자 이내입니다.');const db=await this.db(),tx=db.transaction('analyses','readwrite');const list:Analysis[]=await tx.store.index('contentId').getAll(contentId);const a=list.sort((a,b)=>b.profileVersion-a.profileVersion)[0];if(!a)throw new RadarError('NOT_FOUND','분석 자료가 없습니다.');await tx.store.put({...a,summary,method:'manual'});await tx.done;this.notify();}
 async saveAnalysis(input:Analysis,titleKo=''){const analysis=input;const db=await this.db(),tx=db.transaction(['contents','analyses','runs'],'readwrite');const content=await tx.objectStore('contents').get(analysis.contentId);if(!content)throw new RadarError('NOT_FOUND','자료를 찾을 수 없습니다.');await tx.objectStore('contents').put({...content,titleKo:titleKo||content.titleKo});const existing:Analysis[]=await tx.objectStore('analyses').index('contentId').getAll(analysis.contentId);for(const row of existing.filter(a=>a.profileVersion===analysis.profileVersion&&a.method==='llm'))await tx.objectStore('analyses').delete(row.id);await tx.objectStore('analyses').put(analysis);await tx.objectStore('runs').put({id:crypto.randomUUID(),startedAt:new Date().toISOString(),type:'GPT 자동 분석',count:1,status:'성공'});await tx.done;this.notify();}
 async saveCompany(input:Omit<Company,'version'|'createdAt'>){const db=await this.db(),tx=db.transaction(['companyProfiles','meta'],'readwrite');const all=await tx.objectStore('companyProfiles').getAll();const c=companySchema.parse({...input,version:Math.max(...all.map(p=>p.version))+1,createdAt:new Date().toISOString()});await tx.objectStore('companyProfiles').put(c);await tx.objectStore('meta').put({key:'currentProfileVersion',value:c.version});await tx.done;this.notify();}
 async saveSource(source:Source){await (await this.db()).put('sources',sourceSchema.parse(source));this.notify();}
 async ingestLiveCollection(input:{sourceId:string;sourceName:string;contents:Content[];warnings?:string[];runLabel?:string}){
  const db=await this.db();
  const tx=db.transaction(['contents','analyses','contentSources','sources','companyProfiles','runs'],'readwrite');
  try{
   const source=await tx.objectStore('sources').get(input.sourceId);
   if(!source)throw new RadarError('NOT_FOUND','출처를 찾을 수 없습니다.');
   const profiles=await tx.objectStore('companyProfiles').getAll();
   const profileVersion=Math.max(1,...profiles.map(p=>p.version));
   let added=0,updated=0;
   const now=new Date().toISOString();
   for(const raw of input.contents){
    const c=contentSchema.parse({...raw,url:canonicalUrl(raw.url),dedupKey:dedup(raw.type,raw.url),dataOrigin:'live'});
    const prev=await tx.objectStore('contents').index('dedupKey').get(c.dedupKey);
    if(prev){
     await tx.objectStore('contents').put({...prev,title:c.title,description:c.description,image:c.image||prev.image,duration:c.duration||prev.duration,checkedAt:now,contentHash:c.contentHash});
     await tx.objectStore('contentSources').put({contentId:prev.id,sourceId:input.sourceId});
     updated++;
     continue;
    }
    await tx.objectStore('contents').put(c);
    const analysis=classify(c,profileVersion);
    analysis.summary=(c.description||'').slice(0,600)||'영상 소개 요약: 메타데이터 기준으로 분류했습니다.';
    analysis.evidenceScope='metadata';
    analysis.unknowns=[...analysis.unknowns,'영상 대본·자막은 확보되지 않아 영상 소개(메타데이터) 기준입니다.'];
    await tx.objectStore('analyses').put(analysis);
    await tx.objectStore('contentSources').put({contentId:c.id,sourceId:input.sourceId});
    added++;
   }
   const status=input.warnings?.length&&!added&&!updated?'부분 실패':input.warnings?.length?'부분 성공':'성공';
   if(added||updated)await tx.objectStore('sources').put({...source,name:input.sourceName||source.name,lastSuccessAt:now});
   await tx.objectStore('runs').put({id:crypto.randomUUID(),startedAt:now,type:input.runLabel||`YouTube 수집 · ${source.name}`,count:added+updated,status});
   await tx.done;
   this.notify();
   return {added,updated,status};
  }catch(e){
   try{tx.abort();await tx.done;}catch{/* keep original */}
   return storageError(e);
  }
 }
 async exportWorkspace(){const {runs,...b}=await this.snapshot();return backupSchema.parse(b);}
 async getMeta<T=unknown>(key:string):Promise<T|undefined>{return (await (await this.db()).get('meta',key))?.value as T|undefined;}
 async setMeta(key:string,value:unknown){await (await this.db()).put('meta',{key,value});}
 async previewImport(raw:unknown){const b=backupSchema.parse(raw);const current=await this.snapshot();const keys=new Map(current.contents.map(c=>[c.dedupKey,c]));let duplicate=0,conflicts=0;for(const c of b.contents){const old=keys.get(dedup(c.type,c.url));if(old){duplicate++;const incoming=b.notes.find(n=>n.contentId===c.id),existing=current.notes.find(n=>n.contentId===old.id);if(incoming&&existing&&incoming.body!==existing.body)conflicts++;}}return {backup:b,newCount:b.contents.length-duplicate,duplicate,conflicts};}
 async importWorkspace(raw:Backup,mode:'merge'|'replace',noteChoice:'keep'|'incoming'='keep'){const b=backupSchema.parse(raw);const db=await this.db(),tx=db.transaction(stores,'readwrite');try{const w=(await tx.objectStore('workspaces').getAll())[0];if(mode==='replace')for(const s of stores.filter(s=>s!=='workspaces'&&s!=='meta'))await tx.objectStore(s).clear();const profileMap=new Map<number,number>();const profiles=await tx.objectStore('companyProfiles').getAll();let nextVersion=Math.max(0,...profiles.map(p=>p.version));for(const p of b.companyProfiles){const same=profiles.find(o=>o.description===p.description&&JSON.stringify(o.products)===JSON.stringify(p.products)&&JSON.stringify(o.countries)===JSON.stringify(p.countries));const version=same?.version||++nextVersion;profileMap.set(p.version,version);if(!same)await tx.objectStore('companyProfiles').put({...p,version});}const mapping=new Map<string,string>();for(const original of b.contents){const c={...original,dedupKey:dedup(original.type,original.url)};const prev=await tx.objectStore('contents').index('dedupKey').get(c.dedupKey);const target=prev?.id||crypto.randomUUID();mapping.set(c.id,target);if(!prev)await tx.objectStore('contents').put({...c,id:target});}const sourceMap=new Map<string,string>();const existingSources:Source[]=await tx.objectStore('sources').getAll();for(const s of b.sources){const existing=existingSources.find(e=>e.url===s.url);const id=existing?.id||crypto.randomUUID();sourceMap.set(s.id,id);if(!existing)await tx.objectStore('sources').put({...s,id});}for(const l of b.contentSources)await tx.objectStore('contentSources').put({contentId:mapping.get(l.contentId),sourceId:sourceMap.get(l.sourceId)});for(const a of b.analyses){const contentId=mapping.get(a.contentId)!;const version=profileMap.get(a.profileVersion)!;const analysisKey=`${contentId}:${version}:${a.method}`;if(!await tx.objectStore('analyses').index('analysisKey').get(analysisKey))await tx.objectStore('analyses').put({...a,id:crypto.randomUUID(),contentId,profileVersion:version,analysisKey});}for(const mark of b.bookmarks)await tx.objectStore('bookmarks').put({...mark,workspaceId:w.id,contentId:mapping.get(mark.contentId)});for(const n of b.notes){const contentId=mapping.get(n.contentId)!;const old=await tx.objectStore('notes').get([w.id,contentId]);if(!old||noteChoice==='incoming')await tx.objectStore('notes').put({...n,workspaceId:w.id,contentId,version:(old?.version||0)+1});}await tx.objectStore('meta').put({key:'currentProfileVersion',value:nextVersion});await tx.objectStore('runs').put({id:crypto.randomUUID(),startedAt:new Date().toISOString(),type:`JSON ${mode==='merge'?'병합':'복원'}`,count:b.contents.length,status:'성공'});await tx.done;this.notify();return {count:b.contents.length};}catch(e){try{tx.abort();await tx.done;}catch{/* Atomic rollback. */}return storageError(e);}}
 async reset(){const db=await this.db(),tx=db.transaction(stores,'readwrite');for(const s of stores.filter(s=>!['workspaces','meta','companyProfiles'].includes(s)))await tx.objectStore(s).clear();await tx.done;this.notify();}
 notify(){changes?.postMessage('changed');this.queueCloudSync();}
 async close(){(await this.db()).close();this.connection=undefined;}
}
export const repository=new RadarRepository();
