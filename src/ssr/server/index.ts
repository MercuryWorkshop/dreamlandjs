import { Element as DomElement, Text as DomText } from "domhandler";
import { DREAMLAND, getDomImpl, jsx, setDomImpl } from "dreamland/core";
import { Node as VdomNode, Comment, Text, Element, newVDom } from "./vdom";

import { CSS_IDENT, SSR_DATA } from "../common/consts";
import { Node, SsrData } from "../common/types";
import { serializeState } from "../common/serialize";

export interface RenderedComponent {
	head: DomElement[];
	data: DomElement;
	component: DomElement;
}

export function render(component: () => any): RenderedComponent {
	let old = getDomImpl();
	let vdom = newVDom();

	setDomImpl(vdom);
	jsx[DREAMLAND]();
	let ret = component();
	setDomImpl(old);

	let root: Element,
		extraHead: Element[] = [];
	if (ret instanceof Array) {
		root = ret[0];
		extraHead = ret[1];
	} else {
		root = ret;
	}

	let domIds = [];
	let domIdents = new Set();
	let walk = (el: VdomNode) => {
		domIds.push(el._id);
		if (el instanceof Element && el.component) {
			if (el.component.id) domIdents.add(el.component.id);
		}

		for (let node of el.childNodes) {
			walk(node);
		}
	};
	walk(root);

	let data: SsrData = {
		k: [],
		v: [],
		n: {},
		i: Object.fromEntries(
			[...vdom[0].identArr.entries()].filter(([_, i]) => domIdents.has(i))
		),
		t: [],
	};

	for (let el of vdom[0].elArr.filter((x) => domIds.includes(x._id))) {
		let node: Node;
		if (el instanceof Element && el.component) {
			node = serializeState(
				data,
				el.component.state,
				(x) => x instanceof vdom[1]
			);
		}
		if ((el instanceof Comment || el instanceof Text) && el.parent) {
			node = [
				el.parent._id,
				el.parent.childNodes.findIndex((x) => x._id === el._id),
			];
		}
		data.n[el._id] = node;
	}

	let groups: Text[][] = vdom[0].elArr
		.reduce((acc, x) => {
			let lastGroup = acc.at(-1);
			let last: VdomNode = lastGroup?.at(-1);
			let lastIdx = last?.parent?.childNodes?.findIndex(
				(x) => x._id === last._id
			);
			let currentIdx = x.parent?.childNodes?.findIndex((y) => y._id === x._id);

			return Object.prototype.isPrototypeOf.call(
				Object.getPrototypeOf(x),
				last
			) && lastIdx + 1 === currentIdx
				? (lastGroup.push(x), acc)
				: [...acc, [x]];
		}, [])
		.filter((x) => x[0] instanceof Text);

	for (let group of groups) {
		if (group[0].parent && group.length > 1) {
			for (let item of group as Text[]) {
				if (domIds.includes(item._id)) {
					data.t.push([
						item.parent._id,
						item.parent.childNodes.findIndex((x) => x._id === item._id),
						item.data.length,
					]);
				}
			}
		}
	}

	let head = [
		...extraHead,
		...vdom[0].head.childNodes.filter((x) => {
			console.log(x);
			return true;
			// if (x instanceof Element) {
			// 	let cssId = x.attributes.get(CSS_IDENT + "id");
			// 	return domIdents.has(cssId);
			// }

			// return false;
		}),
	].map((x) => x.toStandard()) as DomElement[];

	return {
		head,
		data: new DomElement(
			"script",
			{ type: "application/json", [SSR_DATA]: ":3" },
			[new DomText(JSON.stringify(data))]
		),
		component: root.toStandard(),
	};
}
