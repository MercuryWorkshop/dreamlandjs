import { ComponentContext, DomImpl } from "dreamland/core";

import { CSSOM } from "rrweb-cssom";

import {
	Element as DomElement,
	Comment as DomComment,
	Text as DomText,
	AnyNode as DomNode,
} from "domhandler";

export class Node {
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
			this.splice(idx, 1);
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

	style = {};

	constructor(type: string, namespace?: string) {
		super();

		this.type = type;
		this.namespace = namespace;
	}

	addEventListener() {}

	setAttribute(key: string, value: any) {
		if (key === "class") this.classList.push(...value.split(" "));
		this.attributes.set(key, "" + value);
	}

	set $(value: any) {
		this.component = value;
	}

	toStandard(): DomElement {
		let styles = Object.entries(this.style);
		if (styles.length) {
			this.attributes.set(
				"style",
				styles
					.map(([k, v]) => {
						const kebab = k.replace(/([A-Z])/g, "-$1").toLowerCase();
						return `${kebab}: ${v};`;
					})
					.join(" ")
			);
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
		elArr.push(el);
		return el;
	};
	return [
		{
			createElement(type: string) {
				return push(type === "style" ? new Style() : new Element(type));
			},
			createElementNS(ns: string, type: string) {
				return push(new Element(type, ns));
			},

			arr: elArr,
			head: new Element("head"),
		},
		Node,
		(text?: string) => push(new Text(text || "")),
		(text?: string) => push(new Comment(text || "")),
		old[4],
	] as const satisfies DomImpl;
};
