import {
	DLBasePointer,
	Stateful,
} from "../state";
import { DLCSS } from "./css";

export type ComponentChild =
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| ComponentChild[]
	| DLBasePointer<ComponentChild>;

export type ComponentContext<T> = {
	state: Stateful<T>;

	root: HTMLElement;

	css?: DLCSS;

	mount?: () => void;
};

type ProxiedProps<Props> = {
	[Key in keyof Props]: Props[Key] extends DLBasePointer<infer Pointed>
	? Pointed
	: Props[Key];
};
export type Component<Props = {}, Private = {}, Public = {}> = (
	this: Stateful<ProxiedProps<Props> & Private & Public>,
	cx: ComponentContext<ProxiedProps<Props> & Private & Public>
) => HTMLElement;
export type ComponentInstance<T extends Component> =
	T extends Component<infer Props, infer Private, infer Public>
	? DLElement<ProxiedProps<Props> & Private & Public>
	: never;
export type DLElement<T> = HTMLElement & { $: ComponentContext<T> };

/* not finalized yet, maybe later though
 * putting this code up next to the function component broke the build somehow
export class Component {
	html: VNode;

	root: HTMLElement;
	children: ComponentChild[];

	css?: DLCSS;

	// @internal
	_cssIdent: string;

	mount() {}
	constructor() {
		this._cssIdent = "dl-" + this.constructor.name + "-" + genuid();
		return createState(this);
	}
}
*/
