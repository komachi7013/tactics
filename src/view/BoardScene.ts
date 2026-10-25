import {LandscapeLoadController} from './landscapeLoadController';
import {landscapeMaterials,queueLandscapeMaterials,prepareLandscape,releaseLandscape} from './landscapeAssets';
import { registeredProjection } from './registeredProjection';
import { registeredLandscape, registeredFloors, prepareRegisteredParts } from './registeredLandscape';
import Phaser from 'phaser';
import { B01_TEXTURES, B01_SCENE, b01Projection, b01FloorsAtPoint, b01ActorAnchor } from './b01Landscape';
import type { BattleId, BattleState, Pos } from '../domain/types';
import { b01EnvironmentKey } from './b01Environment';
import { getBattleConfig } from '../domain/battles';
import { ATTACK_BODIES, dedicatedAttackFrame, withDedicatedAttack, type AttackBodyId } from './dedicatedAttack';
import { samplePresentation, type PresentationPlan } from './presentation';
import {CART_WHEEL,cartWheelAngle,cartWheelFrame} from './cartWheel';
import {movementFacing} from './directionalMovement';
import {escortVisualFacing} from './escortVisualFacing';
import {distancePose,travelledTiles} from './movementTempo';
import {CAST_IDLE,CAST_WALK,castIdle,castWalk} from './castMotion';
import {withFourPoseTempo} from './movementTempo';
import { HD2D_WALK, hd2dWalkFrame, type WalkQaCandidate } from '../qa/hd2dWalk';

