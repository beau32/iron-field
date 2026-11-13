"""Fuse the trained adapter into a fresh BF16 copy; verify every changed value."""
import json, shutil, struct, sys
from pathlib import Path
import torch
from safetensors import safe_open
ROOT=Path(__file__).resolve().parent
BASE=ROOT.parent/'qwen35-9b-rts'/'base'
FULL='--full' in sys.argv
MERGED=ROOT/('merged-full' if FULL else 'merged-model')
ADAPTER=ROOT/'adapter-final'
def header(f):
    size=struct.unpack('<Q',f.read(8))[0]
    return size,json.loads(f.read(size))
def main():
    if MERGED.exists(): raise RuntimeError('Refusing to overwrite existing merged-model')
    if not (ROOT/'training_result.json').exists(): raise RuntimeError('Missing training result')
    result=json.loads((ROOT/'training_result.json').read_text(encoding='utf-8-sig'))
    if FULL and result.get('status')!='completed': raise RuntimeError('Full training has not completed')
    torch.set_num_threads(2)
    config=json.loads((ADAPTER/'adapter_config.json').read_text(encoding='utf8'))
    if config.get('use_rslora') or config.get('rank_pattern') or config.get('alpha_pattern'): raise ValueError('Unsupported adapter')
    scale=config['lora_alpha']/config['r']
    index=json.loads((BASE/'model.safetensors.index.json').read_text(encoding='utf8'))['weight_map']
    updates={}
    with safe_open(str(ADAPTER/'adapter_model.safetensors'),framework='pt',device='cpu') as ad:
        keys=list(ad.keys())
        for key in keys:
            if key.endswith('.lora_A.weight'):
                prefix=key[:-len('.lora_A.weight')]
                name=prefix.removeprefix('base_model.model.').replace('model.layers.', 'model.language_model.layers.', 1)+'.weight'
                if not prefix.startswith('base_model.model.') or prefix+'.lora_B.weight' not in keys or name not in index: raise ValueError('Unexpected adapter '+key)
                updates[name]=(ad.get_tensor(key).float(),ad.get_tensor(prefix+'.lora_B.weight').float())
    if len(updates)*2!=len(keys): raise ValueError('Unexpected adapter keys')
    MERGED.mkdir()
    for file in BASE.iterdir():
        if file.is_file():
            print('Copy',file.name,flush=True); shutil.copyfile(file,MERGED/file.name)
    changed=0
    for shard in sorted({index[n] for n in updates}):
        with (BASE/shard).open('rb',buffering=0) as old, (MERGED/shard).open('r+b',buffering=0) as new:
            h,meta=header(old); h2,meta2=header(new)
            if h!=h2 or meta!=meta2: raise ValueError('Metadata mismatch')
            for name in sorted(n for n in updates if index[n]==shard):
                entry=meta[name]; a,b=updates[name]; rows,cols=entry['shape']
                if entry['dtype']!='BF16' or list(b.shape[:1])+list(a.shape[1:])!=[rows,cols]: raise ValueError(name)
                for row in range(0,rows,128):
                    count=min(128,rows-row); pos=8+h+entry['data_offsets'][0]+row*cols*2
                    old.seek(pos); raw=old.read(count*cols*2)
                    if len(raw)!=count*cols*2: raise ValueError('Short read')
                    orig=torch.frombuffer(bytearray(raw),dtype=torch.bfloat16).reshape(count,cols)
                    result=orig.clone(); result.add_((b[row:row+count]@a).mul_(scale).to(torch.bfloat16))
                    changed+=torch.count_nonzero(result!=orig).item()
                    encoded=result.view(torch.uint16).numpy().tobytes();new.seek(pos)
                    if new.write(encoded)!=len(encoded): raise ValueError('Short write')
                    new.seek(pos)
                    if new.read(len(encoded))!=encoded: raise ValueError('Verify failed '+name)
                print('Merged and verified',name,flush=True)
    result={'status':'completed','tensors':len(updates),'changed_bfloat16_values':changed,'source':'Qwen/Qwen3.5-9B c202236235762e1c871ad0ccb60c8ee5ba337b9a','adapter':'adapter-final','verification':'Every merged chunk read back and checked against the calculated update.'}
    (ROOT/('merge_full_result.json' if FULL else 'merge_result.json')).write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps(result),flush=True)
if __name__=='__main__': main()
