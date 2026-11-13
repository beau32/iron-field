"""Compare each pair's decisions on identical recorded benchmark inputs."""
import json,statistics,time,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent; BASE='http://127.0.0.1:8011'; OLL='http://127.0.0.1:11434'
PAIRS=['2b-trained-vs-2b-original','2b-trained-vs-4b-original','4b-trained-vs-4b-original','9b-trained-vs-9b-base']
def get(url):
 with urllib.request.urlopen(url,timeout=5) as r:return json.load(r)
def post(url,body,timeout=180):
 req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)
def activate(model):post(BASE+'/classify',{'model':model,'premise':'Income working.','choices':['Income is working.']})
def main():
 output=HERE/'tier-comparison-20261113-matched-states.json'
 if output.exists():raise RuntimeError('Output exists')
 original=get(BASE+'/health')['adapter'];last=None;results={'method':'Replay exactly identical recorded request bodies and candidates to each model, three states per game at first/middle/last decision from the trained side; model id and 9B GPU layers differ. This tests choice agreement, not match outcomes or move quality. States may repeat.','pairs':{}}
 try:
  for pair in PAIRS:
   d=json.loads((HERE/f'tier-comparison-20261113-{pair}-full.json').read_text(encoding='utf-8')); models=d['models']; rows=[]
   for run in d['runs']:
    trace=run['trace'];inds=sorted(set([0,len(trace)//2,len(trace)-1]));side=run['smallSide']
    for i in inds:
     dec=trace[i]['decisions'][side];rows.append({'map':run['map'],'smallSide':side,'gameSeconds':trace[i]['startSeconds'],'offered':dec['offered'],'request':dec['request'],'originalChoice':dec['choice'],'choices':{}})
   for key in ('small','large'):
    m=models[key];print('REPLAY',pair,m['name'],len(rows),'states',flush=True)
    if m['provider']=='jev':activate(m['name']);last=m['name']
    for row in rows:
     body=dict(row['request']);body['model']=m['name'];start=time.time()
     if m['provider']=='jev':
      response=post(BASE+'/classify',body);scores=[x['nli']['probabilities']['entailment']-x['nli']['probabilities']['contradiction'] for x in response['choices']]; choice=row['offered'][max(range(len(scores)),key=lambda n:scores[n])]
     else:
      body['keep_alive']='5m';body['options']=dict(body['options']);
      if m['name']=='qwen3.5:9b':body['options']['num_gpu']=8
      response=post(OLL+'/api/chat',body,240);choice=json.loads(response['message']['content']);scores=None
      if choice not in row['offered']:raise ValueError('Response not among candidates')
     row['choices'][key]={'model':m['name'],'choice':choice,'scores':scores,'latencyMs':round((time.time()-start)*1000)}
   matches=sum(r['choices']['small']['choice']==r['choices']['large']['choice'] for r in rows)
   original_reproduced=sum(r['choices']['small']['choice']==r['originalChoice'] for r in rows)
   results['pairs'][pair]={'models':models,'sameChoice':matches,'originalChoiceReproduced':original_reproduced,'states':rows};output.write_text(json.dumps(results,indent=2),encoding='utf8');print('RESULT',pair,matches,'/',len(rows),'reproduced',original_reproduced,flush=True)
 finally:
  try:
   h=get(BASE+'/health')
   if h['adapter']==last and original!=last:print('Restore',original,flush=True);activate(original)
  except Exception as e:print('Restoration failed',e,flush=True)
 print('SAVED',output,flush=True)
if __name__=='__main__':main()
