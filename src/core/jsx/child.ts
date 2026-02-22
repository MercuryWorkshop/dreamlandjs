import { MAP } from "../consts";
import { CSS_COMPONENT } from "../css";
import { isPointer, maybeListen } from "../state/pointers";
import { findLIS, isArray, isNode } from "../utils";
import { ComponentChild } from "./definitions";
import { CSS_IDENT, getDom } from "./dom";

let isBlacklisted = (val: any): val is null | undefined | boolean =>
	[null, undefined, false, true].includes(val);

export let mapChild = (
	child: ComponentChild,
	parent: Node,
	cssIdent?: string,
	identOverride?: string
): Node[] => {
	let [, , new_Text, new_Comment, , , hydrating] = getDom();

	if (isBlacklisted(child)) {
		return [new_Comment()];
	} else if (isPointer(child)) {
		let start = new_Comment("[");
		let end = new_Comment("]");
		let current: Node[];

		maybeListen(child, start, (val: ComponentChild) => {
			if (current && !start.parentNode) return;
			let mapped: Node[] = mapChild(val, parent, cssIdent, child._cssIdent);
			let hydrating = getDom()[6];

			// pretty sure it's not possible to put a pointer child in not a htmlelement
			if (!hydrating?.(parent as HTMLElement) && current) {
				let old = MAP(current.map((x, i) => [x, i]));
				let staticNodes = mapped.map((x) => old.get(x)!).filter((x) => x);
				let LIS = MAP(findLIS(staticNodes).map((x) => [current[x], ,]));
				let anchor: Node = start;

				mapped.map((child) => {
					if (!old.has(child) || !LIS.has(child)) {
						parent.insertBefore(child, anchor.nextSibling);
					}
					anchor = child;
				});

				current.map(
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
	} else if (isNode(child)) {
		let list: DOMTokenList;
		let apply = (child: any) => {
			if ((list = child.classList)) {
				let arr = [...list];
				let other = arr.find((x) => x.startsWith(CSS_IDENT));

				if (arr.find((x) => x == CSS_COMPONENT)) return;

				if (!other) {
					list.add(identOverride || cssIdent!);
				} else if (identOverride && other !== identOverride) {
					list.remove(other);
					list.add(identOverride);
				}

				[...child.childNodes].map(apply);
			}
		};
		if (identOverride || cssIdent) apply(child);

		return [child];
	} else if (isArray(child)) {
		return child.flatMap((x) => mapChild(x, parent, cssIdent, identOverride));
	} else {
		return [new_Text(child as string)];
	}
};
