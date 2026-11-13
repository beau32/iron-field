"""Expand paper result archives into their original relative paths."""
from pathlib import Path
import argparse,gzip,hashlib,json
ROOT=Path(__file__).resolve().parent.parent

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true',help='verify archives without writing files');args=parser.parse_args()
 rows=json.loads((ROOT/'research/result-archives.json').read_text(encoding='utf8'))
 for row in rows:
  archive=(ROOT/row['archive']).resolve();dst=(ROOT/row['destination']).resolve()
  if not archive.is_relative_to(ROOT) or not dst.is_relative_to(ROOT):raise ValueError('Archive path escapes checkout')
  data=gzip.decompress(archive.read_bytes())
  if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256']:raise ValueError('Archive verification failed: '+row['archive'])
  if args.check:continue
  if dst.exists():
   if hashlib.sha256(dst.read_bytes()).hexdigest()!=row['sha256']:raise FileExistsError('Existing result differs; refusing to overwrite '+str(dst))
   continue
  dst.parent.mkdir(parents=True,exist_ok=True)
  with dst.open('xb') as f:f.write(data)
 print('Verified' if args.check else 'Restored',len(rows),'paper result files')
if __name__=='__main__':main()
