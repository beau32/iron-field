"""Check split integrity, paired labels, offered choices and model token lengths."""
import collections,json,sys
from pathlib import Path
from transformers import AutoTokenizer
folder=Path(sys.argv[1]).resolve()
tok=AutoTokenizer.from_pretrained(r'C:\Users\Public\openjev\outputs\qwen35-4b-rts-lookahead-nli\adapter-final',local_files_only=True,use_fast=True)
read=lambda p:[json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
hashes={};records=[];counts={}
for split in ('train','validation','test'):
 cases=read(folder/(split+'_cases.jsonl'));pairs=read(folder/(split+'_pairs.jsonl'));nli=read(folder/(split+'_nli.jsonl'))
 assert len(cases)==2*len(pairs) and len(nli)==2*len(cases)
 ids={p['id'] for p in pairs}; assert len(ids)==len(pairs)
 hashes[split]={p['state_hash'] for p in pairs};assert len(hashes[split])==len(pairs)
 grouped=collections.defaultdict(list)
 for case in cases:
  assert case['pair_id'] in ids and case['expected'] in case['choices'] and case['alternative'] in case['choices'] and case['expected']!=case['alternative']
  grouped[case['pair_id']].append(case)
  for choice in case['choices']:
   records.append('Premise: '+case['premise']+'\nHypothesis: The synthetic game heuristic recommends this operation: '+choice+'.')
 for pair in pairs:
  a,b=grouped[pair['id']];assert a['state_hash']==b['state_hash']==pair['state_hash'] and a['choices']==b['choices']==pair['offered'] and a['expected']==b['alternative'] and b['expected']==a['alternative'] and a['synthetic_observation']!=b['synthetic_observation']
 lookup={c['id']:c for c in cases}
 for row in nli:
  c=lookup[row['case_id']]; assert row['premise']==c['premise']; target=c['expected'] if row['label']=='entailment' else c['alternative'];assert row['hypothesis']=='The synthetic game heuristic recommends this operation: '+target+'.'; records.append('Premise: '+row['premise']+'\nHypothesis: '+row['hypothesis'])
 counts[split]={'pairs':len(pairs),'cases':len(cases),'nli':len(nli),'maps':dict(collections.Counter(c['map'] for c in cases))}
assert all(not hashes[a]&hashes[b] for a,b in [('train','validation'),('train','test'),('validation','test')])
lengths=[]
for i in range(0,len(records),256):lengths.extend(len(x) for x in tok(records[i:i+256],truncation=False)['input_ids'])
if max(lengths)>384:raise RuntimeError('Training inputs exceed the prior training limit of 384 tokens')
result={'integrity':'passed','split_counts':counts,'candidate_texts':len(lengths),'min_tokens':min(lengths),'max_tokens':max(lengths),'over_384':sum(x>384 for x in lengths),'over_512':sum(x>512 for x in lengths),'note':'Token lengths apply to these new examples in the benchmark-style format, not the current live game prompt.'}
(folder/'audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,indent=2))
