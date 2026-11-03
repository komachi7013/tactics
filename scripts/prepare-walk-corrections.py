"""Bind confirmed repaired stills and gait references to the 24 issue jobs."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/walk-standard-v1/cast-review-v2'

def main():
    uploads=[]
    for name in ['upload-results.json','upload-results-extra.json','upload-results-tomaN.json']:
        uploads+=json.loads((WORK/name).read_text())
    assert all(u['httpStatus']=='200' for u in uploads)
    images={u['index']:u['media_id'] for u in uploads if 'index' in u}
    drivers={u['direction']:u['media_id'] for u in uploads if 'direction' in u}
    plan=json.loads((WORK/'retakes.json').read_text());requests=[]
    facing={'N':'BACK three-quarter view toward screen upper-right','E':'FRONT three-quarter view toward screen lower-right','S':'FRONT three-quarter view toward screen lower-left','W':'BACK three-quarter view toward screen upper-left'}
    for j in plan['jobs']:
        j['media_id']=images[j['index']];j['driving_media_id']=drivers[j['direction']]
        j['inputConstruction']={'canvas':[1152,1152],'masterScale':2.5,'masterOffset':[256,212]}
        j['prompt']=f"Keep the complete character SMALL in the frame with very large empty margins: all soles remain above 80 percent frame height, no zoom or crop. Animate precisely the illustrated character in the image, preserving the exact {facing[j['direction']]} throughout. Copy the driving video's alternating left and right gait, modest stride, low foot lift and steady complete TWO-step cycle every 0.8 seconds. The driver supplies joint angles and timing ONLY: never copy its person, body proportions, costume, equipment or colours. Preserve the image's exact head-to-body ratio, standing height, face, hairstyle, age, clothing, colours, equipment and illustration style. Keep natural torso and leg lengths; no stretching, shortening, crouching or enlarged head. Head and pelvis remain nearly level. Both feet face the SAME direction as the torso at every point in the cycle. Keep the feet's yaw fixed relative to the body: heels may lift and ankles may bend, but toes must never swivel toward the camera or turn into a front-on boot view. Hands keep their equipment grips, arms have only restrained natural motion. Character walks in place without translation or changing camera view. Complete head and soles visible on flat magenta #ff00ff, no floor, floor line or shadow. Start the steady gait immediately and repeat continuously."
        params={**j['params'],'prompt':j['prompt'],'medias':[{'role':'image','value':j['media_id']},{'role':'video','value':j['driving_media_id']}]}
        requests.append({'index':j['index'],'params':params})
    (WORK/'retakes.json').write_text(json.dumps(plan,indent=2)+'\n')
    (WORK/'video-requests.json').write_text(json.dumps(requests,indent=2)+'\n')
    (WORK/'validation-policy.json').write_text(json.dumps({'status':'fixed before motion generation','reference':'unchanged Garan E; S appearance reference retained','frames':19,'cycleMs':800,'headTopMedian':{'target':100,'tolerance':1.5},'maxSoleY':{'target':280,'tolerance':2},'sourceFrames':'19 unique consecutive native frames; no reversal or duplicate poses','design':'manual cross-direction identity and proportions, not an upper-band area proxy','feet':'manual all-19-frame toe-yaw and alternating-leg review; image extent alone is not anatomical contact certification','noPerFrameScaling':True,'noPerFrameLowestFootLock':True},indent=2)+'\n')
    print('Prepared',len(requests),'requests')

if __name__=='__main__':main()
