"""Publish reviewed fixed-canvas walks without changing a single source pixel."""
import hashlib,json,shutil
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-from-standing-v1'
def main():
 plan=json.loads((WORK/'plan.json').read_text()); target=ROOT/'src/view/walk-v2.json'
 backup=WORK/'game-walk-before-application.json'
 if not backup.exists(): shutil.copy2(target,backup)
 manifest={}; records=[]
 for job in plan['jobs']:
  cast,direction=job['cast'],job['direction']
  candidate=ROOT/job.get('candidateDirectory',f'artifacts/walk-from-standing-v1/{cast}/{direction}/candidate')
  animation=json.loads((candidate/'animation.json').read_text())
  assert animation['frames']==19 and animation['cycleMs']==800
  sheet=Image.new('RGBA',(300*5,300*4)); grounds=[]; heads=[]
  for i in range(19):
   frame=Image.open(candidate/f'frame_{i:03d}.png').convert('RGBA'); assert frame.size==(256,300)
   sheet.alpha_composite(frame,(i%5*300+22,i//5*300))
   ys=np.where(np.asarray(frame)[:,:,3]>128)[0]; grounds.append(int(ys.max()+1));heads.append(int(ys.min()))
  digest=hashlib.sha256(sheet.tobytes()).hexdigest()[:12]
  relative=f'assets/walk-standing-v1/{cast}/{direction}-{digest}.png'
  destination=ROOT/'public'/relative;destination.parent.mkdir(parents=True,exist_ok=True);sheet.save(destination)
  metadata={**animation,'gameApplied':True,'sheetColumns':5,'sheetSha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'candidateDirectory':str(candidate.relative_to(ROOT)),'sourceSheetSha256':animation.get('sheetSha256')}
  destination.with_suffix('.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
  # Registration shares the standing master's fixed ground=280, height=179.
  # Retain real foot lift and body motion; never pin individual frames to alpha bounds.
  manifest.setdefault(cast,{})[direction]={'key':f'walk-standing-{cast}-{direction}-{digest}','path':'/'+relative,'cell':300,'frames':19,'originX':.5,'originY':280/300,'visibleHeight':179,'cycleMs':800,'tilesPerCycle':4}
  records.append({'cast':cast,'direction':direction,'candidate':str(candidate.relative_to(ROOT)),'path':relative,'groundSourceRange':[min(grounds),max(grounds)],'groundOffsetGamePxRange':[(min(grounds)-280)*90/179,(max(grounds)-280)*90/179],'headRange':[min(heads),max(heads)],'sourcePixelsUnchanged':True})
 assert len(records)==48
 target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 (WORK/'game-walk-application.json').write_text(json.dumps({'status':'applied; contact and sliding review required','frames':19,'cycleMs':800,'fixedMasterGround':280,'fixedMasterVisibleHeight':179,'records':records},ensure_ascii=False,indent=2)+'\n')
 print('Published 48 directions; original pixels retained, 19 frames/800ms')
if __name__=='__main__':main()
