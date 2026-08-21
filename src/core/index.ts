import { defineUse } from "./state";
import "./state";

export { Pointer } from "./state/pointers";
export {
	Stateful,
	createState,
	stateListen,
	stateProxy,
	isStateful,
} from "./state/state";

export { createDelegate, Delegate } from "./delegate";

export { css, CssInit } from "./css";

export {
	ComponentChild,
	Component,
	FC,
	ComponentState,
	ComponentContext,
	ComponentInstance,
	JSX,
} from "./jsx/definitions";
export { h, jsx, Fragment } from "./jsx";
export {
	setDomImpl,
	getDom as domImpl,
	DomImpl,
	DomNodeConstructor,
	DomCssUidGenerator,
	DomIsAdopted,
	DomComponentCallback,
	DomLifecycleState,
	DomLifecycleCallback,
} from "./jsx/dom";

export { NO_CHANGE } from "./consts";

defineUse();
