/** Minimal DOM port for card content and lifecycle, not a browser layout claim. */
export class InspectionNode {
 children: InspectionNode[] = [];
 attrs = new Map<string, string>(); dataset: Record<string, string> = {}; style: Record<string, string> = {};
 className = ''; hidden = false; src = ''; alt = ''; draggable = false;
 onerror: (() => void) | null = null;
 private ownText = '';
 classList = { add: (...names: string[]) => { this.className += ' ' + names.join(' '); } };
 constructor(readonly ownerDocument: InspectionDocument, readonly tagName = 'DIV') {}
 set textContent(value: string) { this.ownText = value; this.children = []; }
 get textContent(): string { return this.ownText + this.children.map(node => node.textContent).join(''); }
 append(...nodes: InspectionNode[]) { this.children.push(...nodes); }
 replaceChildren(...nodes: InspectionNode[]) { this.children = []; this.ownText = ''; this.append(...nodes); }
 setAttribute(name: string, value: string) { this.attrs.set(name, value); }
 all(): InspectionNode[] { return [this, ...this.children.flatMap(node => node.all())]; }
}
export class InspectionDocument {
 createElement(tag: string) { return new InspectionNode(this, tag.toUpperCase()); }
}
