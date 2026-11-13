"""Generate controlled synthetic map and combined-arms RTS training cases.

The game commander validates every offered operation; labels are hand-authored
scenario heuristics, not engine rollouts, player demonstrations or optimal play.
"""
import argparse, collections, hashlib, json, random, subprocess, sys
from pathlib import Path

ROOT=Path(r'C:\Users\Public\openjev')
GAME=Path(r'C:\Users\bogmk\Documents\Codex\2026-10-05\i-x20\outputs\iron-field')
OUT=ROOT/'outputs'/'rts-map-combined-arms-dataset'
BASE=ROOT/'outputs'/'qwen35-4b-rts-lookahead-nli'
PREFIX='The synthetic game heuristic recommends this operation: '
FAMILIES={
 'bridge_breach':('bridge','siege','rush'),
 'bridge_air_bypass':('bridge','siege','air'),
 'armor_combined_arms':('armor','anti-armor','balanced'),
 'waterway_control':('sea','naval','balanced'),
 'air_threat_screen':('air','anti-air','balanced'),
 'base_approach':('defense','defend','defend-counterattack'),
 'coast_vs_inland_economy':('sea','naval','raid-economy'),
}
# Each pair holds the same map, units and offered operations; only observed
# tactical context changes. Descriptions are artificial, not discovered terrain.
TEXT={
 'bridge_breach':[("Visible bridge approaches are covered by defensive guns; the route is constricted for armor.","A visible bridge approach is lightly covered and enemy production beyond it is exposed; other defenses are away from this route."),("Observed choke crossing has hostile static fire; armor would bunch up at the bridge.","Scouts observe an open crossing toward exposed production; the fortified positions do not cover that lane.")],
 'bridge_air_bypass':[("Bridge approach is covered by several guns; scouts have not checked the nearby air lane.","The defended bridge blocks ground forces; the visible air lane around it is weakly protected."),("Static defenses cover the bridge and the direct air approach remains unscouted.","The bridge is fortified but scouts report a less protected aerial approach around it.")],
 'armor_combined_arms':[("Visible heavy armor is advancing through the main approach; our front line lacks dedicated armor counters.","The visible heavy armor is screened far behind terrain while lightly protected enemy infantry threatens the flank; our infantry and armor can cover each other."),("Hostile armored units are concentrated on the open approach and our force needs long-range counters.","Hostile armor is held behind a choke while exposed infantry threatens the side; a mixed force can respond.")],
 'waterway_control':[("Visible enemy vessels threaten the river crossing and the near shore; our fleet is insufficient.","Enemy ships are distant on the water and a visible land approach offers the immediate opportunity for a mixed force."),("Hostile naval units contest the waterway beside the approach; our ships are outnumbered.","The visible ships are away from our crossing while ground units can support an exposed land approach.")],
 'air_threat_screen':[("Visible enemy aircraft are approaching our ground formation without enough friendly anti-air.","Visible hostile aircraft are distant while our current ground formation can support a nearby mixed attack; anti-air remains limited."),("Aircraft are visibly moving toward our army and our anti-air screen is insufficient.","Aircraft have been sighted far from the current engagement; the nearby opportunity favors a combined ground attack, with limited anti-air.")],
 'base_approach':[("Two visible attackers threaten the base approach and friendly units are not yet assembled to intercept.","Two visible attackers threaten the approach but a friendly armored counterattack group is assembled nearby."),("Hostiles are closing on home assets and the local defenders are dispersed.","Hostiles approach the base while friendly armor is grouped close enough to protect it and counterattack.")],
 'coast_vs_inland_economy':[("Visible enemy economic targets lie near the navigable shore and enemy ships contest that water.","Visible enemy miners operate inland beyond coastal gun range; a land route is open while enemy ships stay offshore."),("Enemy shore-side economy can be reached by ships; hostile vessels threaten that same water.","Enemy miners are inland out of naval range, with a reachable land approach and ships still visible offshore.")],
}

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def make(family,split,index,seed):
 r=random.Random(seed);kind,left,right=FAMILIES[family]
 water=kind in ('bridge','sea') or (kind not in ('bridge','sea') and r.choice([False,True]))
 if split=='test':map_id='crossroads' if water else 'classic'
 else:map_id='river' if water else 'classic'
 own={'miner':3,'tank':r.randint(6,8),'heavy':r.randint(1,2),'rocketTrooper':2}
 buildings={'base':1,'power':3,'refinery':1,'garrison':1,'warFactory':1,'airfield':1}
 if water:buildings['shipyard']=1
 enemy={'tank':2,'miner':3};enemy_buildings={'base':1,'power':2,'refinery':1,'garrison':1,'warFactory':1}
 if kind in ('bridge','defense'):enemy_buildings['turret']=3
 if kind=='armor':enemy={'heavy':r.randint(4,5),'rifleman':3,'miner':3}
 if kind=='sea':enemy={'patrolBoat':2,'miner':3};enemy_buildings['shipyard']=1
 if kind=='air':enemy={'gunship':4,'miner':3};enemy_buildings['airfield']=1
 state={'elapsed':r.randint(200,850),'credits':r.randint(1400,2400),'own':{'units':own,'buildings':buildings,'hqHealth':r.randint(70,100)},'opponent':{'units':enemy,'buildings':enemy_buildings,'hqHealth':r.randint(65,100)},'context':{'water':water,'pressure':2 if kind=='defense' else 0,'oreRemaining':r.randint(10000,30000)}}
 t=TEXT[family][0 if split=='train' else 1]
 return {'id':f'{split}-{family}-{index}','family':family,'split':split,'map':map_id,'state':state,'variants':[{'target':left,'observation':t[0]},{'target':right,'observation':t[1]}]}

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=OUT);a=p.parse_args()
 out=a.output.resolve();
 if out.exists() and any(out.iterdir()):raise RuntimeError('Output folder is not empty: '+str(out))
 out.mkdir(parents=True,exist_ok=True)
 desired={'train':100,'validation':20,'test':20};seeds={'train':2091101,'validation':2092103,'test':2093107}
 drafts=[]
 for split,n in desired.items():
  for fi,family in enumerate(FAMILIES):
   for index in range(n*4):drafts.append(make(family,split,index,seeds[split]+fi*100000+index))
 worker=GAME/'benchmarks'/'map-combined-arms-validate.cjs'
 process=subprocess.run(['node',str(worker)],input='\n'.join(json.dumps(d,separators=(',',':')) for d in drafts)+'\n',text=True,capture_output=True,check=True,cwd=GAME)
 lines=process.stdout.splitlines()
 if len(lines)!=len(drafts):raise RuntimeError('Commander validation returned an incomplete response: '+process.stderr[-1000:])
 grouped=collections.defaultdict(list);rejected=collections.Counter()
 for draft,line in zip(drafts,lines):
  result=json.loads(line)
  if result.get('error'):raise RuntimeError(f"Validation error {draft['id']}: {result['error']}")
  if result['id']!=draft['id']:raise RuntimeError('Validation order mismatch')
  if result['accepted']:grouped[(draft['split'],draft['family'])].append((draft,result))
  else:rejected[draft['family']]+=1
 all_pairs={};all_states={};all_nli={};seen=set();manifest_counts={}
 for split,n in desired.items():
  pairs=[];states=[];nli=[];counts=collections.Counter()
  for family in FAMILIES:
   options=grouped[(split,family)]
   if len(options)<n:raise RuntimeError(f'{family} {split}: only {len(options)} valid pairs of {n}; rejected {rejected[family]}')
   for draft,info in options[:n]:
    key=digest([draft['map'],draft['state']]);
    if key in seen:raise RuntimeError('Overlapping underlying state across splits')
    seen.add(key);pairs.append({**draft,'offered':info['offered'],'state_hash':key})
    for j,v in enumerate(draft['variants']):
     other=draft['variants'][1-j]['target'];premise=info['facts']+' Map: '+{'classic':'Iron Valley','river':'River Front','crossroads':'Four Shores'}[draft['map']]+'. '+info['terrain']+' Tactical observation: '+v['observation']+' '+info['forecast']
     case={'id':draft['id']+'-'+str(j),'pair_id':draft['id'],'family':family,'split':split,'map':draft['map'],'state_hash':key,'premise':premise,'choices':info['offered'],'expected':v['target'],'alternative':other,'synthetic_observation':v['observation']}
     states.append(case);counts[v['target']]+=1
     for label,action in [('entailment',v['target']),('neutral',other)]:
      nli.append({'premise':premise,'hypothesis':PREFIX+action+'.','label':label,'source_split':split,'family':family,'source':'synthetic-map-combined-arms','case_id':case['id'],'pair_id':draft['id']})
  all_pairs[split]=pairs;all_states[split]=states;all_nli[split]=nli;manifest_counts[split]={'pairs':len(pairs),'states':len(states),'nli_examples':len(nli),'targets':dict(counts)}
 def write(name,rows):
  with (out/name).open('w',encoding='utf-8',newline='\n') as f:
   for row in rows:f.write(json.dumps(row,ensure_ascii=False)+'\n')
 for split in desired:write(split+'_pairs.jsonl',all_pairs[split]);write(split+'_cases.jsonl',all_states[split]);write(split+'_nli.jsonl',all_nli[split])
 # New map data adds entailment/neutral only; retain the previous contradiction examples.
 previous_train=[json.loads(x) for x in (BASE/'train_lookahead_nli.jsonl').read_text(encoding='utf-8').splitlines()]
 previous_valid=[json.loads(x) for x in (BASE/'validation_lookahead_nli.jsonl').read_text(encoding='utf-8').splitlines()]
 write('combined_train_nli.jsonl',previous_train+all_nli['train']);write('combined_validation_nli.jsonl',previous_valid+all_nli['validation'])
 manifest={'task':'Synthetic RTS map and combined-arms recommendation cases','seed_by_split':seeds,'families':list(FAMILIES),'counts':manifest_counts,'prior_train_examples':len(previous_train),'prior_validation_examples':len(previous_valid),'combined_train_examples':len(previous_train)+len(all_nli['train']),'combined_validation_examples':len(previous_valid)+len(all_nli['validation']),'generator_acceptance_rejections':dict(rejected),'split':'Distinct underlying states and seeds; test uses alternate descriptions and Four Shores for water examples. Scenario families and heuristic teacher overlap; not an independent human or gameplay benchmark.','label_policy':{'entailment':'Hand-authored scenario heuristic prefers this available operation.','neutral':'Other offered operation; not asserted to be objectively bad.','contradiction':'No new contradiction labels. Prior NLI data retained in combined files.'},'limitations':['Narrative map observations are synthetic and are not proven reachable game geometry.','Expected actions are heuristic preferences, not model self-play, human decisions or verified optimal outcomes.','Commander validates map water and offered operations; it does not validate tactical observation against actual terrain.','Live game JEV and prior compact benchmark do not currently supply these map-observation sentences; wiring and token audit are required before live use.','No existing model or dataset was overwritten.']}
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
