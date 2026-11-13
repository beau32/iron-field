"""Evaluate original and RTS-trained 2B on identical held-out synthetic cases.

Runs an isolated loopback JEV service, leaving the normal service untouched.
This measures agreement with heuristic labels, not a game win rate.
"""
import argparse, hashlib, json, os, shutil, socket, subprocess, sys, time, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'outputs'/'qwen35-2b-rts-lookahead-nli'
GAME=Path(r'C:\Users\bogmk\Documents\Codex\2026-10-05\i-x20\outputs\iron-field')
TRAINED=OUT/'adapter-final'
REGISTERED=ROOT/'qwen35-2b-rts-lookahead'
PYTHON=ROOT/'.venv-local'/'Scripts'/'python.exe'

def get(url):
    with urllib.request.urlopen(url,timeout=3) as response:return json.load(response)

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=18012);args=p.parse_args()
    if not (TRAINED/'adapter_model.safetensors').is_file():raise RuntimeError('Completed adapter not found')
    with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as check:
        try:check.bind(('127.0.0.1',args.port))
        except OSError as exc:raise RuntimeError('Evaluation port is in use; choose a free port with --port') from exc
    base=OUT/'benchmark-original-2b.json';adapted=OUT/'benchmark-rts-lookahead-2b.json';engine=OUT/'engine-comparison.json'
    # The service discovers top-level adapters on startup. Keep a separate copy
    # so the normal service can list it after the user restarts that service.
    tmp=ROOT/'qwen35-2b-rts-lookahead.pending'
    if REGISTERED.exists():
        weights=REGISTERED/'adapter_model.safetensors'
        if not weights.is_file() or hashlib.sha256(weights.read_bytes()).digest()!=hashlib.sha256((TRAINED/'adapter_model.safetensors').read_bytes()).digest():raise RuntimeError('Registered model differs; refusing to overwrite')
    else:
        if tmp.exists():raise RuntimeError('Pending model folder exists')
        shutil.copytree(TRAINED,tmp);tmp.rename(REGISTERED)
    log_path=OUT/'benchmark-service.log'
    with log_path.open('w',encoding='utf-8') as log:
        proc=subprocess.Popen([str(PYTHON),str(ROOT/'ollama_nli_api.py'),'--port',str(args.port),'--adapter',str(ROOT/'qwen35-2b-openjev')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            url=f'http://127.0.0.1:{args.port}'
            for _ in range(120):
                if proc.poll() is not None:raise RuntimeError('Isolated classifier exited; see '+str(log_path))
                try:
                    health=get(url+'/health')
                    if health.get('status')=='ready' and health.get('adapter')=='qwen35-2b-openjev':break
                except Exception:pass
                time.sleep(1)
            else:raise TimeoutError('Isolated classifier did not become ready')
            for model,target in [('qwen35-2b-openjev',base),('qwen35-2b-rts-lookahead',adapted)]:
                if target.exists():print('Using existing result',target,flush=True);continue
                print('Evaluating',model,flush=True)
                payload=json.dumps({'model':model,'premise':'Our refinery and miners are working.','choices':['Income is working.']}).encode()
                request=urllib.request.Request(url+'/classify',data=payload,headers={'Content-Type':'application/json'},method='POST')
                with urllib.request.urlopen(request,timeout=120) as response:json.load(response)
                subprocess.run([str(PYTHON),str(ROOT/'benchmark_rts_map_combined_arms.py'),'--provider','jev','--port',str(args.port),'--model',model,'--output',str(target)],cwd=ROOT,check=True)
            if engine.exists():
                if len(json.loads(engine.read_text(encoding='utf-8')).get('runs',[]))!=6:raise RuntimeError('Existing engine results are incomplete; preserve them and run a new output path')
                print('Using existing engine results',engine,flush=True)
            else:
                print('Running real-engine comparisons against a scripted opponent',flush=True)
                subprocess.run(['node',str(GAME/'benchmarks'/'compare-2b-rts-engine.cjs'),'--port',str(args.port),'--output',str(engine)],cwd=GAME,check=True)
        finally:
            proc.terminate()
            try:proc.wait(timeout=15)
            except subprocess.TimeoutExpired:proc.kill();proc.wait()
    a=json.loads(base.read_text(encoding='utf-8'));b=json.loads(adapted.read_text(encoding='utf-8'))
    if [x['id'] for x in a['results']]!=[x['id'] for x in b['results']]:raise RuntimeError('Evaluation cases do not match')
    lines=['# RTS 2B: held-out synthetic comparison','','The original and RTS-trained 2B used the same 280 held-out cases and ordered choices. Scores measure agreement with a synthetic heuristic teacher, not game wins or proven optimal decisions. The held-out cases share scenario families with other synthetic training, and use map descriptions not verified as actual routes.','','| Measure | Original OpenJEV 2B | RTS-lookahead 2B |','|---|---:|---:|',f"| Heuristic-label matches | {a['summary']['correct']} / {a['summary']['cases']} | {b['summary']['correct']} / {b['summary']['cases']} |",f"| Both decisions in a pair match | {a['summary']['bothCorrect']} / {a['summary']['completePairs']} | {b['summary']['bothCorrect']} / {b['summary']['completePairs']} |",f"| Median local request | {a['summary']['medianMs']} ms | {b['summary']['medianMs']} ms |",'','| Scenario family | Original 2B | RTS-lookahead 2B |','|---|---:|---:|']
    for k,v in a['summary']['families'].items():
        w=b['summary']['families'][k];lines.append(f"| {k} | {v['correct']} / {v['total']} | {w['correct']} / {w['total']} |")
    engine_data=json.loads(engine.read_text(encoding='utf-8'));lines+=['','## Real-engine games against a scripted opponent','','Same game rules, starting setup, seed and map for both models. Lookahead was on and the game was paused while decisions were requested. Each entry is one match; this is not direct head-to-head play. Solo AI assistance is enabled for both, and live network timeouts are not tested.','','| Map | Original 2B | RTS-lookahead 2B |','|---|---|---|']
    for map_id in ['classic','river','crossroads']:
        rs=[r for r in engine_data['runs'] if r['map']==map_id]
        def result(model):
            row=next(r for r in rs if r['model']==model);return (('AI win' if row['winner']=='enemy' else 'AI loss' if row['winner']=='player' else 'timeout')+f" at {round(row['elapsed'])}s")
        lines.append(f"| {map_id} | {result('qwen35-2b-openjev')} | {result('qwen35-2b-rts-lookahead')} |")
    lines+=['','These results include only one scripted opponent and one seed per map; a single comparison does not establish a general win rate. The compact benchmark input differs from the live game JEV prompt, so live outcomes may differ. The original 2B adapter was not overwritten.','',f'Raw results: {base.name}, {adapted.name}, {engine.name}.']
    (OUT/'benchmark-report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('\n'.join(lines),flush=True)
if __name__=='__main__':main()
