"""Run paired model-tier comparisons and restore the pre-existing JEV model."""
import json,os,socket,subprocess,sys,time,urllib.request
from pathlib import Path
ROOT=Path(os.environ.get('OPENJEV_ROOT',r'C:\Users\Public\openjev'))
GAME=Path(__file__).resolve().parent.parent
PY=ROOT/'.venv-local'/'Scripts'/'python.exe'
BASE='http://127.0.0.1:8011'; TEMP='http://127.0.0.1:18012'
PAIRS=[
 ('2b-trained-vs-2b-original','qwen35-2b-rts-lookahead','jev','qwen35-2b-openjev','jev'),
 ('2b-trained-vs-4b-original','qwen35-2b-rts-lookahead','jev','qwen35-4b-openjev','jev'),
 ('4b-trained-vs-4b-original','qwen35-4b-rts-lookahead','jev','qwen35-4b-openjev','jev'),
 ('4b-trained-vs-9b-base','qwen35-4b-rts-lookahead','jev','qwen3.5:9b','ollama'),
 ('9b-trained-vs-9b-base','qwen3.5:9b-rts-synthetic-full','ollama','qwen3.5:9b','ollama')]
if os.environ.get('TIER_PAIRS'):
 PAIRS=[p for p in PAIRS if p[0] in os.environ['TIER_PAIRS'].split(',')]
 if not PAIRS: raise RuntimeError('No selected pairs')
def get(url):
 with urllib.request.urlopen(url,timeout=5) as r:return json.load(r)
def activate(model):
 body=json.dumps({'model':model,'premise':'Our refinery and miners are working.','choices':['Income is working.']}).encode()
 with urllib.request.urlopen(urllib.request.Request(BASE+'/classify',data=body,headers={'Content-Type':'application/json'}),timeout=180) as r:return json.load(r)
def stop(proc):
 if proc and proc.poll() is None:
  subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],capture_output=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  try:proc.wait(timeout=15)
  except subprocess.TimeoutExpired:proc.kill();proc.wait()
def main():
 with socket.socket() as s:s.bind(('127.0.0.1',18012))
 initial=get(BASE+'/health'); original=initial['adapter'];print('Original JEV selection:',original,flush=True)
 names={m['id'] for m in get(BASE+'/v1/models')['data']}; tags={m['name'] for m in get('http://127.0.0.1:11434/api/tags')['models']}
 for _,a,ap,b,bp in PAIRS:
  for model,provider in ((a,ap),(b,bp)):
   if model not in (names if provider=='jev' else tags):raise RuntimeError('Missing model '+model)
 prefix='tier-comparison-20261113'; outdir=GAME/'benchmarks';
 for name,*_ in PAIRS:
  for mode in ('smoke','full'):
   p=outdir/f'{prefix}-{name}-{mode}.json'
   if p.exists():raise RuntimeError('Output exists: '+str(p))
 current=None; failed=[]
 try:
  for name,a,ap,b,bp in PAIRS:
   proc=None; print('\nSTART PAIR',name,flush=True)
   try:
    if ap=='jev':
     log=(outdir/f'{prefix}-{name}-service.log').open('w',encoding='utf8')
     proc=subprocess.Popen([str(PY),str(ROOT/'ollama_nli_api.py'),'--port','18012','--adapter',a],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
     for _ in range(180):
      if proc.poll() is not None:raise RuntimeError('Temporary service exited; see '+str(log.name))
      try:
       if get(TEMP+'/health').get('adapter')==a:break
      except Exception:pass
      time.sleep(1)
     else:raise TimeoutError('Temporary service failed to start')
    if bp=='jev': print('Loading',b,'on existing service',flush=True);activate(b);current=b
    env=os.environ.copy();env.update(DUEL_SMALL=a,DUEL_SMALL_PROVIDER=ap,DUEL_LARGE=b,DUEL_LARGE_PROVIDER=bp)
    for mode,maps,seconds in [('smoke','river','60'),('full','classic,river,crossroads','900')]:
     print('RUN',name,mode,flush=True)
     subprocess.run(['node',str(GAME/'benchmarks'/'tier-adaptation-duel.cjs'),'--maps',maps,'--seconds',seconds,'--output',str(outdir/f'{prefix}-{name}-{mode}.json')],cwd=GAME,env=env,check=True)
   except Exception as e:
    print('PAIR FAILED',name,str(e),flush=True);failed.append(name)
   finally:
    stop(proc)
    if proc:log.close()
 finally:
  try:
   h=get(BASE+'/health')
   if original!=h.get('adapter') and h.get('adapter')==current:
    print('Restoring JEV adapter',original,flush=True);activate(original)
   else:print('Leaving current JEV selection unchanged',flush=True)
  except Exception as e:print('RESTORE FAILED',e,flush=True)
 print('FINISHED; failed:',failed,flush=True)
 if failed:sys.exit(1)
if __name__=='__main__':main()