export interface BoardView { state: BattleState; selected: string | null; cursor: Pos; reachable: Pos[]; mode: string; enabled: boolean }
export interface BoardRenderReport { stage: string; error: string | null; warnings: string[]; drawn: boolean }
export class BoardScene extends Phaser.Scene {
  private view?: BoardView;
  private pick: (p: Pos, floors?: Pos[]) => void;
  private layer?: Phaser.GameObjects.Container;
  private battleId?: string;
  private previousRound = 0;
  private completedTravelTiles=new Map<string,number>();
  private completedCartAngle=0;
  private presentation?: { plan: PresentationPlan; startedAt: number };
  private qaLoopEpoch=0;
  private qaWalkSamples:{frame:number;elapsed:number;absolute:number}[]=[];
  private qaWalkDuration=0;
  private qaObserve(frame:number,elapsed:number,absolute=frame,complete=false){
    if(!this.walkCandidate||typeof document==='undefined')return;
    if(!complete&&this.qaWalkSamples.at(-1)?.absolute!==absolute){this.qaWalkSamples.push({frame,elapsed:Math.round(elapsed),absolute});if(this.qaWalkSamples.length>24)this.qaWalkSamples.shift();}
    let node=document.getElementById('qa-walk-diagnostic');
    if(!node){node=document.createElement('output');node.id='qa-walk-diagnostic';node.style.cssText='position:fixed;left:12px;bottom:66px;z-index:9999;background:#10251fee;color:#fff1c8;padding:7px;font:12px monospace;max-width:850px;pointer-events:none';document.body.append(node);}
    node.textContent=JSON.stringify({qaWalk:HD2D_WALK.key,mode:this.walkCandidate.mode??'original',durationMs:this.qaWalkDuration,frameMs:140,loopEpoch:this.qaLoopEpoch,absoluteFrame:absolute,renderedFrames:[...new Set(this.qaWalkSamples.map(s=>s.frame))],samples:this.qaWalkSamples,complete});
  }
  private continuousFrame(){if(!this.qaLoopEpoch)this.qaLoopEpoch=performance.now();return Math.floor((performance.now()-this.qaLoopEpoch)/140);}
  private applyContinuousIdle(){
    if(this.walkCandidate?.mode!=='continuous')return;
    const ref=this.actors.get('ally-lise');
    if(!ref?.body||!this.textures.exists(HD2D_WALK.key))return;
    const absolute=this.continuousFrame(),frame=absolute%6;
    ref.body.image.setTexture(HD2D_WALK.key,frame).setOrigin(HD2D_WALK.originX,HD2D_WALK.originY).setDisplaySize(128*68/this.walkCandidate.visibleHeight*this.adoptedBodyScale*this.unitScale,128*68/this.walkCandidate.visibleHeight*this.adoptedBodyScale*this.unitScale);
    ref.body.walking=true;this.qaObserve(frame,performance.now()-this.qaLoopEpoch,absolute);
  }
  private attackFeedback?: Phaser.GameObjects.Text;
  private actors = new Map<string, { group: Phaser.GameObjects.Container; x: number; y: number; alpha: number; ghost: boolean; logicalDepth?: number; overlay?: Phaser.GameObjects.Container; body?: { image: Phaser.GameObjects.Image; key: string; frame?: number; originX?: number; originY: number; size: number; dedicated: boolean; walking?: boolean } }>();
  private projection?: (p: Pos) => { x: number; y: number };
  private unitScale = 1;
  private adoptedBodyScale = 1;
  private registeredDepth = false;
  private lastDrawnSize?: { width: number; height: number };
  private onResize = () => {
    // Phaser can emit resize after a parent bounds check without changing its
    // logical game size. Only that redundant event may reuse the current layer.
    if (this.lastDrawnSize?.width === this.scale.width && this.lastDrawnSize.height === this.scale.height) return;
    this.draw();
  };
  private onShutdown = () => {
    this.scale.off('resize', this.onResize);
    this.lastDrawnSize = undefined;
    this.completedTravelTiles.clear();this.completedCartAngle=0;this.presentation = undefined; this.attackFeedback = undefined; this.actors.clear(); this.projection = undefined;
    this.load?.off?.('loaderror',this.onLoadError);this.landscapeLoads.stop();this.landscapeStopped=true;this.cancelStageLoad?.();this.cancelStageLoad=undefined;
    this.layer?.destroy(true); this.layer = undefined; this.view = undefined;
  };
  /** Presentation owns no simulation and never schedules a rule command. */
  playPresentation(plan: PresentationPlan) {
    if(this.walkCandidate?.mode!=='continuous')this.qaWalkSamples=[]; this.qaWalkDuration=plan.durationMs;
    this.presentation = { plan, startedAt: performance.now() };
    if (this.sys.isActive()) this.draw();
  }
  private bodyReady(id: AttackBodyId): boolean {
    const body = ATTACK_BODIES[id];
    return this.sys.isActive() && this.textures.exists(body.idleKey) && this.textures.exists(body.key)
      && [0, 1, 2, 3].every(frame => this.textures.get(body.key).has(String(frame)));
  }
  preparePresentation(plan: PresentationPlan | null, state: BattleState): PresentationPlan | null {
    const prepared=withDedicatedAttack(plan,state,id=>this.bodyReady(id));
    return this.walkCandidate?prepared:withFourPoseTempo(prepared);
  }
  clearPresentation() {
    if(this.presentation){for(const m of this.presentation.plan.moves)this.completedTravelTiles.set(m.unitId,(this.completedTravelTiles.get(m.unitId)??0)+travelledTiles(this.presentation.plan,m.unitId,this.presentation.plan.durationMs));const cart=this.actors.get('escort-cart')?.body;if(cart&&this.projection)this.completedCartAngle+=cartWheelAngle(this.presentation.plan,'escort-cart',this.presentation.plan.durationMs,this.projection,cart.size*this.unitScale*CART_WHEEL.sourceRadius/256);}
    const last=this.qaWalkSamples.at(-1);if(last)this.qaObserve(last.frame,last.elapsed,last.absolute,true);
    this.presentation = undefined;
    if (this.sys.isActive()) this.draw();
    else { this.attackFeedback = undefined; this.actors.clear(); this.projection = undefined; }
  }
  update() { this.applyPresentation(); }
  private applyPresentation() {
    if (!this.presentation || !this.projection) {this.applyContinuousIdle();return;}
    const { plan, startedAt } = this.presentation;
    const elapsed = performance.now() - startedAt;
    const sample = samplePresentation(plan, elapsed);
    this.attackFeedback?.setVisible(sample.attackProgress !== null && !sample.complete);
    for (const [id, ref] of this.actors) {
      let x = ref.x, y = ref.y;
      const motion = sample.positions[id];
      if (motion) {
        const from = this.projection(motion.from), to = this.projection(motion.to);
        x = from.x + (to.x - from.x) * motion.t;
        y = from.y + (to.y - from.y) * motion.t;
      }
      const bodyId = plan.attack?.actorId === id ? plan.attack.bodyId : undefined;
      const body = bodyId ? ATTACK_BODIES[bodyId] : undefined;
      const frame = dedicatedAttackFrame(sample.attackProgress);
      if (ref.body) {
        const direction=movementFacing(plan,id,elapsed);
        const unit=this.view?.state.units.find(u=>u.id===id);
        const walking=direction&&unit?castWalk(unit,direction):undefined;
        if(id==='escort-cart'&&this.textures.exists(CART_WHEEL.key)){
          const angle=this.completedCartAngle+cartWheelAngle(plan,id,elapsed,this.projection,ref.body.size*this.unitScale*CART_WHEEL.sourceRadius/256);
          ref.body.image.setTexture(CART_WHEEL.key,cartWheelFrame(angle)).setOrigin(ref.body.originX??.5,ref.body.originY).setDisplaySize(ref.body.size*this.unitScale,ref.body.size*this.unitScale);
          ref.body.walking=true;ref.body.dedicated=false;
        } else if(walking&&this.textures.exists(walking.key)&&[0,1,2,3].every(frame=>this.textures.get(walking.key).has(String(frame)))){
          const size=256*90/walking.visibleHeight*this.unitScale;
          ref.body.image.setTexture(walking.key,distancePose(plan,id,elapsed,this.completedTravelTiles.get(id)??0)).setOrigin(walking.originX,walking.originY).setDisplaySize(size,size);
          ref.body.walking=true;ref.body.dedicated=false;
        } else if (body && bodyId && frame !== null && !sample.complete && this.bodyReady(bodyId)) {
          ref.body.image.setTexture(body.key, frame).setOrigin(.5, body.originY).setDisplaySize(body.displaySize * this.unitScale * this.adoptedBodyScale, body.displaySize * this.unitScale * this.adoptedBodyScale);
          ref.body.dedicated = true;
          ref.body.walking = false;
        } else if (this.walkCandidate && ((this.walkCandidate.mode==='continuous'&&id==='ally-lise')||hd2dWalkFrame(plan, id, elapsed) !== null)
          && this.textures.exists(HD2D_WALK.key)
          && Array.from({ length: HD2D_WALK.frames }, (_, i) => i).every(i => this.textures.get(HD2D_WALK.key).has(String(i)))) {
          ref.body.image.setTexture(HD2D_WALK.key, this.walkCandidate.mode==='continuous'?this.continuousFrame()%6:hd2dWalkFrame(plan, id, elapsed)!)
            .setOrigin(HD2D_WALK.originX, HD2D_WALK.originY)
            .setDisplaySize(HD2D_WALK.cell * 68 / this.walkCandidate.visibleHeight * this.adoptedBodyScale * this.unitScale,
              HD2D_WALK.cell * 68 / this.walkCandidate.visibleHeight * this.adoptedBodyScale * this.unitScale);
          const absolute=this.walkCandidate.mode==='continuous'?this.continuousFrame():hd2dWalkFrame(plan,id,elapsed)!;
          this.qaObserve(absolute%6,this.walkCandidate.mode==='continuous'?performance.now()-this.qaLoopEpoch:elapsed,absolute);
          ref.body.walking = true; ref.body.dedicated = false;
        } else if (ref.body.dedicated || ref.body.walking) {
          // Escort body direction is independent of its combat-facing arrow/state.
          const idle=unit&&this.view?castIdle(unit,escortVisualFacing(this.view.state,unit,plan,elapsed)):undefined;
          if(unit?.kind==='escort'&&idle&&this.textures.exists(idle.key)){
            ref.body.key=idle.key;ref.body.frame=undefined;ref.body.originX=idle.originX;ref.body.originY=idle.originY;ref.body.size=256*90/idle.visibleHeight;
          }
          ref.body.image.setTexture(ref.body.key, ref.body.frame).setOrigin(ref.body.originX ?? .5, ref.body.originY).setDisplaySize(ref.body.size * this.unitScale, ref.body.size * this.unitScale);
          ref.body.dedicated = false;
          ref.body.walking = false;
        }
      }
      // Dedicated poses already contain the strike/recoil; never add the old positional pulse.
      if (!bodyId && plan.attack?.actorId === id && sample.attackProgress !== null) {
        const target = this.projection(plan.attack.targetBefore.pos);
        const dx = target.x - x, dy = target.y - y, length = Math.hypot(dx, dy) || 1;
        const pulse = Math.sin(sample.attackProgress * Math.PI);
        const amount = (plan.attack.weapon === 'melee' ? 10 : -4) * this.unitScale * pulse;
        x += dx / length * amount; y += dy / length * amount;
      }
      ref.group.setPosition(x, y);
      if (ref.logicalDepth !== undefined) {
        const logicalDepth = motion ? (motion.from.x + motion.from.y) * (1 - motion.t) + (motion.to.x + motion.to.y) * motion.t : ref.logicalDepth;
        ref.group.setDepth(this.registeredDepth ? y + .4 : logicalDepth + .4);
        ref.overlay?.setPosition(x, y);
      }
      const hit = plan.attack?.targetId === id && plan.attack.resolution?.hit !== false && sample.attackProgress !== null;
      ref.group.setAlpha(ref.alpha * (hit ? 1 - .25 * Math.sin(sample.attackProgress! * Math.PI) : 1));
      const visible = !ref.ghost || (!sample.complete && (sample.attackProgress === null || sample.attackProgress < 1));
      ref.group.setVisible(visible); ref.overlay?.setVisible(visible);
    }
    if ([...this.actors.values()].some(ref => ref.logicalDepth !== undefined)) this.layer?.sort('depth');
  }
  private warnings: string[] = [];
  private report: (report: BoardRenderReport) => void;
  private landscapeLoads:LandscapeLoadController;
  private landscapeStopped=false;
  private preloadBattle?:BattleId;
  private landscapeGeneration=0;
  private cancelStageLoad?:()=>void;
  private clearBoardLayer(){this.layer?.destroy(true);this.layer=undefined;this.actors.clear();this.attackFeedback=undefined;this.projection=undefined;this.lastDrawnSize=undefined}
  constructor(pick: (p: Pos, floors?: Pos[]) => void, report: (report: BoardRenderReport) => void = () => {},private initialBattle:BattleId='B01',private walkCandidate:WalkQaCandidate|null=null) {super('board');this.pick=pick;this.report=report;
   this.landscapeLoads=this.createLandscapeController();
  }
  private createLandscapeController(){
   const generation=++this.landscapeGeneration;
   return new LandscapeLoadController({
    has:id=>landscapeMaterials(id as BattleId).every(m=>this.textures.exists(m.key)),
    load:id=>new Promise<void>((resolve,reject)=>{const done=()=>{this.load.off('complete',done);this.cancelStageLoad=undefined;resolve()};this.cancelStageLoad=()=>{this.load.off('complete',done);reject(new Error('Scene shutdown'))};this.load.once('complete',done);queueLandscapeMaterials(this,id as BattleId);this.load.start()}),
    prepare:id=>prepareLandscape(this,id as BattleId),release:id=>{if(generation===this.landscapeGeneration)releaseLandscape(this,id as BattleId)},clear:()=>this.clearBoardLayer(),changed:()=>{if(generation===this.landscapeGeneration&&this.sys.isActive())this.draw()},
   });
  }
  private ensureLandscapeController(){if(this.landscapeStopped){this.landscapeLoads=this.createLandscapeController();this.landscapeStopped=false}}
  retryLandscape(){this.landscapeLoads.retry()}
  private publish(stage: string, error: unknown = null, drawn = false) {
    this.report({ stage, error: error === null ? null : error instanceof Error ? error.message : String(error), warnings: [...this.warnings], drawn });
  }
  private onLoadError=(file:{key:string})=>{this.warnings.push(`素材読込: ${file.key}`);if(this.preloadBattle&&landscapeMaterials(this.preloadBattle).some(m=>m.key===file.key))this.landscapeLoads.recordFailure(this.preloadBattle,new Error('採用景観の素材を読み込めません'));this.publish('preload')};
  preload() {
    this.ensureLandscapeController();
    this.publish('preload');
    this.preloadBattle=this.view?.state.battleId??this.initialBattle;
    queueLandscapeMaterials(this,this.preloadBattle);
    this.load.off?.('loaderror',this.onLoadError);this.load.on('loaderror',this.onLoadError);
    // These optional shipped textures are registered centrally here, never in domain state.
    this.load.image('evacuees', '/assets/b07/evacuees.png');
    this.load.image('gate', '/assets/gate/gate.png');
    this.load.image('escort-cart', '/assets/escort/cart.png');
    for (const kind of ['dry', 'shallow', 'stone']) for (const variant of [0, 1]) this.load.image(`tile-${kind}-${variant}`, `/assets/terrain/${kind}-${variant}.png`);
    this.load.image('portrait-dani', '/assets/portraits/dani.png');
    for(const directions of Object.values(CAST_IDLE))for(const asset of Object.values(directions))this.load.image(asset.key,asset.path);
    for(const directions of Object.values(CAST_WALK))for(const asset of Object.values(directions))this.load.spritesheet(asset.key,asset.path,{frameWidth:256,frameHeight:256,endFrame:3});
    this.load.spritesheet(CART_WHEEL.key,CART_WHEEL.path,{frameWidth:256,frameHeight:256,endFrame:3});
    for (const body of Object.values(ATTACK_BODIES)) this.load.spritesheet(body.key, body.path, { frameWidth: body.cell, frameHeight: body.cell });
    if (this.walkCandidate) this.load.spritesheet(HD2D_WALK.key, HD2D_WALK.path, { frameWidth: HD2D_WALK.cell, frameHeight: HD2D_WALK.cell, endFrame: HD2D_WALK.frames - 1 });
    for (const asset of ['rise', 'garan', 'neia', 'sena', 'iva', 'toma', 'guard', 'archer']) this.load.spritesheet('cast-' + asset, '/assets/units/' + asset + '/sheet-transparent.png', { frameWidth: 256, frameHeight: 256 });
  }
  create() {
    this.ensureLandscapeController();
    this.publish('create');
    for (const kind of ['dry', 'shallow', 'stone']) for (const variant of [0, 1]) {
      const sourceKey = `tile-${kind}-${variant}`;
      if (!this.textures.exists(sourceKey)) continue;
      const key = sourceKey + '-diamond';
      try {
        // A failed optional terrain conversion must not abort Scene.create and
        // prevent the title, grid, people and all subsequent display() calls.
        if (this.textures.exists(key)) continue;
        const source = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
        const tile = this.textures.createCanvas(key, 192, 96);
        if (!tile) throw new Error('Canvas texture unavailable');
        const context = tile.getContext();
        context.setTransform(1, .5, -1, .5, 96, 0);
        context.drawImage(source, 0, 0, 96, 96);
        tile.refresh();
      } catch (error) {
        if (this.textures.exists(key)) this.textures.remove(key);
        this.warnings.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.scale.off('resize', this.onResize);
    this.scale.on('resize', this.onResize);
    this.events?.off?.('shutdown', this.onShutdown);
    this.events?.off?.('destroy', this.onShutdown);
    this.events?.once('shutdown', this.onShutdown);
    this.events?.once('destroy', this.onShutdown);
    this.draw();
  }
  display(view: BoardView) {
    if (this.battleId !== view.state.battleId || view.state.round < this.previousRound) {this.presentation = undefined;this.completedTravelTiles.clear();this.completedCartAngle=0;}
    this.battleId = view.state.battleId; this.previousRound = view.state.round; this.view = view; if (this.sys.isActive()) this.draw(); }
  private draw() {
    if (!this.view || !this.add) { this.lastDrawnSize = undefined; return; }
    if (!Number.isFinite(this.scale.width) || !Number.isFinite(this.scale.height) || this.scale.width <= 0 || this.scale.height <= 0) {
      this.lastDrawnSize = undefined;
      this.publish('waiting-for-size'); return;
    }
    const assets=this.landscapeLoads.request(this.view.state.battleId);
    if(assets.phase!=='ready'){this.lastDrawnSize=undefined;this.publish(assets.phase==='loading'?'loading-landscape':'landscape-failed',assets.error??null);return}
    try {
      this.drawBoard();
      this.lastDrawnSize = { width: this.scale.width, height: this.scale.height };
      this.publish('drawn', null, true);
    } catch (error) { this.lastDrawnSize = undefined; this.publish('draw-failed', error); }
  }
  private drawBoard() {
    if (!this.view) return;
    this.layer?.destroy(true);
    this.attackFeedback = undefined;
    this.actors.clear();
    const layer = this.add.container(0, 0); this.layer = layer;
    const { state, selected, reachable, cursor, mode, enabled } = this.view;
    const config = getBattleConfig(state.battleId);
    const portBattle = state.battleId === 'B10';
    const repairing = config.objective === 'repair';
    const finalBattle = config.objective === 'finale';
    const evacuating = config.objective === 'evacuate';
    const width = this.scale.width, height = this.scale.height;
    const originalB01 = state.battleId === 'B01' && this.textures.exists(B01_TEXTURES.ground);
    const registered = registeredLandscape(state.battleId);
    const adoptedB01 = originalB01 || registered;
    this.registeredDepth = !!registered;
    // B01 uses the browser's map scroll container on narrow displays.
    if (this.input?.manager?.mouse) this.input.manager.mouse.preventDefaultWheel = !adoptedB01;
    if (this.input?.manager?.touch) this.input.manager.touch.capture = !adoptedB01;
    const camera = registered ? registeredProjection(width, height, registered.registration) : b01Projection(width, height);
    const unitScale = adoptedB01 ? camera.scale : Math.min(width / 1010, height / 650, 1.22);
    this.adoptedBodyScale = adoptedB01 ? 90 / 68 : 1;
    this.unitScale = unitScale;
    const tw = (registered ? registered.registration.tw : adoptedB01 ? 120 : 92) * unitScale, th = (registered ? registered.registration.th : adoptedB01 ? 60 : 46) * unitScale, elevation = (registered ? registered.registration.elevation : adoptedB01 ? 30 : 23) * unitScale;
    const ox = width / 2 - tw / 2, oy = (height - th * 8.5) / 2 + 22 * unitScale;
    const project = (p: Pos, h = 0) => adoptedB01 ? camera.project(p, h) : ({ x: ox + (p.x - p.y) * tw / 2, y: oy + (p.x + p.y) * th / 2 - h * elevation });
    const pointerFloors = (pointer: Phaser.Input.Pointer) => registered ? registeredProjection(width, height, registered.registration).floorsAt(registeredFloors(registered,state.cells), {x:pointer.worldX,y:pointer.worldY}) : b01FloorsAtPoint(state.cells, {
      x: (pointer.worldX - camera.offsetX) / camera.scale,
      y: (pointer.worldY - camera.offsetY) / camera.scale,
    });
    this.projection = (p: Pos) => project(p, state.cells.find(c => c.x === p.x && c.y === p.y)?.height ?? 0);
    const text = (x: number, y: number, value: string, size: number, color = '#f0e6c8') => {
      const t = this.add.text(x, y, value, { fontFamily: 'Georgia, serif', fontSize: adoptedB01 ? Math.max(11, size * unitScale) : size * unitScale, color, stroke: '#16353a', strokeThickness: 3 }).setOrigin(.5); if (adoptedB01) t.setDepth(1000); layer.add(t); return t;
    };
    if (registered) {
      if (!this.textures.exists(registered.key)||registered.cutaway&&!this.textures.exists(registered.key+'-insert')) throw new Error(state.battleId+'採用景観が読み込まれていません');
      const p = camera.source({x:0,y:0});
      layer.add(this.add.image(p.x,p.y,registered.key).setOrigin(0,0).setDisplaySize(registered.registration.width*unitScale,registered.registration.height*unitScale).setDepth(-100));
      for(const part of prepareRegisteredParts(this,registered)){if(part.whenGateOpen&&!state.gate.drained)continue;if(part.whenShallow&&!part.whenShallow.some(p=>state.cells.some(c=>c.x===p.x&&c.y===p.y&&c.shallow)))continue;const q=camera.source({x:part.bounds[0],y:part.bounds[1]});layer.add(this.add.image(q.x,q.y,part.key).setOrigin(0,0).setDisplaySize((part.bounds[2]-part.bounds[0])*unitScale,(part.bounds[3]-part.bounds[1])*unitScale).setDepth(part.depth));}
    }
    if (originalB01) {
      const raster = (key: string, bounds: number[], depth: number, alpha = 1) => {
        const p = camera.source({ x: bounds[0], y: bounds[1] });
        layer.add(this.add.image(p.x, p.y, key).setOrigin(0, 0).setDisplaySize((bounds[2] - bounds[0]) * unitScale, (bounds[3] - bounds[1]) * unitScale).setDepth(depth).setAlpha(alpha));
      };
      raster(B01_TEXTURES.ground, [0, 0, 1536, 1024], -100);
      raster(B01_TEXTURES.underfloor, [0, 0, 1536, 1024], -99);
      // Cut away only registered raised occluders of occupied/cursor lower floors.
      const lowerTargets = B01_SCENE.hiddenFloorCandidates.filter(c =>
        (cursor.x === c.x && cursor.y === c.y) || state.units.some(u => u.hp > 0 && u.pos.x === c.x && u.pos.y === c.y)
        || this.presentation?.plan.moves.some(m => m.path.some(p => p.x === c.x && p.y === c.y)));
      for (const part of B01_SCENE.parts) {
        const occludes = part.cell && lowerTargets.some(c => c.occluders.some(o => o.x === part.cell?.x && o.y === part.cell?.y));
        raster(part.key, part.bounds, part.depth, occludes ? .24 : 1);
      }
    }
    if (!adoptedB01 && this.textures.exists('landscape')) {
      const backdrop = this.add.image(width / 2, height / 2, 'landscape').setDisplaySize(width, height).setAlpha(.13); layer.add(backdrop);
    }
    if (!adoptedB01) text(width / 2, 29 * unitScale, `${config.id}  /  ${config.title} ${state.battleId === 'B05' ? '蔵内図' : '測量図'}`, 14, '#a2b8b0');
    const physicalFloorKeys=registered?new Set(registeredFloors(registered,state.cells).map(c=>c.x+','+c.y)):undefined;
    const cells = [...state.cells].sort((a, b) => a.x + a.y - b.x - b.y || a.x - b.x);
    for (const cell of cells) {
      if (registered && !physicalFloorKeys!.has(cell.x+','+cell.y)) continue;
      const p = project(cell, cell.height);
      if (originalB01 && cell.height === 0 && this.textures.exists(b01EnvironmentKey(cell))) layer.add(this.add.image(p.x, p.y, b01EnvironmentKey(cell)).setDisplaySize(tw, th).setDepth(cell.x + cell.y + .12));
      const sluicePanel = config.sluiceGates?.find(gate => gate.panel.x === cell.x && gate.panel.y === cell.y);
      const repairSite = config.repairSites?.find(site => site.pos.x === cell.x && site.pos.y === cell.y);
      const gathering = evacuating || repairing ? config.records.find(r => r.x === cell.x && r.y === cell.y) : undefined;
      let g = this.add.graphics(); layer.add(g);
      if (adoptedB01) g.setDepth(registered ? p.y + .1 : cell.x + cell.y + .1);
      const diamond = [new Phaser.Geom.Point(p.x, p.y - th / 2), new Phaser.Geom.Point(p.x + tw / 2, p.y), new Phaser.Geom.Point(p.x, p.y + th / 2), new Phaser.Geom.Point(p.x - tw / 2, p.y)];
      const canMove = mode === 'move' && reachable.some(r => r.x === cell.x && r.y === cell.y);
      const isCursor = cursor.x === cell.x && cursor.y === cell.y;
      if (!adoptedB01) {
      const depth = elevation * (cell.height + .45);
      g.fillStyle(0x475653).fillPoints([diamond[3], diamond[2], { x: p.x, y: p.y + th / 2 + depth }, { x: p.x - tw / 2, y: p.y + depth }], true);
      g.fillStyle(0x69736a).fillPoints([diamond[2], diamond[1], { x: p.x + tw / 2, y: p.y + depth }, { x: p.x, y: p.y + th / 2 + depth }], true);
      g.fillStyle(cell.water && !cell.bridge ? 0x245968 : cell.blocked ? 0x68736b : cell.shallow ? 0x397f87 : 0xa8ad91).fillPoints(diamond, true);
      const tileKey = `tile-${cell.bridge ? 'stone' : cell.water || cell.shallow ? 'shallow' : cell.blocked || cell.height > 0 || state.battleId === 'B05' ? 'stone' : 'dry'}-${(cell.x + cell.y) % 2}-diamond`;
      if (this.textures.exists(tileKey)) { layer.add(this.add.image(p.x, p.y, tileKey).setDisplaySize(tw, th)); g = this.add.graphics(); layer.add(g); }
      else if (this.textures.exists(tileKey.replace('-diamond', ''))) {
        // Keep the same source art even if CanvasTexture readback/conversion
        // fails. A rotated square in a half-height container is the same diamond.
        const tile = this.add.container(p.x, p.y).setScale(1, th / tw);
        tile.add(this.add.image(0, 0, tileKey.replace('-diamond', '')).setDisplaySize(tw / Math.SQRT2, tw / Math.SQRT2).setRotation(Math.PI / 4));
        layer.add(tile); g = this.add.graphics(); layer.add(g);
      }
      } else {
        if (originalB01 && cell.shallow) {
          const raw = camera.project(cell, cell.height);
          const sourceCenter = { x: 730 + (cell.x - cell.y) * 60, y: 270 + (cell.x + cell.y) * 30 - cell.height * 30 };
          const key = `b01-scene-water-${sourceCenter.x}-${sourceCenter.y}`;
          if (this.textures.exists(key)) layer.add(this.add.image(raw.x, raw.y, key).setDisplaySize(tw, th).setDepth(cell.x + cell.y + .12));
        }
        g = this.add.graphics(); layer.add(g); g.setDepth(registered ? p.y + .2 : cell.x + cell.y + .2);
      }
      if (cell.water && !cell.bridge) g.fillStyle(0x134b70, .65).fillPoints(diamond, true);
      g.lineStyle(adoptedB01 ? .7 : 1, adoptedB01 ? 0x455c4b : 0x173e41, adoptedB01 ? .23 : .65).strokePoints(diamond, true);
      if (cell.shallow) { g.lineStyle(1, 0xa1d5d4, .5); g.lineBetween(p.x - tw / 5, p.y, p.x + tw / 5, p.y); }
      if (canMove) {
        g.fillStyle(0x80ddd2, adoptedB01 ? .10 : .35).fillPoints(diamond, true);
        if (adoptedB01) g.lineStyle(1.6, 0x246b5b, .95).strokePoints(diamond, true);
      }
      if (adoptedB01) {
        // Flush legal boundary, not an exposed platform or a painted walkable extension.
        g.lineStyle(1.3, 0x5f654a, .72);
        if (cell.x === 0) g.lineBetween(diamond[3].x, diamond[3].y, diamond[0].x, diamond[0].y);
        if (cell.y === 0) g.lineBetween(diamond[0].x, diamond[0].y, diamond[1].x, diamond[1].y);
        if (cell.x === config.width - 1) g.lineBetween(diamond[1].x, diamond[1].y, diamond[2].x, diamond[2].y);
        if (cell.y === config.height - 1) g.lineBetween(diamond[2].x, diamond[2].y, diamond[3].x, diamond[3].y);
      }
      if (portBattle && config.gate && (mode === 'gate' || state.gate.pendingRound) && config.gate.x === cell.x && config.gate.y === cell.y) {
        g.lineStyle(2.5, 0xffd786).strokePoints(diamond, true);
        text(p.x, p.y + th / 3, state.gate.drained ? '港門 開通済み' : `R${state.gate.pendingRound ?? state.round + 1} 港門開通`, 10, '#ffe8a3');
      }
      if (config.gate && (mode === 'gate' || state.gate.pendingRound) && config.gateRegion.some(r => r.x === cell.x && r.y === cell.y)) {
        g.lineStyle(2.5, 0xffd786).strokePoints(diamond, true);
        text(p.x, p.y - th / 5, `R${state.gate.pendingRound ?? state.round + 1} ${config.reversibleGate && (state.gate.pendingDrained ?? !state.gate.drained) === false ? '入水' : '乾'}`, 10, '#ffe8a3');
      }
      for (const gate of config.sluiceGates ?? []) {
        const water = state.sluices?.[gate.id];
        if ((mode === `gate:${gate.id}` || water?.pendingRound) && gate.region.some(r => r.x === cell.x && r.y === cell.y)) {
          g.lineStyle(2.5, gate.id === 'N' ? 0xffd786 : 0x9ee6ff).strokePoints(diamond, true);
          text(p.x, p.y - th / 5, `${gate.id} R${water?.pendingRound ?? state.round + 1} ${(water?.pendingDrained ?? !water?.drained) ? '排水' : '入水'}`, 10, gate.id === 'N' ? '#ffe8a3' : '#c2f1ff');
        }
      }
      if (repairSite) {
        const repair = state.repairs?.[repairSite.id];
        if (mode === `repair:${repairSite.id}` || repair?.pendingRound) {
          g.lineStyle(2.5, 0xffd786).strokePoints(diamond, true);
          text(p.x, p.y + th / 3, repair?.completed ? `${repairSite.id} 復旧済み` : `${repairSite.id} R${repair?.pendingRound ?? state.round + 1}復旧`, 10, '#ffe8a3');
        }
      }
      const nextEscort = state.escort?.route[(state.escort?.index ?? 0) + 1];
      if (state.escort?.route.some(r => r.x === cell.x && r.y === cell.y)) {
        g.lineStyle(1.5, 0xd6bd7a, .8).strokePoints(diamond, true);
        if (nextEscort && nextEscort.x === cell.x && nextEscort.y === cell.y) text(p.x, p.y - th / 5, '次の護送先', 10, '#ffe5a0');
      }
      if (isCursor) g.lineStyle(adoptedB01 ? 1.2 : 3, adoptedB01 ? 0x547b69 : 0xffe6a5).strokePoints(diamond, true);
      if (cell.water && !cell.bridge) { text(p.x, p.y, '深水 ×', 10, '#b6e6ff'); }
      else if (cell.blocked && !gathering && !sluicePanel && !repairSite) {
        if (!adoptedB01) g.fillStyle(0x4a5651).fillRect(p.x - tw / 6, p.y - th * .8, tw / 3, th * .8);
        if (state.battleId === 'B05' && !adoptedB01) {
          g.lineStyle(1, 0xc1af83);
          for (const offset of [-.65, -.4, -.15]) g.lineBetween(p.x - tw / 7, p.y + th * offset, p.x + tw / 7, p.y + th * offset);
        }
        if (!adoptedB01) text(p.x, p.y - th * .5, evacuating || repairing ? '低い瓦礫・通行不可\n弩の射線は遮らない' : state.battleId === 'B05' ? '低い書架・通行不可\n弩の射線は遮らない' : portBattle ? '信号盤' : state.battleId === 'B06' && config.gate?.x === cell.x && config.gate?.y === cell.y ? '操作盤' : '壁', state.battleId === 'B05' || evacuating || repairing ? 8.5 : 10);
      } else if (!adoptedB01 || isCursor) text(p.x, p.y + th / 4, `H${cell.height}${cell.bridge ? ' 橋' : ''}${cell.shallow ? ' ≋' : ''}`, 9, '#dee6cf');
      const hit = this.add.zone(p.x, p.y, tw, th).setInteractive(new Phaser.Geom.Polygon(diamond.map(q => ({ x: q.x - p.x + tw / 2, y: q.y - p.y + th / 2 }))), Phaser.Geom.Polygon.Contains);
      if (adoptedB01) hit.setDepth(registered ? p.y + .25 : cell.x + cell.y + .25);
      hit.on(adoptedB01 ? 'pointerup' : 'pointerdown', (pointer: Phaser.Input.Pointer) => { if (enabled && (!adoptedB01 || pointer.getDistance() < 10)) this.pick({ x: cell.x, y: cell.y }, adoptedB01 ? pointerFloors(pointer) : undefined); }); layer.add(hit);
      const chest = state.equipmentChests?.find(chest => chest.pos.x === cell.x && chest.pos.y === cell.y);
      if (chest) {
        const pending = state.pendingEquipment?.includes(chest.eventId);
        g.lineStyle(2, pending ? 0x9cd3b1 : 0xffd786).strokeRect(p.x - 10 * unitScale, p.y - 10 * unitScale, 20 * unitScale, 13 * unitScale);
        text(p.x, p.y - 20 * unitScale, pending ? (adoptedB01 ? '箱 ✓' : '箱 仮回収') : adoptedB01 ? '箱' : '任意 装備箱', adoptedB01 ? 9 : 10, pending ? '#b5dfbf' : '#ffe6a0');
      }
      const rec = config.records.find(r => r.x === cell.x && r.y === cell.y && !state.records.includes(r.id));
      if (gathering) {
        g.lineStyle(2, state.records.includes(gathering.id) ? 0x86d4b2 : 0xf2ce83).strokePoints(diamond, true);
        const worker=repairing?registered?.worker:undefined;
        const workerIdle=repairing?CAST_IDLE.worker.S:undefined;
        if(!state.records.includes(gathering.id)&&workerIdle&&this.textures.exists(workerIdle.key))layer.add(this.add.image(p.x,p.y,workerIdle.key).setOrigin(workerIdle.originX,workerIdle.originY).setDisplaySize(256*90/workerIdle.visibleHeight*unitScale,256*90/workerIdle.visibleHeight*unitScale).setDepth(p.y+.3));
        else if (!state.records.includes(gathering.id) && worker && this.textures.exists(registered!.key+'-worker')) layer.add(this.add.image(p.x,p.y,registered!.key+'-worker').setOrigin(worker.foot[0]/worker.width,worker.foot[1]/worker.height).setDisplaySize(worker.width*90/worker.visibleHeight*unitScale,worker.height*90/worker.visibleHeight*unitScale).setDepth(p.y+.3));
        else if (!state.records.includes(gathering.id) && this.textures.exists('evacuees')) layer.add(this.add.image(p.x, p.y, 'evacuees').setOrigin(.5, registered ? 237/256 : .93).setDisplaySize((registered ? 256*90/190 : 84) * unitScale, (registered ? 256*90/190 : 84) * unitScale).setDepth(registered ? p.y+.3 : 0));
        text(p.x, p.y - (state.records.includes(gathering.id) ? 10 : registered ? 97 : 77) * unitScale, `${gathering.id} ${repairing ? (state.records.includes(gathering.id) ? '救出済み' : gathering.name) : state.records.includes(gathering.id) ? '案内済み' : '住民集合点'}`, 11, '#ffe8ac');
      }
      if (rec && !evacuating && !repairing) { text(p.x, p.y - 7 * unitScale, `${state.battleId === 'B05' ? (rec.optional ? '任意 ▤' : '資料 ▤') : rec.id === 'O' ? '観測' : rec.id === 'M' ? '名簿' : '▣'} ${rec.id}`, state.battleId === 'B05' ? 14 : adoptedB01 ? 12 : 19, rec.optional ? '#b8dfec' : '#fff0ad'); }
      if (config.gate && cell.x === config.gate.x && cell.y === config.gate.y) {
        const showGateProp=this.textures.exists('gate')&&!(registered&&(state.battleId==='B06'||state.battleId==='B10'));
        if (showGateProp) { const gateImage = this.add.image(p.x, p.y, 'gate').setOrigin(.5, .92).setDisplaySize(76 * unitScale, 76 * unitScale); if (adoptedB01) gateImage.setDepth(registered ? p.y + .3 : cell.x + cell.y + .3); layer.add(gateImage); }
        text(p.x, p.y - (showGateProp ? 68 : 8) * unitScale, portBattle ? (state.gate.drained ? '⚙ 港門 開通' : state.gate.pendingRound ? `⚙ R${state.gate.pendingRound}港門開通` : '⚙ 港門 未開通') : config.gateEffect === 'chain' ? (state.gate.drained ? '⚙ 鎖門 開通' : state.gate.pendingRound ? `⚙ R${state.gate.pendingRound}開通` : '⚙ 鎖門 未開通') : config.reversibleGate ? (state.gate.drained ? '⚙ 乾地' : '⚙ 入水') : state.gate.drained ? '⚙ 排水済' : '⚙ 水門', adoptedB01 ? 10 : 12, '#ffdc9d');
      }
      if (sluicePanel) {
        const showSluiceProp=this.textures.exists('gate')&&!registered;
        const water = state.sluices?.[sluicePanel.id];
        if (showSluiceProp) layer.add(this.add.image(p.x, p.y, 'gate').setOrigin(.5, .92).setDisplaySize(65 * unitScale, 65 * unitScale));
        text(p.x, p.y - (showSluiceProp ? 59 : 8) * unitScale, `${sluicePanel.id} 操作盤\n${water?.drained ? '排水済み' : '浅瀬'}${water?.pendingRound ? ` / R${water.pendingRound}${water.pendingDrained ? '排水' : '再入水'}` : ''}`, 11, sluicePanel.id === 'N' ? '#ffe8a3' : '#c2f1ff');
      }
      if (repairSite) {
        const repair = state.repairs?.[repairSite.id];
        const showRepairProp=this.textures.exists('gate')&&!registered;
        if (showRepairProp) layer.add(this.add.image(p.x, p.y, 'gate').setOrigin(.5, .92).setDisplaySize(65 * unitScale, 65 * unitScale));
        text(p.x, p.y - (showRepairProp ? 59 : 8) * unitScale, `${repairSite.id} ${repairSite.name}\n${repair?.completed ? '復旧済み' : repair?.pendingRound ? `R${repair.pendingRound}復旧予約` : '未復旧'} / 要${repairSite.workerRecordId}`, 11, '#ffe8a3');
      }
      if (config.capturePoint && cell.x === config.capturePoint.x && cell.y === config.capturePoint.y) { g.lineStyle(3, 0xf0c167).strokePoints(diamond, true); text(p.x, p.y - 8 * unitScale, `${portBattle ? '検問' : '制圧'} C ${state.capture?.heldRounds ?? 0}/${config.requiredHoldRounds ?? 2}`, 14, '#fff0ad'); }
      const control = config.controlPoints?.find(point => point.pos.x === cell.x && point.pos.y === cell.y);
      if (control) {
        const occupant = state.units.find(unit => unit.team === 'player' && unit.kind !== 'escort' && unit.hp > 0 && unit.pos.x === cell.x && unit.pos.y === cell.y);
        g.lineStyle(3, control.id === 'A' ? 0xffd786 : 0x9ee6ff).strokePoints(diamond, true);
        text(p.x, p.y + th / 3, control.id + ' 操作点 (' + cell.x + ',' + cell.y + ')\n' + (occupant ? occupant.name + ' 占有中' : '空き') + ' / 共有保持' + (state.finalControl?.heldRounds ?? 0) + '/2R', 10, control.id === 'A' ? '#ffe8a3' : '#c2f1ff');
      }
      if (config.objective !== 'capture' && config.objective !== 'sluice' && !finalBattle && cell.x === config.exit.x && cell.y === config.exit.y) text(p.x, p.y - 8 * unitScale, repairing ? '⇠ 西退去口（リセ）' : evacuating ? '⇢ 東出口（リセ）' : state.battleId === 'B05' ? '⇠ 西退去口' : state.battleId === 'B09' ? '⇢ 退出口（一行）' : state.battleId === 'B06' ? '⇢ 保護地点' : config.objective === 'escort' ? '⇢ 搬出' : '⇢ 脱出', 14, '#ecf3c0');
    }
    const attack = this.presentation?.plan.attack;
    // The ghost and its HP bar use a detached pre-hit visual snapshot only.
    // The authoritative unit remains downed and its cell remains unoccupied.
    const ghost = attack && attack.resolution?.hit !== false && state.units.some(unit => unit.id === attack.targetId && unit.hp <= 0) ? attack.targetBefore : undefined;
    const visibleUnits = [...state.units.filter(u => u.hp > 0), ...(ghost ? [ghost] : [])];
    for (const unit of visibleUnits.sort((a, b) => a.pos.x + a.pos.y - b.pos.x - b.pos.y)) {
      const cell = state.cells.find(c => c.x === unit.pos.x && c.y === unit.pos.y)!;
      const p = project(unit.pos, cell.height);
      const group = this.add.container(p.x, p.y); layer.add(group);
      if (adoptedB01) group.setDepth(registered ? p.y + .4 : unit.pos.x + unit.pos.y + .4);
      const ring = this.add.graphics(); group.add(ring);
      if (adoptedB01) ring.fillStyle(0x283d29, .24).fillEllipse(0, 1, tw * .35, th * .16);
      ring.fillStyle(unit.team === 'player' ? 0x8be2d6 : 0xd88a70, adoptedB01 ? .05 : .7).fillEllipse(0, 1, tw * .45, th * .37);
      if (unit.id === selected || unit.id === state.activeId) ring.lineStyle(adoptedB01 ? 1.2 : 3, adoptedB01 ? 0x5d7962 : 0xffedb4).strokeEllipse(0, 1, tw * .54, th * .48);
      // Generated cast strips are connected after asset normalization; fallback keeps load failures visible.
      const asset = unit.id === 'ally-lise' ? 'rise' : unit.id === 'ally-garan' ? 'garan' : unit.id === 'ally-neia' ? 'neia' : unit.id === 'ally-sena' ? 'sena' : unit.id === 'ally-iva' ? 'iva' : unit.id === 'escort-toma' || unit.id === 'escort-delegation' ? 'toma' : unit.weapon === 'bow' ? 'archer' : 'guard';
      const isCart = unit.id === 'escort-cart';
      const isDani = unit.id === 'ally-dani';
      const displayFacing=escortVisualFacing(state,unit,this.presentation?.plan,this.presentation?performance.now()-this.presentation.startedAt:Infinity);
      const naturalCandidate=castIdle(unit,displayFacing);
      const natural=naturalCandidate&&this.textures.exists(naturalCandidate.key)?naturalCandidate:undefined;
      const wheelReady=isCart&&this.textures.exists(CART_WHEEL.key);
      const spriteKey = wheelReady?CART_WHEEL.key:natural?.key ?? (isDani ? 'portrait-dani' : isCart ? 'escort-cart' : 'cast-' + asset);
      const idleFrame=wheelReady?cartWheelFrame(this.completedCartAngle):natural?undefined:isCart||isDani?undefined:{N:0,E:1,S:2,W:3}[displayFacing];
      const anchor = natural?{x:natural.originX,y:natural.originY,height:natural.visibleHeight/256}:isCart&&registered ? {x:121.54716981132076/256,y:235/256,height:143/256} : adoptedB01 && !isCart && !isDani ? b01ActorAnchor(asset, displayFacing) : undefined;
      const bodySize = isCart&&registered ? 256*.7 : anchor ? 90 / anchor.height : isCart ? 90 : 80;
      let bodyRef: { image: Phaser.GameObjects.Image; key: string; frame?: number; originX?: number; originY: number; size: number; dedicated: boolean } | undefined;
      if (this.textures.exists(spriteKey)) {
        const sprite = this.add.image(0, 0, spriteKey, idleFrame)
          .setOrigin(anchor?.x ?? .5, anchor?.y ?? (isCart ? .92 : 237 / 256)).setDisplaySize(bodySize * unitScale, bodySize * unitScale)
          .setInteractive({ pixelPerfect: true, alphaTolerance: 10, useHandCursor: true });
        sprite.on(adoptedB01 ? 'pointerup' : 'pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (enabled && (!adoptedB01 || _pointer.getDistance() < 10)) {
            const floors = adoptedB01 ? pointerFloors(_pointer) : [];
            const ambiguous = floors.length > 1;
            if (ambiguous && !floors.some(c => c.x === unit.pos.x && c.y === unit.pos.y)) floors.push({ ...cell });
            this.pick({ ...unit.pos }, ambiguous ? floors : undefined);
          }
        });
        bodyRef = { image: sprite, key: spriteKey, frame: idleFrame, originX: anchor?.x ?? .5, originY: anchor?.y ?? (isCart ? .92 : 237 / 256), size: bodySize, dedicated: false };
        group.add(sprite);
      }
      else {
        ring.fillStyle(unit.team === 'player' ? 0xe9d8a6 : 0x973e34).fillRoundedRect(-11 * unitScale, -45 * unitScale, 22 * unitScale, 42 * unitScale, 6 * unitScale);
        ring.fillStyle(0xf0cba3).fillCircle(0, -49 * unitScale, 8 * unitScale);
      }
      const hud = adoptedB01 ? this.add.container(p.x, p.y).setDepth(1001) : group;
      if (adoptedB01) layer.add(hud);
      const showHud = !adoptedB01 || unit.id === selected || unit.id === state.activeId;
      const hudInk = adoptedB01 ? this.add.graphics() : ring;
      if (adoptedB01) hud.add(hudInk);
      const label = this.add.text(0, (adoptedB01 ? 19 : -83) * unitScale, `${unit.name}${finalBattle && unit.id === config.commanderId ? ' [指揮官・非致死制圧対象]' : unit.id === 'escort-delegation' ? ' [一行・共有HP]' : unit.kind === 'escort' ? ' [護送]' : unit.acted ? ' ✓' : ''}`, { fontFamily: 'sans-serif', fontSize: (adoptedB01 ? 10 : 11) * unitScale, color: '#fff7dd', backgroundColor: adoptedB01 ? '#304538bb' : '#153438dd', padding: { x: 4, y: 2 } }).setOrigin(.5); hud.add(label);
      hudInk.fillStyle(0x102b2e).fillRect(-23 * unitScale, (adoptedB01 ? 31 : -64) * unitScale, 46 * unitScale, 5 * unitScale);
      hudInk.fillStyle(unit.team === 'player' ? 0x7fdbbf : 0xe38d70).fillRect(-23 * unitScale, (adoptedB01 ? 31 : -64) * unitScale, 46 * unitScale * unit.hp / unit.maxHp, 5 * unitScale);
      const facing = { N: '↗', E: '↘', S: '↙', W: '↖' }[unit.facing];
      const arrow = this.add.text(20 * unitScale, -17 * unitScale, facing, { fontSize: 18 * unitScale, color: '#fff3b8', stroke: '#153438', strokeThickness: 3 }); hud.add(arrow);
      if (adoptedB01 && !showHud) { label.setVisible(false); hudInk.setVisible(false); arrow.setVisible(false); }
      if (unit.acted && unit.kind !== 'escort') group.setAlpha(.65);
      this.actors.set(unit.id, { group, x: p.x, y: p.y, alpha: unit.acted && unit.kind !== 'escort' ? .65 : 1, ghost: unit === ghost, ...(adoptedB01 ? { logicalDepth: unit.pos.x + unit.pos.y, overlay: hud } : {}), body: bodyRef });
    }
    const commander = finalBattle ? state.units.find(unit => unit.id === config.commanderId) : undefined;
    if (commander && commander.hp <= 0 && state.finalControl?.commanderSubdued && !ghost) {
      const cell = state.cells.find(cell => cell.x === commander.pos.x && cell.y === commander.pos.y)!;
      const marker = project(commander.pos, cell.height);
      text(marker.x, marker.y + th / 3, 'ヴェスク 制圧済み・保全対象\n非致死 / セル占有なし / 戦後首府警備隊が拘束', 10, '#c2f1ff');
    }
    if (attack?.resolution) {
      const target = this.projection!(attack.targetBefore.pos), result = attack.resolution;
      this.attackFeedback = text(target.x, target.y - (adoptedB01 ? 124 : 106) * unitScale, result.hit ? `命中 −${result.damage}` : '外れ', 16, result.hit ? '#ffe6a0' : '#e3eee8');
    }
    if (adoptedB01) layer.sort('depth');
    this.applyPresentation();
    if (!adoptedB01) text(width / 2, height - 24 * unitScale, finalBattle ? 'A/B 生存味方の同時占有を連続2R＋ヴェスク制圧 / R終了判定 / 敵隣接で保持は妨げられない' : evacuating ? '北 N ↗  東 E ↘  南 S ↙  西 W ↖  ·  V 住民集合点（案内後通行可） / 低い瓦礫は通行不可' : state.battleId === 'B05' ? '北 N ↗  東 E ↘  南 S ↙  西 W ↖   ·   H 高さ / ▤ 資料 / 低い書架・通行不可／弩の射線は遮らない' : '北 N ↗  東 E ↘  南 S ↙  西 W ↖    ·    H 高さ  /  ≋ 浅瀬', 11, '#a5bcb3');
  }
}
