"""Evaluate identical held-out RTS map cases against JEV or Ollama.

This reports agreement with synthetic heuristic labels, not proven strategic
quality. Requests only use local loopback; no connector/network latency is timed.
"""
import argparse,collections,json,math,statistics,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(r'C:\Users\Public\openjev')
GAME=Path(r'C:\Users\bogmk\Documents\Codex\2026-10-05\i-x20\outputs\iron-field')
DATA=ROOT/'outputs'/'rts-map-combined-arms-dataset'/'test_cases.jsonl'
PREFIX='The synthetic game heuristic recommends this operation: '

def post(url,body,timeout):
 req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,timeout=timeout) as resp:return json.load(resp)
def get(url):
 with urllib.request.urlopen(url,timeout=5) as resp:return json.load(resp)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--provider',choices=['jev','ollama'],required=True);p.add_argument('--model',required=True);p.add_argument('--port',type=int,default=8011);p.add_argument('--output',type=Path,required=True);p.add_argument('--limit',type=int,default=0);a=p.parse_args()
 if a.output.exists():raise RuntimeError('Output already exists; refusing to overwrite')
 rows=[json.loads(x) for x in DATA.read_text(encoding='utf-8').splitlines() if x.strip()]
 if a.limit:rows=rows[:a.limit]
 evidence=json.loads(subprocess.run(['node','-e',"console.log(JSON.stringify(require('./commander.cjs').operationEvidence))"],cwd=GAME,capture_output=True,text=True,check=True).stdout)
 if a.provider=='jev':
  base=f'http://127.0.0.1:{a.port}';h=get(base+'/health');models=get(base+'/v1/models');
  if h.get('status')!='ready' or a.model not in [m['id'] for m in models['data']]:raise RuntimeError('JEV model unavailable')
 else:
  base='http://127.0.0.1:11434';models=get(base+'/api/tags');found=next((m for m in models['models'] if m['name']==a.model),None)
  if not found:raise RuntimeError('Ollama model unavailable')
 results=[];partial=a.output.with_suffix('.partial.json')
 for i,x in enumerate(rows):
  names=x['choices'];started=time.perf_counter()
  if a.provider=='jev':
   hypotheses=[PREFIX+n+'.' for n in names];body={'model':a.model,'premise':x['premise'],'choices':hypotheses};response=post(base+'/classify',body,30);scores=response['choices']
   if len(scores)!=len(names):raise RuntimeError('Incomplete classifier response')
   values=[]
   for text,row in zip(hypotheses,scores):
    if row['text']!=text:raise RuntimeError('Candidate order mismatch')
    q=row['nli']['probabilities'];vals=[q[k] for k in ('entailment','contradiction','neutral')]
    if any(not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1 for v in vals) or abs(sum(vals)-1)>.01:raise RuntimeError('Invalid classifier probabilities')
    values.append(q['entailment']-q['contradiction'])
   choice=names[max(range(len(names)),key=lambda j:values[j])]
  else:
   definition='\n'.join(f'{n} = {evidence[n]}' for n in names)
   prompt=('Command our army. Match the evidence to an offered operation. Defend immediate danger, then exploit a winning attack. The lookahead ranking is an approximation, not a prediction.\n'+definition+'\nReturn the selected name as a JSON string.\n'+x['premise']+'\nChoose only: '+','.join(names)+'.')
   body={'model':a.model,'stream':False,'think':False,'format':{'type':'string','enum':names},'keep_alive':'30m','options':{'temperature':0,'num_predict':24,'num_ctx':1536,'num_thread':4},'messages':[{'role':'user','content':prompt}]};response=post(base+'/api/chat',body,90);choice=json.loads(response['message']['content']);scores=None
   if choice not in names:raise RuntimeError('Invalid Ollama choice')
  results.append({'id':x['id'],'pair_id':x['pair_id'],'family':x['family'],'map':x['map'],'expected':x['expected'],'choice':choice,'correct':choice==x['expected'],'latencyMs':round((time.perf_counter()-started)*1000),'scores':scores})
  if (i+1)%10==0 or i+1==len(rows):
   partial.write_text(json.dumps({'status':'in-progress','provider':a.provider,'model':a.model,'results':results},indent=2),encoding='utf-8');print(f'{a.provider}: {i+1}/{len(rows)}',flush=True)
 families={};maps={}
 for x in results:
  for d,key in ((families,x['family']),(maps,x['map'])):
   item=d.setdefault(key,{'total':0,'correct':0});item['total']+=1;item['correct']+=x['correct']
 pairs=collections.defaultdict(list)
 for x in results:pairs[x['pair_id']].append(x)
 summary={'cases':len(results),'correct':sum(x['correct'] for x in results),'medianMs':round(statistics.median(x['latencyMs'] for x in results)),'over5s':sum(x['latencyMs']>5000 for x in results),'completePairs':sum(len(p)==2 for p in pairs.values()),'bothCorrect':sum(len(p)==2 and all(x['correct'] for x in p) for p in pairs.values()),'families':families,'maps':maps}
 report={'provider':a.provider,'model':a.model,'method':'Same held-out synthetic states, map observations and offered options; heuristic label agreement, not a gameplay win rate.','caveats':['Test shares scenario families and teacher rules with training, despite distinct states and wording.','Map observations are synthetic, not verified actual routes.','Formats differ across classifier and generative models.','Does not include connector/network latency or live game fallback.'],'summary':summary,'results':results}
 a.output.write_text(json.dumps(report,indent=2),encoding='utf-8');partial.unlink(missing_ok=True);print('Summary:',json.dumps(summary),flush=True)
if __name__=='__main__':main()
