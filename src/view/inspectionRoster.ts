import type { Unit } from '../domain/types';
import {castIdentity,castPortraitPath} from './castIdentity';

/** Same south-facing head crop in the list and detail, aligned to Neia's reference. */
export function createInspectionFace(unit:Pick<Unit,'id'|'weapon'>):HTMLSpanElement {
 const face=document.createElement('span');face.className='inspection-face';face.setAttribute('aria-hidden','true');
 const image=document.createElement('img');image.alt='';image.draggable=false;
 const portrait=castPortraitPath(unit);
 if(portrait){image.src=portrait;face.classList.add('inspection-portrait','inspection-derived-portrait');image.onerror=()=>{image.hidden=true;};face.append(image);face.dataset.faceAsset=castIdentity(unit)!;return face;}
 const asset=unit.id==='ally-lise'?'rise':unit.id==='ally-garan'?'garan':unit.id==='ally-neia'?'neia':unit.id==='ally-sena'?'sena':unit.id==='ally-iva'?'iva':unit.id==='escort-toma'||unit.id==='escort-delegation'?'toma':unit.weapon==='bow'?'archer':'guard';
 if(unit.id==='ally-dani'){image.src='/assets/portraits/dani.png';face.classList.add('inspection-portrait');}
 else if(unit.id==='escort-cart'){image.src='/assets/escort/cart.png';face.classList.add('inspection-portrait');}
 else image.src=`/assets/units/${asset}/sheet-transparent.png`;
 // A failed decorative face must not remove the person's name or inspection button.
 image.onerror=()=>{image.hidden=true;};face.append(image);
 face.dataset.faceAsset=asset;return face;
}

/** Presentation only: HP0 commanders are preserved, while ordinary casualties withdraw. */
export function inspectionUnitStatus(unit:Pick<Unit,'id'|'hp'|'kind'|'acted'>):string {
 return unit.hp<=0 ? (unit.id==='enemy-vesk'?'制圧済み・保全対象':'退避') : unit.kind==='escort'?'護送・自動':unit.acted?'行動済み':'未行動';
}

/** Read-only inspection controls; target confirmation and activation belong elsewhere. */
export function renderInspectionRoster(host: HTMLElement, units: readonly Unit[], selected: string | null, disabled: boolean, inspect: (id: string) => void): void {
 const buttons=units.map(unit=>{
  const button=document.createElement('button');button.type='button';button.className='inspection-card';button.disabled=disabled;
  button.dataset.focusKey='inspect-card:'+unit.id;button.setAttribute('aria-pressed',String(unit.id===selected));
  const status=inspectionUnitStatus(unit);
  button.setAttribute('aria-label',`${unit.name}、HP ${unit.hp}/${unit.maxHp}、${unit.role}、${status}。詳細を見る`);
  const face=createInspectionFace(unit);
  const text=document.createElement('span');text.className='inspection-card-text';
  const name=document.createElement('strong');name.textContent=unit.name;
  const role=document.createElement('span');role.className='inspection-card-role';role.textContent=unit.role;
  const hp=document.createElement('span');hp.className='inspection-card-hp';hp.textContent=`HP ${unit.hp}/${unit.maxHp} · ${status}`;
  text.append(name,role,hp);button.append(face,text);button.onclick=()=>{if(!button.disabled)inspect(unit.id);};return button;
 });
 host.replaceChildren(...buttons);
}
