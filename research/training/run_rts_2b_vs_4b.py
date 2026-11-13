"""Run a local 2B-vs-4B duel without replacing the user's JEV service.

The 2B service is temporary. The existing 4B service switches adapters during
the run, and its previous active adapter is restored afterward when safe.
"""
import json, socket, subprocess, sys, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
GAME=Path(r'C:\Users\bogmk\Documents\Codex\2026-10-05\i-x20\outputs\iron-field')
OUT=ROOT/'outputs'/'qwen35-2b-rts-lookahead-nli'
PYTHON=ROOT/'.venv-local'/'Scripts'/'python.exe'
MODEL2='qwen35-2b-rts-lookahead';MODEL4='qwen35-4b-rts-lookahead'

def get(url):
    with urllib.request.urlopen(url,timeout=5) as r:return json.load(r)
def activate(url,model):
    body=json.dumps({'model':model,'premise':'Our refinery and miners are working.','choices':['Income is working.']}).encode()
    req=urllib.request.Request(url+'/classify',data=body,headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=120) as r:return json.load(r)
def main():
    with socket.socket() as s:
        try:s.bind(('127.0.0.1',18012))
        except OSError as e:raise RuntimeError('Port 18012 is already in use') from e
    before=get('http://127.0.0.1:8011/health');original=before.get('adapter')
    if before.get('status')!='ready' or not original:raise RuntimeError('Existing 4B service is not ready')
    available=get('http://127.0.0.1:8011/v1/models')['data']
    if MODEL4 not in [x['id'] for x in available]:raise RuntimeError('Trained 4B is unavailable')
    if not (ROOT/MODEL2/'adapter_model.safetensors').is_file():raise RuntimeError('Trained 2B is unavailable')
    runs=[('river','60',GAME/'benchmarks'/'jev-2b-vs-4b-smoke-20261112.json'),('classic,river,crossroads','900',GAME/'benchmarks'/'jev-2b-vs-4b-duel-20261112.json')]
    for _,_,p in runs:
        if p.exists():raise RuntimeError('Output already exists: '+str(p))
    with (OUT/'duel-2b-service.log').open('w',encoding='utf-8') as log:
        process=subprocess.Popen([str(PYTHON),str(ROOT/'ollama_nli_api.py'),'--port','18012','--adapter',str(ROOT/MODEL2)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(120):
                if process.poll() is not None:raise RuntimeError('Temporary 2B service exited')
                try:
                    h=get('http://127.0.0.1:18012/health')
                    if h.get('status')=='ready' and h.get('adapter')==MODEL2:break
                except Exception:pass
                time.sleep(1)
            else:raise TimeoutError('2B service startup timed out')
            print('Loading trained 4B in existing service',flush=True);activate('http://127.0.0.1:8011',MODEL4)
            for maps,seconds,out in runs:
                print('Running',maps,'for up to',seconds,'seconds per match',flush=True)
                subprocess.run(['node',str(GAME/'benchmarks'/'duel-2b-vs-4b.cjs'),'--maps',maps,'--seconds',seconds,'--output',str(out)],cwd=GAME,check=True)
        finally:
            process.terminate()
            try:process.wait(timeout=15)
            except subprocess.TimeoutExpired:process.kill();process.wait()
            try:
                h=get('http://127.0.0.1:8011/health')
                if original!=MODEL4 and h.get('adapter')==MODEL4:
                    print('Restoring previously active model',original,flush=True);activate('http://127.0.0.1:8011',original)
                else:print('Existing service selection was changed externally or needs no restore',flush=True)
            except Exception as e:print('Could not restore previous active model:',str(e),file=sys.stderr,flush=True)
if __name__=='__main__':main()
