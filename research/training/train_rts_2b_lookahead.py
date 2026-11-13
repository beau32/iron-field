"""Train a separate 2B RTS lookahead classifier from the existing OpenJEV adapter.

Stage 1 reproduces the 4B recommendation-data schedule (two epochs), and
stage 2 reproduces its lookahead continuation (one epoch). The input JSONL
files are used byte-for-byte; the original 2B and 4B adapters are untouched.
Labels are synthetic heuristics, not demonstrations or verified winning moves.
"""
import argparse, hashlib, importlib.util, json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'outputs' / 'qwen35-2b-rts-lookahead-nli'
STAGE1 = OUT / 'stage1-recommendation'
SOURCE = ROOT / 'qwen35-2b-openjev'
DATA1 = ROOT / 'outputs' / 'qwen35-4b-rts-recommendation-nli'
DATA2 = ROOT / 'outputs' / 'qwen35-4b-rts-lookahead-nli'
spec = importlib.util.spec_from_file_location('rts_backend_2b', ROOT / 'train_rts_lookahead_backend.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)

def read(path):
    with path.open(encoding='utf-8') as f:
        return [json.loads(line) for line in f if line.strip()]

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check-data',action='store_true')
    parser.add_argument('--smoke-test',action='store_true')
    parser.add_argument('--resume',type=Path)
    args=parser.parse_args()
    inputs={'stage1_train':DATA1/'train_recommendation_nli.jsonl',
            'stage1_validation':DATA1/'validation_recommendation_nli.jsonl',
            'stage2_train':DATA2/'train_lookahead_nli.jsonl',
            'stage2_validation':DATA2/'validation_lookahead_nli.jsonl'}
    data={key:read(path) for key,path in inputs.items()}
    expected={'stage1_train':5700,'stage1_validation':1140,'stage2_train':8900,'stage2_validation':1780}
    if any(len(data[k])!=v for k,v in expected.items()):raise RuntimeError('Unexpected dataset sizes')
    if not (SOURCE/'adapter_model.safetensors').is_file():raise FileNotFoundError('Original 2B adapter missing')
    if (OUT/'adapter-final').exists() and not args.check_data:raise RuntimeError('Final adapter exists; refusing to overwrite')
    OUT.mkdir(parents=True,exist_ok=True)
    manifest={'source_adapter':str(SOURCE),'source_adapter_sha256':digest(SOURCE/'adapter_model.safetensors'),
              'inputs':{k:{'path':str(v),'sha256':digest(v),'examples':len(data[k])} for k,v in inputs.items()},
              'schedule':{'stage1_epochs':2,'stage2_epochs':1},
              'notes':['Same source datasets and epochs as the 4B training path.',
                       'Synthetic heuristic labels, not demonstrated optimal gameplay.',
                       'Original adapter remains unchanged.']}
    (OUT/'dataset_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(manifest,indent=2),flush=True)
    if args.check_data:return
    backend.TRAIN_BATCH_SIZE=4
    backend.GRADIENT_ACCUMULATION=4  # same effective batch of 16 as 4B
    if args.smoke_test:
        backend.SOURCE_ADAPTER=SOURCE;backend.OUTPUT_DIR=OUT;backend.MAX_LENGTH=384
        backend.train_model(data['stage2_train'][:48],data['stage2_validation'][:60],epochs=1,max_steps=1,smoke_test=True)
        return
    if args.resume:
        ck=args.resume.resolve()
        parents=[(STAGE1/'checkpoints').resolve(),(OUT/'checkpoints').resolve()]
        if ck.parent not in parents or not ck.is_dir() or not ck.name.startswith('checkpoint-'):raise ValueError('Checkpoint must belong to this 2B experiment')
        os.environ['RTS_LOOKAHEAD_RESUME']=str(ck)
    if not (STAGE1/'adapter-final').exists():
        backend.SOURCE_ADAPTER=SOURCE;backend.OUTPUT_DIR=STAGE1;backend.MAX_LENGTH=288
        if args.resume and args.resume.resolve().parent!=(STAGE1/'checkpoints').resolve():raise RuntimeError('Stage 1 is incomplete')
        print('Starting stage 1: original 2B to RTS recommendation NLI',flush=True)
        backend.train_model(data['stage1_train'],data['stage1_validation'],epochs=2,max_steps=None,smoke_test=False)
        os.environ.pop('RTS_LOOKAHEAD_RESUME',None)
    else:
        print('Using completed stage 1 adapter',flush=True)
        if args.resume and args.resume.resolve().parent==(STAGE1/'checkpoints').resolve():raise RuntimeError('Stage 1 already complete; refuse to replace it')
    backend.SOURCE_ADAPTER=STAGE1/'adapter-final';backend.OUTPUT_DIR=OUT;backend.MAX_LENGTH=384
    print('Starting stage 2: lookahead-aware RTS NLI',flush=True)
    result=backend.train_model(data['stage2_train'],data['stage2_validation'],epochs=1,max_steps=None,smoke_test=False)
    print(json.dumps(result,indent=2),flush=True)

if __name__=='__main__':main()
