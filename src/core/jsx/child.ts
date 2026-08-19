import { MAP } from "../consts";
import { CSS_COMPONENT, CSS_IDENT } from "../css";
import { Pointer } from "../state/pointers";
import { findLIS } from "../utils";
import { ComponentChild } from "./definitions";
import { getDom } from "./dom";

const enum ChildStateType {
	Text = 1,
	Comment = 2,
	Node = 3,
	Pointer = 4,
}

// Comment and Node have _value to reduce object shapes
type ChildState =
	| { _type: ChildStateType.Text; _node: Text; _value: string | number }
	| { _type: ChildStateType.Comment; _node: Comment; _value: number }
	| { _type: ChildStateType.Node; _node: Node; _value: number }
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

let applyIdent = (child: any, cssIdent: string) => {
	let arr: string[] = child.getAttributeNames?.();
	// walk until we reach a component boundary
	if (arr && !arr.includes(CSS_COMPONENT)) {
		// paint any unowned nodes
		if (!arr.some((x) => x.startsWith(CSS_IDENT)))
			child.setAttribute(cssIdent, "");

		child.childNodes.forEach((x: any) => applyIdent(x, cssIdent));
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
			: { _type: ChildStateType.Comment, _node: new_Comment(""), _value: 0 };
	} else if (child instanceof Pointer) {
		let old: Node[],
			current: Node[],
			oldToIndex: Map<Node, number>,
			LIS: number[],
			lisIdx: number,
			anchor: Node,
			ident = child._cx?.id || cssIdent,
			val = child.value;
		let ret: PointerChildState = {
			_type: ChildStateType.Pointer,
			_anchor: new_Comment("["),
			_ptr: child,
			_inner: mapChild(val, parent, ident, last),
		};

		child.constrain(ret._anchor).listen((v) => {
			if (v === val || !ret._anchor.parentNode) return;
			val = v;

			old = flattenChildRet(ret._inner); // since reused nodes are modified inplace
			ret._inner = mapChild(v, parent, ident, ret._inner);

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
		});

		return ret;
	} else if (child instanceof (NODE as typeof globalThis.Node)) {
		// an identical node is already stamped; skipping the walk is the whole
		// point of holding onto the state
		if (last?._type == ChildStateType.Node && last._node === child) return last;

		if (cssIdent) applyIdent(child, cssIdent);

		if (last?._type == ChildStateType.Node) {
			last._node = child;
			return last;
		}
		return { _type: ChildStateType.Node, _node: child, _value: 0 };
	} else if (child instanceof Array) {
		if (!(last instanceof Array)) last = [last] as any as ChildStateArray;
		return child.map((x, i) =>
			mapChild(x, parent, cssIdent, (last as ChildStateArray)[i])
		) as ChildStateArray;
	} else {
		if (last?._type == ChildStateType.Text) {
			if (last._value !== child) (last._node as any).data = last._value = child;
			return last;
		}
		return {
			_type: ChildStateType.Text,
			_node: new_Text(child as any),
			_value: child,
		};
	}
};
