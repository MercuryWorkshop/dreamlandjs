import { MAP } from "../consts";
import { CSS_COMPONENT } from "../css";
import { Pointer } from "../state/pointers";
import { findLIS } from "../utils";
import { ComponentChild } from "./definitions";
import { CSS_IDENT, getDom } from "./dom";

const enum ChildStateType {
	Text = 1,
	Comment = 2,
	Node = 3,
	Pointer = 4,
}

type ChildState =
	| { _type: ChildStateType.Text; _node: Text; _value: string | number }
	| { _type: ChildStateType.Comment; _node: Comment }
	| { _type: ChildStateType.Node; _node: Node }
	| {
			_type: ChildStateType.Pointer;
			_anchor: Comment;
			_inner: MapChildRet;
			_ptr: Pointer<ComponentChild>;
	  };

type PointerChildState = ChildState & { _type: ChildStateType.Pointer };

interface ChildStateArray extends Array<MapChildRet> {
	_type: "typescript hack so it matches runtime behavior";
}
type MapChildRet = ChildState | ChildStateArray;

let applyIdent = (child: any, cssIdent?: string, identOverride?: string) => {
	let list: DOMTokenList = child.classList;
	if (list) {
		let arr = [...list];
		if (arr.find((x) => x == CSS_COMPONENT)) return;

		let other = arr.find((x) => x.startsWith(CSS_IDENT));
		if (!other) {
			list.add(identOverride || cssIdent!);
		} else if (identOverride && other !== identOverride) {
			list.remove(other);
			list.add(identOverride);
		}

		child.childNodes.forEach((x: any) =>
			applyIdent(x, cssIdent, identOverride)
		);
	}
};

export let flattenChildRet = (state: MapChildRet, out: Node[] = []): Node[] => {
	if (state instanceof Array) {
		state.forEach((x) => flattenChildRet(x, out));
	} else if (state._type == ChildStateType.Pointer) {
		out.push(state._anchor);
		flattenChildRet(state._inner, out);
	} else {
		out.push(state._node);
	}
	return out;
};

export let mapChild = (
	child: ComponentChild,
	parent: Node,
	cssIdent?: string,
	identOverride?: string,
	last?: MapChildRet
): MapChildRet => {
	let [, NODE, new_Text, new_Comment] = getDom();

	// keep the inner value's state even when we're dropping the pointer
	while (last?._type == ChildStateType.Pointer) {
		if (child === last._ptr) return last;
		last = last._inner;
	}

	if (child == null || typeof child == "boolean") {
		return last?._type == ChildStateType.Comment
			? last
			: { _type: ChildStateType.Comment, _node: new_Comment() };
	} else if (child instanceof Pointer) {
		let old: Node[],
			current: Node[],
			oldToIndex: Map<Node, number>,
			LIS: number[],
			lisIdx: number,
			anchor: Node,
			val = child.value;
		let ret: PointerChildState = {
			_type: ChildStateType.Pointer,
			_anchor: new_Comment("["),
			_ptr: child,
			_inner: mapChild(val, parent, cssIdent, child._cssIdent, last),
		};

		child.constrain(ret._anchor).listen((v) => {
			if (v === val || !ret._anchor.parentNode) return;
			val = v;

			old = flattenChildRet(ret._inner); // since reused nodes are modified inplace
			ret._inner = mapChild(v, parent, cssIdent, child._cssIdent, ret._inner);

			// pretty sure it's not possible to put a pointer child in not a htmlelement
			if (!getDom()[6]?.(parent as HTMLElement)) {
				current = flattenChildRet(ret._inner);
				oldToIndex = MAP(old.map((x, i) => [x, i]));
				// undefined -> NaN (falsy), 0 -> 1 (truthy), n -> n+1 (truthy)
				LIS = findLIS(
					current.map((x) => oldToIndex.get(x)!).filter((x) => x + 1)
				);
				lisIdx = 0;

				anchor = ret._anchor;
				current.forEach((child) => {
					// LIS is a subsequence of the reused indices in current order, so one
					// cursor picks out the stay-put nodes without a second lookup table.
					// the +1 makes an absent index NaN, which never matches a spent LIS
					if (oldToIndex.get(child)! + 1 === LIS[lisIdx] + 1) lisIdx++;
					else parent.insertBefore(child, anchor.nextSibling);
					oldToIndex.delete(child);
					anchor = child;
				});

				// whatever is left unclaimed is exactly the dropped set
				oldToIndex.forEach(
					(_, x) => x.parentNode === parent && parent.removeChild(x)
				);
			}
		});

		return ret;
	} else if (child instanceof (NODE as typeof globalThis.Node)) {
		// an identical node is already stamped; skipping the walk is the whole
		// point of holding onto the state
		if (last?._type == ChildStateType.Node && last._node === child) return last;

		if (cssIdent || identOverride) applyIdent(child, cssIdent, identOverride);

		if (last?._type == ChildStateType.Node) {
			last._node = child;
			return last;
		}
		return { _type: ChildStateType.Node, _node: child };
	} else if (child instanceof Array) {
		if (!(last instanceof Array)) last = [last] as any as ChildStateArray;
		return child.map((x, i) =>
			mapChild(x, parent, cssIdent, identOverride, (last as ChildStateArray)[i])
		) as ChildStateArray;
	} else {
		if (last?._type == ChildStateType.Text) {
			if (last._value !== child) (last._node as any).data = last._value = child;
			return last;
		}
		return {
			_type: ChildStateType.Text,
			_value: child,
			_node: new_Text(child as any),
		};
	}
};
