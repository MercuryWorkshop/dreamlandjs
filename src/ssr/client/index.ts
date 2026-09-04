import {
	DomImpl,
	domImpl,
	DomLifecycleState,
	jsx,
	setDomImpl,
} from "dreamland/core";
import { SSR_DATA, SSR_ID } from "../common/consts";
import { SsrData } from "../common/types";
import { getStateApplier, SerializedState } from "../common/serialize";

// single function for all hydration mismatch warnings, easy to breakpoint
let mismatch: (msg: string) => void;
let isPruned: (idx: number) => boolean;
dev: {
	mismatch = (msg) => {
		console.warn("[dreamland.js] Hydration mismatch: " + msg);
	};
	isPruned = () => false;
}

export let hydrate = async (
	component: () => any,
	ssr: HTMLElement,
	head: HTMLElement,
	dataEl: HTMLElement
) => {
	dev: {
		if (dataEl.getAttribute(SSR_DATA) !== ":3") throw "invalid ssr root";
	}
	// decode entities
	let textarea = jsx("textarea", {}) as HTMLTextAreaElement;
	textarea.innerHTML = dataEl.innerText;
	let data: SsrData = JSON.parse(textarea.value);

	dev: {
		if (data.p) {
			let ranges = data.p;
			isPruned = (idx) => {
				let lo = 0,
					hi = ranges.length - 1;
				while (lo <= hi) {
					let mid = (lo + hi) >> 1;
					let r = ranges[mid];
					let start = typeof r === "number" ? r : r[0];
					let end = typeof r === "number" ? r : r[1];
					if (idx < start) hi = mid - 1;
					else if (idx > end) lo = mid + 1;
					else return true;
				}
				return false;
			};
		}
	}

	let applyState = getStateApplier(data.k, data.v, data.r);

	let rootIdx = +ssr.getAttribute(SSR_ID)!;
	let idx = -1;
	let getInternal = (idx: number) => {
		let selector = `[${SSR_ID}="${idx}"]`;
		let ret =
			rootIdx == idx
				? ssr
				: ssr.querySelector<HTMLElement>(selector) ||
					head.querySelector<HTMLElement>(selector);
		return ret;
	};
	let adopted = (x: HTMLElement) => x.hasAttribute(SSR_ID);

	for (let [parent, offset, len] of data.t) {
		let text = getInternal(parent)!.childNodes[offset] as Text;
		if (text.length !== len) text.splitText(len);
	}

	// child offsets were recorded against the server's finished tree, but
	// hydration mutates as it walks -- a pruned placeholder gets inserted into an
	// already-adopted parent, shifting every sibling after it -- so resolve them
	// all now, while the dom still matches what the server sent
	let relative: Record<number, Node | undefined> = {};
	for (let id in data.n) {
		// text/comment is [parent, offset]; state is an array of arrays
		let info = data.n[id as any as number] as [number, number];
		if (typeof info[0] == "number")
			relative[id as any as number] = getInternal(info[0])?.childNodes?.[
				info[1]
			];
	}
	let getRelative = () => relative[++idx];

	let _old = domImpl,
		old = _old();
	let inits: (Promise<any> | any)[] = [];
	let mounts: typeof inits = [];
	let vdom = [
		{
			createElement: (x: any) => {
				let el = getInternal(++idx);
				dev: {
					if (el && el.tagName.toLowerCase() !== x.toLowerCase())
						mismatch(
							`expected <${x}> but server rendered <${el.tagName.toLowerCase()}> (${SSR_ID}=${idx})`
						);
					if (!el && !isPruned(idx))
						mismatch(
							`could not find server-rendered element for <${x}> (${SSR_ID}=${idx})`
						);
				}
				return el || old[0].createElement(x);
			},
			createElementNS: (x: any, y: any) => {
				let el = getInternal(++idx);
				dev: {
					if (el && el.tagName.toLowerCase() !== y.toLowerCase())
						mismatch(
							`expected <${y}> (ns: ${x}) but server rendered <${el.tagName.toLowerCase()}> (${SSR_ID}=${idx})`
						);
					if (!el && !isPruned(idx))
						mismatch(
							`could not find server-rendered element for <${y}> (ns: ${x}) (${SSR_ID}=${idx})`
						);
				}
				return el || old[0].createElementNS(x, y);
			},
			head: old[0].head,
		},
		old[1],
		(x: any) => {
			let node = getRelative();
			dev: {
				if (node && node.nodeType !== 3)
					mismatch(
						`expected text node but found node of type ${node.nodeType} (${SSR_ID}=${idx})`
					);
				if (
					node &&
					node.nodeType === 3 &&
					x != null &&
					"" + x !== node.textContent
				)
					mismatch(
						`text content differs - expected "${x}" but server rendered "${node.textContent}" (${SSR_ID}=${idx})`
					);
				if (!node && !isPruned(idx))
					mismatch(
						`could not find server-rendered text node for "${x}" (${SSR_ID}=${idx})`
					);
			}
			return node || old[2](x);
		},
		(x: any) => {
			let node = getRelative();
			dev: {
				if (node && node.nodeType !== 8)
					mismatch(
						`expected comment node but found node of type ${node.nodeType} (${SSR_ID}=${idx})`
					);
				if (!node && !isPruned(idx))
					mismatch(
						`could not find server-rendered comment node (${SSR_ID}=${idx})`
					);
			}
			return node || old[3](x);
		},
		(init, style) => style.getAttribute(SSR_DATA) || old[4](init, style),
		adopted,
		(stage, _cx, res) => {
			if (stage <= DomLifecycleState.Init) inits.push(res);
			else mounts.push(res);
		},
		(_init, state, cx) => {
			if (cx) {
				let ssr = data.n[state.root?.getAttribute?.(SSR_ID) as any as number];
				if (ssr) {
					applyState(state, ssr as SerializedState);
					cx.load = undefined;
				}
			}
		},
	] as const satisfies DomImpl;

	setDomImpl(() => vdom);
	let root = await component();
	while (inits.length) {
		await Promise.all(inits.splice(0));
	}
	setDomImpl(_old);

	await Promise.all(mounts);

	return root;
};
