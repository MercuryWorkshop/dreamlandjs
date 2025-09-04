import { ComponentContext, DomImpl } from "dreamland/core";

import { CSSOM } from "rrweb-cssom";

import {
	Element as DomElement,
	Comment as DomComment,
	Text as DomText,
	AnyNode as DomNode,
} from "domhandler";
import { parseDocument } from "htmlparser2";
import renderToString from "dom-serializer";
import { SSR_ID } from "../common/consts";

export class Node {
	_id: number;
	nodeType: number;

	parent: Node;
	childNodes: Node[] = [];

	appendChild(node: Node) {
		node.parent = this;
		this.childNodes.push(node);
		return node;
	}
	append(node: Node) {
		return this.appendChild(node);
	}

	removeChild(node: Node) {
		this.childNodes.filter((x) => x !== node);
	}

	insertBefore(node: Node, anchor: Node) {
		this.childNodes.splice(
			this.childNodes.findIndex((x) => x === anchor),
			0,
			node
		);
	}

	toStandard(): DomNode {
		return null!;
	}

	get firstChild() {
		return this.childNodes[0];
	}
}

class ClassList extends Array {
	constructor() {
		super();
	}

	add(...classes: string[]) {
		this.push(...classes);
	}
	remove(...classes: string[]) {
		for (let cls of classes) {
			let idx = this.findIndex((x) => x === cls);
			if (idx !== -1) this.splice(idx, 1);
		}
	}

	empty(): boolean {
		return this.length == 0;
	}

	toString(): string {
		return this.join(" ");
	}
}

export class Element extends Node {
	nodeType: number = 1;

	namespace?: string = null;

	type: string;
	attributes: Map<string, string> = new Map();
	classList = new ClassList();

	component?: ComponentContext<any> = null;

	style = new CSSOM.CSSStyleDeclaration();

	constructor(type: string, namespace?: string) {
		super();

		this.type = type;
		this.namespace = namespace;
	}

	addEventListener() { }

	setAttribute(key: string, value: any) {
		if (key === "class") this.classList.push(...value.split(" "));
		this.attributes.set(key, "" + value);
	}
	removeAttribute(key: string) {
		if (key === "class") this.classList = new ClassList();
		this.attributes.delete(key);
	}

	replaceWith(el: Element) {
		let idx = this.parent.childNodes.findIndex(x => x === this);
		this.parent.childNodes[idx] = el;
	}

	get $() {
		return this.component;
	}

	set $(value: any) {
		this.component = value;
	}

	get innerHTML() {
		return renderToString(this.childNodes.map((x) => x.toStandard()));
	}
	set innerHTML(value: string) {
		let parsed = parseDocument(value);
		this.childNodes = parsed.childNodes.map((node) =>
			fromDomhandler(node, this)
		);
	}

	toStandard(): DomElement {
		if (this.style.cssText) {
			this.attributes.set("style", this.style.cssText);
		}

		let el = new DomElement(this.type, {
			...Object.fromEntries(this.attributes.entries()),
			...(this.classList.empty() ? {} : { class: this.classList.toString() }),
		});
		el.namespace = this.namespace;
		el.children = this.childNodes.map((x) => {
			let child = x.toStandard();
			child.parent = el;
			return child;
		});
		return el;
	}
}

function fromDomhandler(node: DomNode, parent: Node): Node {
	let newNode: Node;
	if (node.type === "text") {
		newNode = new Text((node as DomText).data);
	} else if (node.type === "comment") {
		newNode = new Comment((node as DomComment).data);
	} else if (node.type === "tag") {
		const element = new Element((node as DomElement).name);
		for (const key in (node as DomElement).attribs) {
			element.setAttribute(key, (node as DomElement).attribs[key]);
		}
		for (const child of (node as DomElement).childNodes) {
			element.appendChild(fromDomhandler(child, element));
		}
		newNode = element;
	} else {
		newNode = new Node();
	}
	newNode.parent = parent;
	return newNode;
}

export class Style extends Element {
	constructor() {
		super("style");
	}

	sheet = new CSSOM.CSSStyleSheet();

	set innerText(value: string) {
		this.sheet = CSSOM.parse(value);
	}

	toStandard(): DomElement {
		this.childNodes = [new Text(this.sheet.toString())];
		return super.toStandard();
	}
}

export class Comment extends Node {
	nodeType: number = 8;
	data: string;

	constructor(text: string) {
		super();

		this.data = text;
	}

	toStandard(): DomComment {
		return new DomComment(this.data);
	}
}

export class Text extends Node {
	nodeType: number = 3;

	data: string;

	constructor(text: string) {
		super();

		this.data = text;
	}

	toStandard(): DomText {
		return new DomText(this.data);
	}
}

export let newVDom = (old: DomImpl) => {
	let elArr: Node[] = [];
	let push = (el: Node) => {
		let i = elArr.push(el) - 1;
		el._id = i;
		if (el instanceof Element) el.setAttribute(SSR_ID, "" + i);
		return el;
	};

	let identArr: Record<number, string> = {};

	return [
		{
			createElement(type: string) {
				return push(type === "style" ? new Style() : new Element(type));
			},
			createElementNS(ns: string, type: string) {
				return push(new Element(type, ns));
			},

			elArr,
			identArr,

			head: new Element("head"),
		},
		Node,
		(text?: string) => push(new Text(text || "")),
		(text?: string) => push(new Comment(text || "")),
		() => {
			let ret = old[4]();
			identArr[elArr.length] = ret;
			return ret;
		},
		() => { }, // enables "ssr mode"
	] as const satisfies DomImpl;
};
