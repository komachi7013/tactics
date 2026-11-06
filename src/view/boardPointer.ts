/** Phaser also observes releases on the surrounding DOM; only canvas clicks pick. */
export function canPickBoard(pointer:{event?:{target:EventTarget|null};getDistance():number},canvas:EventTarget):boolean {
 return pointer.getDistance()<10&&(!pointer.event||pointer.event.target===canvas);
}
