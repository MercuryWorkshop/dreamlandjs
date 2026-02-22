import { Element as DomElement, Text as DomText } from "domhandler";
import {
	DREAMLAND,
	jsx,
	setDomImpl,
	DomImpl,
	getDomImpl,
} from "dreamland/core";
import { Node as VdomNode, Comment, Text, Element, newVDom } from "./vdom";
import { AsyncLocalStorage } from "node:async_hooks";

import { CSS_IDENT, SSR_DATA } from "../common/consts";
import { Node, SsrData } from "../common/types";
import { serializeState } from "../common/serialize";

export interface RenderedComponent {
	head: DomElement[];
	data: DomElement;
	component: DomElement;
}

let storage = new AsyncLocalStorage<DomImpl>();
let dom = getDomImpl()();
setDomImpl(() => storage.getStore() || dom);

export async function render(
	component: () => Promise<any> | any
): Promise<RenderedComponent> {
	let vdom = newVDom();
	return storage.run(vdom, async () => {
		let dl = jsx[DREAMLAND];
		let ret: any;
		dl.css();
		ret = await component();
		await Promise.all(vdom[0].promises);

		let root: Element,
			extraHead: Element[] = [];
		if (ret instanceof Array) {
			root = ret[0];
			extraHead = ret[1];
		} else {
			root = ret;
		}

		let domIds = new Set<number>();
		let domCssIdents = new Set();
		let walk = (el: VdomNode) => {
			domIds.add(el._id);
			if (el instanceof Element && el.component) {
				if (el.component.id) domCssIdents.add(el.component.id);
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
				[...vdom[0].identArr.entries()].filter(([_, i]) => domCssIdents.has(i))
			),
			t: [],
		};

		for (let el of vdom[0].elArr) {
			if (!domIds.has(el._id)) continue;

			let node: Node | undefined;
			if (el instanceof Element && el.component) {
				node = serializeState(
					data,
					el.component.state,
					(x) => x instanceof vdom[1]
				);
			} else if ((el instanceof Comment || el instanceof Text) && el.parent) {
				node = [el.parent._id, el.parent.childNodes.indexOf(el)];
				dev: {
					node.push(el.data);
				}
			}
			data.n[el._id] = node!;
		}

		let seen = new Set<VdomNode>();
		for (let el of vdom[0].elArr) {
			if (!(el instanceof Text) || !el.parent || seen.has(el)) continue;

			let siblings = el.parent.childNodes;
			let start = siblings.indexOf(el);

			let run: Text[] = [];
			for (
				let j = start;
				j < siblings.length && siblings[j] instanceof Text;
				j++
			) {
				run.push(siblings[j] as Text);
				seen.add(siblings[j]);
			}

			if (run.length < 2) continue;

			for (let j = 0; j < run.length; j++) {
				if (domIds.has(run[j]._id)) {
					data.t.push([el.parent._id, start + j, run[j].data.length]);
				}
			}
		}

		dev: {
			let pruned = vdom[0].elArr
				.map((x) => x._id)
				.filter((id) => !domIds.has(id))
				.sort((a, b) => a - b);

			let ranges: (number | [number, number])[] = [];
			let start = -1,
				end = -1;
			let flush = () => {
				if (end - start >= 2) ranges.push([start, end]);
				else for (let i = start; i <= end; i++) ranges.push(i);
			};
			for (let id of pruned) {
				if (start === -1) {
					start = end = id;
				} else if (id === end + 1) {
					end = id;
				} else {
					flush();
					start = end = id;
				}
			}
			if (start !== -1) flush();
			data.p = ranges;
		}

		let head = [
			...extraHead,
			...vdom[0].head.childNodes.filter(
				(x) =>
					x instanceof Element &&
					domCssIdents.has(x.attributes.get(CSS_IDENT + "id"))
			),
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
	});
}
