import { Component, h } from "dreamland/core";
import { Router } from ".";

export class Link extends Component {
	href: string;
	class?: string;

	children: any;

	html = (
		<a
			href={use(this.href)}
			class={use(this.class)}
			on:click={(e: MouseEvent) => {
				e.preventDefault();
				if (!Router._instance) throw new Error("No router exists");
				Router._instance.navigate(this.href);
			}}
		>
			{this.children}
		</a>
	);
}
