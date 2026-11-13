"""Train a separate RTS JEV adapter with compact, lookahead-aware examples.

Teacher labels are synthetic heuristics, not game outcomes or expert judgments.
Existing split and adapter are read-only. Run from the local OpenJEV environment.
"""
import importlib.util, json, random, re
from collections import Counter
from pathlib import Path

ROOT = Path(r'C:\Users\Public\openjev')
OLD_DIR = ROOT / 'outputs' / 'qwen35-4b-rts-recommendation-nli'
OUT = ROOT / 'outputs' / 'qwen35-4b-rts-lookahead-nli'
SOURCE = ROOT / 'outputs' / 'qwen35-9b-rts-v2-synthetic'
spec = importlib.util.spec_from_file_location('prior_rts_training', ROOT / 'train_rts_lookahead_backend.py')
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
prior.SOURCE_ADAPTER = OLD_DIR / 'adapter-final'
prior.OUTPUT_DIR = OUT
prior.MAX_LENGTH = 384
PREFIX = 'The synthetic game heuristic recommends this operation: '
URGENT = {'lost-miners','lost-refinery','base-under-attack','uncovered-air','expected-air','weak-hq','losing-raid','no-ore-defense'}


def read(path):
    with path.open(encoding='utf-8') as f:
        return [json.loads(x) for x in f if x.strip()]


def augment(rows, split):
    out, stats, counts = [], Counter(), Counter()
    risks = ['HQ exposed to assault', 'miners exposed to raids', 'production or funds may delay']
    per_family = 50 if split == 'train' else 10
    for i, row in enumerate(rows):
        family = row['family']
        if family in {'flank-left', 'flank-right', 'expected-air'} or counts[family] >= per_family:
            continue  # no flanks or omitted player-history evidence in the controlled benchmark
        counts[family] += 1
        prompt = row['messages'][0]['content']
        state = prior.extract_state(prompt, split, i).split('Visible contacts')[0].strip()
        rank_match = re.search(r'^Approximate two-step worst-case ranking[^\n]*:\s*(.*)$', prompt, re.M)
        choice_match = re.search(r'^Choose only:\s*([^\n]+)', prompt, re.M)
        if not rank_match or not choice_match: raise ValueError(f'missing ranking or choices: {split} {i}')
        offered = [s.strip() for s in choice_match.group(1).rstrip('.').split(',') if '@' not in s]
        ranking = [s.strip() for s in rank_match.group(1).rstrip('.').split(' > ')]
        ranking = [s for s in ranking if s in offered]
        original = json.loads(row['messages'][1]['content'])
        if original not in offered or not ranking or len(offered) < 2: raise ValueError(f'non-comparable label: {split} {i}')
        other = next((x for x in ranking if x != original), next(x for x in offered if x != original))
        rank_text = ' Approximate two-step worst-case ranking (simplified, not a prediction): ' + ' > '.join(ranking) + '.'
        # Counterfactual pairs differ only in a simulated risk on the prior choice.
        # Preserve explicit emergency priorities; otherwise let this risk change the
        # synthetic teacher's choice to a different ranked option.
        for with_risk in (False, True):
            risk = f' Possible tradeoffs, not predictions: {original}: {risks[i%len(risks)]}.' if with_risk else ''
            premise = state + rank_text + risk
            target = other if with_risk and family not in URGENT else original
            alternatives = [x for x in offered if x != target]
            alt = original if target != original else other
            stats['examples'] += 1
            stats['risk_examples'] += int(with_risk)
            stats['emergency_guard'] += int(family in URGENT)
            stats['changed_from_prior_teacher'] += int(target != original)
            stats['targets:' + target] += 1
            for label, name in [('entailment',target), ('neutral',alt)]:
                out.append({'premise':premise,'hypothesis':PREFIX+name+'.','label':label,'source_split':split,'family':family,'source':'lookahead-counterfactual-synthetic-rule','generated_risk':with_risk,'original_teacher':original})
    stats['distinct_states'] = sum(counts.values())
    return out, dict(stats)


def main():
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--prepare-only',action='store_true');p.add_argument('--smoke-test',action='store_true');p.add_argument('--epochs',type=float,default=1.0);p.add_argument('--resume',type=Path);a=p.parse_args()
    if (OUT/'adapter-final').exists() and not a.prepare_only and not a.smoke_test: raise RuntimeError('Completed adapter exists: refusing to overwrite')
    OUT.mkdir(parents=True,exist_ok=True)
    if a.resume:
        checkpoint=a.resume.resolve()
        if checkpoint.parent != (OUT/'checkpoints').resolve() or not checkpoint.is_dir() or not checkpoint.name.startswith('checkpoint-'): raise ValueError('Resume path must be an existing lookahead checkpoint')
        import os
        os.environ['RTS_LOOKAHEAD_RESUME']=str(checkpoint)
    train_old=read(OLD_DIR/'train_recommendation_nli.jsonl'); valid_old=read(OLD_DIR/'validation_recommendation_nli.jsonl')
    train_plus,train_stats=augment(read(SOURCE/'train_synthetic.jsonl'),'train')
    valid_plus,valid_stats=augment(read(SOURCE/'validation_synthetic.jsonl'),'validation')
    train=train_old+train_plus;valid=valid_old+valid_plus
    from transformers import AutoTokenizer
    tok=AutoTokenizer.from_pretrained(prior.SOURCE_ADAPTER,local_files_only=True)
    lengths=[len(tok('Premise: '+x['premise']+'\nHypothesis: '+x['hypothesis'])['input_ids']) for x in train+valid]
    if max(lengths)>prior.MAX_LENGTH: raise ValueError('Training examples exceed token limit: '+str(max(lengths)))
    manifest={'task':'RTS lookahead recommendation-NLI; synthetic heuristic teacher, not optimal labels','initialized_from':str(prior.SOURCE_ADAPTER),'train_count':len(train),'validation_count':len(valid),'train_lookahead':train_stats,'validation_lookahead':valid_stats,'max_tokens':max(lengths),'max_length':prior.MAX_LENGTH,'notes':['Validation is a held-out seed but shares generated scenario families.','Paired counterfactual risk notes and guarded labels are synthetic, not observed outcomes.','No recorded benchmark match states are included.','Old synthetic examples are retained to limit forgetting.']}
    prior.write_jsonl(OUT/'train_lookahead_nli.jsonl',train);prior.write_jsonl(OUT/'validation_lookahead_nli.jsonl',valid)
    (OUT/'dataset_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
    print(json.dumps(manifest,indent=2),flush=True)
    if a.prepare_only:return
    if a.smoke_test: train=train[:24]+train_plus[:24];valid=valid[:30]+valid_plus[:30]
    results=prior.train_model(train,valid,epochs=a.epochs,max_steps=1 if a.smoke_test else None,smoke_test=a.smoke_test)
    print(json.dumps(results,indent=2),flush=True)

if __name__ == '__main__': main()




