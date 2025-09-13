import type { Component, ComponentChild } from "dreamland/core"

export let ExternalLink: Component<{ href: string, children: ComponentChild }> = function(cx) {
	return (
		<a href={this.href} target="_blank">{cx.children}</a>
	)
}
