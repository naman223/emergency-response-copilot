import {randomUUID} from 'node:crypto';
import {conversationTurnSchema,validateCoordinatorResponse,type ConversationEvent,type ConversationSnapshot,type ConversationTurn,type TurnRequest,type RetryTurnRequest} from '@copilot/contracts';
import {assertSession,sessionKey,type Session} from '../auth/session';
import {own,incidentKey,type IncidentRecord} from '../incidents/service';
import {AppError,requireCondition} from '../errors';
import type {Database} from '../infra/repository';
import type {AudioStore} from '../infra/audio-store';
import type {Config} from '../config';
import {reserveInference} from '../analysis/budget';
import {recoverConversation,turnKey} from './recovery';
import type {ConversationProvider,ProviderInput} from './provider';
type StoredTurn={turn:ConversationTurn;canonical:string;attemptIds:string[]};
type Emit=(event:ConversationEvent)=>Promise<void>;
export class ConversationService{
 constructor(private d:{db:Database;audio:AudioStore;config:Config;provider:ConversationProvider}){}
 async get(session:Session,id:string):Promise<ConversationSnapshot>{await recoverConversation(this.d.db,session,id);const s=assertSession(await this.d.db.get<Session>(sessionKey(session.uid)));const r=own(await this.d.db.get<IncidentRecord>(incidentKey(id)),s);const rows=await Promise.all((r.turnIds??[]).map(t=>this.d.db.get<StoredTurn>(turnKey(id,t))));return {incident:r.incident,turns:rows.filter((v):v is StoredTurn=>!!v).map(v=>conversationTurnSchema.parse(v.turn))}}
 async run(session:Session,id:string,req:TurnRequest,emit:Emit){return this.execute(session,id,req.turnId,req,undefined,emit)}
 async retry(session:Session,id:string,turnId:string,req:RetryTurnRequest,emit:Emit){return this.execute(session,id,turnId,undefined,req,emit)}
 private async execute(session:Session,id:string,tid:string,request:TurnRequest|undefined,retry:RetryTurnRequest|undefined,emit:Emit):Promise<ConversationSnapshot>{
  await recoverConversation(this.d.db,session,id);
  const key=incidentKey(id),sk=sessionKey(session.uid),tk=turnKey(id,tid),token=randomUUID();
  const reserved=await this.d.db.transact([key,sk,tk,'quota:global'],docs=>{
   const s=assertSession(docs[sk]),r=own(docs[key],s),prior=docs[tk] as StoredTurn|undefined;
   if(request&&prior){requireCondition(prior.canonical===JSON.stringify(request),409,'TURN_CONFLICT','This message ID already belongs to different content.');requireCondition(prior.turn.state!=='processing',409,'TURN_ACTIVE','This response is already in progress.');return {result:{replay:true,record:r,stored:prior}}}
   if(retry){requireCondition(prior,404,'NOT_FOUND','Conversation turn not found.');if(prior.turn.state==='completed'||prior.attemptIds.includes(retry.attemptId))return {result:{replay:true,record:r,stored:prior}};requireCondition(['failed','interrupted'].includes(prior.turn.state),409,'TURN_ACTIVE','This turn is already processing.')}
   requireCondition(!['approved','closed'].includes(r.incident.reviewState),409,'INCIDENT_CLOSED','Start a new incident to report more information.');
   requireCondition(r.incident.revision===(request??retry)!.expectedRevision,409,'STALE_REVISION','The incident changed. Reload the conversation.');
   const now=Date.now();requireCondition(!s.activeLease||s.activeLease.until<=now,409,'ANALYSIS_ACTIVE','Another response is in progress.');
   requireCondition(!r.lease||r.lease.until<=now,409,'ANALYSIS_ACTIVE','This incident is processing.');
   requireCondition(!prior||prior.turn.attempts<3,429,'ATTEMPT_LIMIT','Three attempts used. Continue with manual review.');
   if(!prior){requireCondition((r.turnIds?.length??0)<20,429,'TURN_LIMIT','This incident reached its 20-message limit.');requireCondition(request!.kind==='initial'?!(r.turnIds?.length):!!r.turnIds?.length,409,'TURN_ORDER','Start with the original report.');}
   const at=new Date().toISOString();const stored:StoredTurn=prior??{canonical:JSON.stringify(request),attemptIds:[],turn:{id:tid,incidentId:id,kind:request!.kind,officerText:request!.kind==='initial'?(r.reportText??''):request!.text!,state:'pending',attempts:0,createdAt:at,updatedAt:at}};
   stored.turn={...stored.turn,state:'processing',attempts:stored.turn.attempts+1,updatedAt:at};delete stored.turn.failureCode;if(retry)stored.attemptIds.push(retry.attemptId);
   const budget=reserveInference(docs,sk,now),lease={token,until:now+this.d.config.analysisTimeout+5000};budget.session.activeLease=lease;
   r.turnIds=prior?r.turnIds:[...(r.turnIds??[]),tid];r.activeTurnId=tid;r.lease=lease;r.incident={...r.incident,analysisState:'processing',revision:r.incident.revision+1};delete r.incident.failureCode;
   return {result:{replay:false,record:r,stored},put:{[key]:r,[tk]:stored,[sk]:budget.session,'quota:global':budget.globalQuota}};
  });
  let seq=0;
  const send=async(event:Omit<ConversationEvent,'turnId'|'sequence'>|any)=>{assertSession(await this.d.db.get<Session>(sk));await emit({...event,turnId:tid,sequence:++seq})};
  if(reserved.replay){const snapshot=await this.get(session,id);await send({type:'completed',snapshot});return snapshot}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let response:ReturnType<typeof validateCoordinatorResponse>|undefined;let failure:string|undefined;
  try{
   await send({type:'status',stage:'receiving_report'});
   const snapshot=await this.get(session,id),r=reserved.record;
   const input:ProviderInput={report:{...(r.reportText?{text:r.reportText}:{}),transcript:r.incident.sourceTranscript??r.incident.brief?.transcript,...(r.audioKey&&reserved.stored.turn.kind==='initial'?{wav:await this.d.audio.get(r.audioKey)}:{})},turns:snapshot.turns,assessment:r.incident.assessment,sampleId:r.sampleId,signal:controller.signal};
   requireCondition(Buffer.byteLength(JSON.stringify({...input,report:{...input.report,wav:undefined},signal:undefined}))<=65536,413,'CONTEXT_LIMIT','Conversation context is full. Continue with manual review.');
   await send({type:'status',stage:'analyzing_report'});
   const operation=async()=>{let output:unknown,hasResult=false,received='';for await(const chunk of this.d.provider.generate(input)){if(controller.signal.aborted)throw Error('Interrupted');if(chunk.type==='delta'){received+=chunk.text;requireCondition(received.length<=4000,502,'INVALID_RESPONSE','Coordinator reply exceeded its limit.');await send({type:'delta',text:chunk.text})}else{requireCondition(!hasResult,502,'INVALID_RESPONSE','Multiple final responses.');output=chunk.response;hasResult=true;}}requireCondition(hasResult,502,'INCOMPLETE_RESPONSE','The coordinator response was interrupted.');const parsed=validateCoordinatorResponse(output,{transcript:input.report.transcript,messages:Object.fromEntries(snapshot.turns.map(t=>[t.id,t.officerText]))},reserved.stored.turn.kind==='initial'&&!!r.audioKey);requireCondition(!received||received===parsed.reply,502,'INVALID_RESPONSE','The coordinator response changed unexpectedly.');return parsed;};
   await send({type:'status',stage:'receiving_response'});
   response=await Promise.race([operation(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AppError(504,'CONVERSATION_TIMEOUT','Coordinator response timed out.'))},this.d.config.analysisTimeout)})]);
   await send({type:'status',stage:'updating_context'});
  }catch(e){failure=e instanceof AppError?e.code:'CONVERSATION_FAILED';controller.abort()}finally{if(timer)clearTimeout(timer)}
  await this.d.db.transact([key,sk,tk],docs=>{const s=assertSession(docs[sk]),r=own(docs[key],s),stored=docs[tk] as StoredTurn;requireCondition(r.lease?.token===token&&s.activeLease?.token===token&&!!stored,409,'STALE_TURN','A newer operation replaced this response.');delete r.lease;delete r.activeTurnId;delete s.activeLease;
   const incident={...r.incident,revision:r.incident.revision+1,analysisState:response?'ready' as const:'failed' as const};if(failure)incident.failureCode=failure;else delete incident.failureCode;
   if(response?.assessment){incident.assessment=response.assessment;incident.contextVersion=(incident.contextVersion??0)+1}if(response?.transcript!==undefined)incident.sourceTranscript=response.transcript;
   stored.turn={...stored.turn,state:response?'completed':'failed',updatedAt:new Date().toISOString(),...(response?{reply:response.reply,question:response.question,suggestedReplies:response.suggestedReplies,assessment:response.assessment,completedRevision:incident.revision}:{failureCode:failure})};
   requireCondition(Buffer.byteLength(JSON.stringify(stored))<=65536,413,'TURN_SIZE','Response exceeded storage limits.');return {result:null,put:{[key]:{...r,incident},[tk]:stored,[sk]:s}};
  });
  const snapshot=await this.get(session,id);await send(failure?{type:'failure',code:failure,message:'The response did not complete. Your report is saved. Retry or review it manually.'}:{type:'completed',snapshot});return snapshot;
 }
}
