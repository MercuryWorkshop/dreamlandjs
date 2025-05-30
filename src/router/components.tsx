import { Component, h } from "dreamland/core";
import { Router } from ".";

export let Link: Component<
	{
		href: string;
		class?: string;
	},
	{
		root: HTMLAnchorElement;
		children: any;
	}
> = function () {
	this.class = this.class || "";

	return (
		<a
			href={this.href}
			class={use(this.class)}
			on:click={(e: MouseEvent) => {
				e.preventDefault();
				if (!Router._instance) throw new Error("No router exists");
				Router._instance.navigate(this.root.href);
			}}
		>
			{this.children}
		</a>
	);
};
