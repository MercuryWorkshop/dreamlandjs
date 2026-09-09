import { MAP } from "../consts";
import { CSS_COMPONENT, CSS_IDENT } from "../css";
import { Pointer } from "../state/pointers";
import { findLIS } from "../utils";
import { ComponentChild } from "./definitions";
import {
	DomCommentNode,
	DomElement,
	DomNode,
	DomTextNode,
	getDom,
} from "./dom";

const enum ChildStateType {
	Text = 1,
	Comment = 2,
	Node = 3,
	Pointer = 4,
}

// Comment and Node have _value to reduce object shapes
type ChildState =
	| { _type: ChildStateType.Text; _node: DomTextNode; _value: string | number }
	| { _type: ChildStateType.Comment; _node: DomCommentNode; _value: number }
	| { _type: ChildStateType.Node; _node: DomNode; _value: number }
	| {
			_type: ChildStateType.Pointer;
			_anchor: DomCommentNode;
			_inner: MapChildRet;
			_ptr: Pointer<ComponentChild>;
	  };

type PointerChildState = ChildState & { _type: ChildStateType.Pointer };

interface ChildStateArray<T> extends Array<T> {
	_type?: never;
}
type MapChildRet = ChildState | ChildStateArray<MapChildRet>;
type OptionalMapChildRet =
	| ChildState
	| ChildStateArray<OptionalMapChildRet>
	| undefined;

let applyIdent = (child: DomNode, cssIdent: string) => {
	let arr: string[] = (child as DomElement).getAttributeNames?.();
	// walk until we reach a component boundary
	if (arr && !arr.includes(CSS_COMPONENT)) {
		// paint any unowned nodes
		if (!arr.some((x) => x.startsWith(CSS_IDENT)))
			(child as DomElement).setAttribute(cssIdent, "");

		child.childNodes.forEach((x) => applyIdent(x, cssIdent));
	}
};

export let flattenChildRet = (
	state: MapChildRet,
	out: DomNode[] = []
): DomNode[] => {
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
	parent: DomNode,
	cssIdent?: string,
	last?: OptionalMapChildRet
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
		let ident = child._cx?.id || cssIdent,
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

			let old: DomNode[] = flattenChildRet(ret._inner); // since reused nodes are modified inplace
			let current: DomNode[] = flattenChildRet(
				(ret._inner = mapChild(v, parent, ident, ret._inner))
			);
			let oldToIndex: Map<DomNode, number> = MAP(old.map((x, i) => [x, i]));
			let LIS: number[] = findLIS(
				current.map((x) => oldToIndex.get(x)!).filter((x) => x + 1)
			);
			let lisIdx: number = 0;
			let anchor: DomNode = ret._anchor;

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
		// a local, not a reassignment of `last`: control-flow narrowing on a
		// parameter does not survive into the closure below
		let lastArr = last instanceof Array ? last : [last];
		return child.map((x, i) => mapChild(x, parent, cssIdent, lastArr[i]));
	} else {
		if (last?._type == ChildStateType.Text) {
			if (last._value !== child)
				last._node.data = (last._value = child) as string;
			return last;
		}
		return {
			_type: ChildStateType.Text,
			_node: new_Text(child),
			_value: child,
		};
	}
};
