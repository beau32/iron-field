"""Continue the trained RTS 4B adapter on the map/combined-arms dataset.

Explicitly run this script to train; --check-data validates files without loading a model.
The existing adapter and the independent test split are never modified.
"""
import argparse,hashlib,importlib.util,json,os
from collections import Counter
from pathlib import Path
ROOT=Path(r'C:\Users\Public\openjev')
DATA=ROOT/'outputs'/'rts-map-combined-arms-dataset'
OUT=ROOT/'outputs'/'qwen35-4b-rts-map-combined-arms-nli'
ADAPTER=ROOT/'outputs'/'qwen35-4b-rts-lookahead-nli'/'adapter-final'
spec=importlib.util.spec_from_file_location('lookahead_training_backend',ROOT/'train_rts_lookahead_backend.py')
backend=importlib.util.module_from_spec(spec);spec.loader.exec_module(backend)
backend.ROOT=ROOT;backend.SOURCE_ADAPTER=ADAPTER;backend.OUTPUT_DIR=OUT;backend.MAX_LENGTH=384

def read(path):
 with path.open(encoding='utf-8') as f:return [json.loads(s) for s in f if s.strip()]
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check-data',action='store_true');p.add_argument('--smoke-test',action='store_true');p.add_argument('--epochs',type=float,default=1.0);p.add_argument('--resume',type=Path);a=p.parse_args()
 if a.epochs<=0:p.error('--epochs must be positive')
 if (OUT/'adapter-final').exists() and not a.check_data and not a.smoke_test:raise RuntimeError('Completed adapter exists; refusing to overwrite')
 if a.resume:
  cp=a.resume.resolve()
  if cp.parent!=(OUT/'checkpoints').resolve() or not cp.is_dir() or not cp.name.startswith('checkpoint-'):raise ValueError('Resume path must be an existing experiment checkpoint')
  os.environ['RTS_LOOKAHEAD_RESUME']=str(cp)
 train_path=DATA/'combined_train_nli.jsonl';valid_path=DATA/'combined_validation_nli.jsonl';test_path=DATA/'test_cases.jsonl'
 train=read(train_path);valid=read(valid_path);test=read(test_path);audit=json.loads((DATA/'audit.json').read_text(encoding='utf-8'))
 if audit.get('integrity')!='passed' or audit.get('over_384')!=0:raise RuntimeError('Dataset integrity/token audit has not passed')
 labels={'entailment','neutral','contradiction'}
 for rows in (train,valid):
  if set(x['label'] for x in rows)!=labels:raise ValueError('Training and validation must retain all three NLI classes')
 if not (ADAPTER/'adapter_config.json').is_file():raise FileNotFoundError('Lookahead adapter not found')
 info={'train_examples':len(train),'validation_examples':len(valid),'untouched_test_cases':len(test),'train_labels':dict(Counter(x['label'] for x in train)),'base_adapter':str(ADAPTER),'files_sha256':{p.name:digest(p) for p in (train_path,valid_path,test_path)},'caveats':['Synthetic heuristic labels are not evidence of optimal play.','The held-out test shares scenario families with training.','Live JEV input does not currently provide these tactical map observations.']}
 print(json.dumps(info,indent=2),flush=True)
 if a.check_data:return
 OUT.mkdir(parents=True,exist_ok=True);(OUT/'data-provenance.json').write_text(json.dumps(info,indent=2)+'\n',encoding='utf-8')
 if a.smoke_test:train=train[:24]+train[-24:];valid=valid[:30]+valid[-30:]
 result=backend.train_model(train,valid,epochs=1.0 if a.smoke_test else a.epochs,max_steps=1 if a.smoke_test else None,smoke_test=a.smoke_test)
 print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':main()
