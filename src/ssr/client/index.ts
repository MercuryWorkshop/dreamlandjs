import {
	Component,
	ComponentContext,
	DomImpl,
	DREAMLAND,
	getDomImpl,
	jsx,
	setDomImpl,
} from "dreamland/core";
import { SSR_DATA, SSR_ID } from "../common/consts";
import { hydrateState, Json } from "../common/serialize";
import { SsrData, SsrObject } from "../common/types";

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
	let data: SsrData = Json.parse(textarea.value);

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

	let els: [number, HTMLElement][] = [];

	let rootIdx = +ssr.getAttribute(SSR_ID)!;
	let idx = -1;
	let getInternal = (idx: number) => {
		let selector = `[${SSR_ID}="${idx}"]`;
		let ret =
			rootIdx == idx
				? ssr
				: ssr.querySelector<HTMLElement>(selector) ||
					head.querySelector<HTMLElement>(selector);
		if (ret) els.push([idx, ret]);
		return ret;
	};
	let getRelative = () => {
		let info = data.n[++idx];
		if (!info) return;

		let [parent, offset] = info as [number, number];
		return getInternal(parent)?.childNodes?.[offset];
	};
	let hydrateCx = (cx: ComponentContext<any>) => {
		let ssr = data.n[cx?.state?.root?.getAttribute?.(SSR_ID) as any as number];
		if (ssr) {
			hydrateState(data, ssr as SsrObject, cx.state);
		}
	};
	let hydrating = (x: HTMLElement) => x.hasAttribute(SSR_ID);

	for (let [parent, offset, len] of data.t) {
		let text = getInternal(parent)!.childNodes[offset] as Text;
		if (text.length !== len) text.splitText(len);
	}

	let _old = getDomImpl(),
		old = _old();
	let cxs: ComponentContext<Component<any, any>>[] = [];
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
		() => data.i[idx + 1] || old[4](),
		hydrating,
		(init, cx) => {
			if (cx?.state?.root instanceof old[1] && !hydrating(cx.state?.root))
				hydrateCx(cx);
		},
		cxs,
		inits,
		mounts,
	] as const satisfies DomImpl;

	let dl = jsx[DREAMLAND];
	setDomImpl(() => vdom);
	dl.css();
	let root = await component();
	await Promise.all(inits);
	setDomImpl(_old);

	cxs.map((x) => {
		hydrateCx(x);
		mounts.push(x.mount?.());
	});

	await Promise.all(mounts);

	return root;
};
