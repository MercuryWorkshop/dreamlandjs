import { MAP } from "../consts";
import { CSS_COMPONENT } from "../css";
import { Pointer, maybeListen } from "../state/pointers";
import { findLIS } from "../utils";
import { ComponentChild } from "./definitions";
import { CSS_IDENT, getDom } from "./dom";

let blacklisted = [null, undefined, false, true];
let isBlacklisted = (val: any): val is null | undefined | boolean =>
	blacklisted.includes(val);

export let mapChild = (
	child: ComponentChild,
	parent: Node,
	cssIdent?: string,
	identOverride?: string
): Node[] => {
	let [, NODE, new_Text, new_Comment, , , hydrating] = getDom();

	if (isBlacklisted(child)) {
		return [new_Comment()];
	} else if (child instanceof Pointer) {
		let start = new_Comment("[");
		let end = new_Comment("]");
		let current: Node[];

		maybeListen(child, start, (val: ComponentChild) => {
			if (current && !start.parentNode) return;
			let mapped: Node[] = mapChild(val, parent, cssIdent, child._cssIdent);
			let hydrating = getDom()[6];

			// pretty sure it's not possible to put a pointer child in not a htmlelement
			if (!hydrating?.(parent as HTMLElement) && current) {
				let actual: Node[] = [];
				for (let n = start.nextSibling; n && n !== end; n = n.nextSibling) {
					actual.push(n);
				}
				let old = MAP(actual.map((x, i) => [x, i]));
				let staticNodes = mapped.map((x) => old.get(x)!).filter((x) => x + 1); // undefined -> NaN (falsy), 0 -> 1 (truthy), n -> n+1 (truthy)
				let LIS = MAP(findLIS(staticNodes).map((x) => [actual[x], ,]));
				let anchor: Node = start;

				mapped.map((child) => {
					if (!old.has(child) || !LIS.has(child)) {
						parent.insertBefore(child, anchor.nextSibling);
					}
					anchor = child;
				});

				actual.map(
					(x) =>
						!mapped.includes(x) &&
						x.parentNode === parent &&
						parent.removeChild(x)
				);
			}
			current = mapped;
		});

		return [
			start,
			...(hydrating?.(parent as HTMLElement) ? [] : current!),
			end,
		];
	} else if (child instanceof (NODE as typeof globalThis.Node)) {
		let list: DOMTokenList;
		let apply = (child: any) => {
			if ((list = child.classList)) {
				let arr = [...list];
				if (arr.find((x) => x == CSS_COMPONENT)) return;

				let other = arr.find((x) => x.startsWith(CSS_IDENT));
				if (!other) {
					list.add(identOverride || cssIdent!);
				} else if (identOverride && other !== identOverride) {
					list.remove(other);
					list.add(identOverride);
				}

				child.childNodes.forEach(apply);
			}
		};
		if (identOverride || cssIdent) apply(child);

		return [child];
	} else if (child instanceof Array) {
		return child.flatMap((x) => mapChild(x, parent, cssIdent, identOverride));
	} else {
		return [new_Text(child as string)];
	}
};
