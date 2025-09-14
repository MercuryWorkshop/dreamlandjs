import { css, type Component } from "dreamland/core";
import { Link } from "dreamland/router";

import { docs, groups, type DocGroup, type DocPage } from "../docs";
import normal from "../logo/normal.svg";
import { setTitle } from "../main";

export let DocsLayout: Component<
	{ outlet?: HTMLElement },
	{ doc?: DocPage },
	{ "on:routeshown"?: (path: string) => void }
> = function () {
	this["on:routeshown"] = (path: string) => {
		let page = docs.find((x) => path.replace("/docs/", "") === x.path);
		this.doc = page;
		setTitle(page?.title);
	};

	let render = (x: DocGroup | DocPage) => {
		if (x.type === "page") {
			return (
				<Link
					href={"/docs/" + x.path}
					class={use(this.doc).map((y) => (x.path === y?.path ? "active" : ""))}
				>
					{x.title}
				</Link>
			);
		} else {
			return (
				<div class="group">
					<div>{x.title}</div>
					{x.children.map(render)}
				</div>
			);
		}
	};

	return (
		<div>
			<div class="sidebar">
				<Link href="/">
					<div class="hero">
						<img src={normal} alt="dreamland logo" />
						<span>dreamland</span>
					</div>
				</Link>
				{groups.map(render)}
			</div>
			<div class="content">
				<div>
					{use(this.doc).andThen((x: DocPage) => (
						<h1>{x.title}</h1>
					))}
					{use(this.outlet)}
				</div>
			</div>
		</div>
	);
};
DocsLayout.style = css`
	:scope {
		width: 100%;
		min-height: 100%;
		height: 100%;
		display: flex;
	}

	.sidebar {
		flex: 0 0 15rem;
		position: relative;

		width: calc(100% - 2rem);
		height: calc(100% - 2.5rem);

		display: flex;
		gap: 1rem;
		flex-direction: column;

		padding: 1.5rem 1rem 1rem 1rem;
	}
	.sidebar :global(a) {
		text-decoration: none;
		color: var(--text);
	}
	.sidebar :global(a):hover:not(:has(.hero)) {
		text-decoration: underline;
	}

	.hero {
		font-size: 1.75rem;

		display: flex;
		gap: 0.5rem;
		align-items: center;

		font-weight: bold;
	}
	.hero img {
		height: 1.5em;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.group :global(*:first-child) {
		font-weight: bold;
		font-size: 1.3em;
	}
	.group :global(*:not(:first-child)) {
		margin-left: 1rem;
	}

	.sidebar :global(.active) {
		font-weight: bold;

		position: relative;
		z-index: 1;
	}

	.sidebar :global(.active)::after {
		content: "";

		background: var(--bg-2);
		border: 1px solid var(--border-2);
		border-top: 0px;
		border-right: 0px;

		transform: translate(50%, -50%) rotate(45deg);

		position: absolute;
		top: 50%;
		right: -1rem;
		width: 1rem;
		height: 1rem;
	}
	.sidebar::after {
		content: "";
		background: var(--border-2);

		position: absolute;
		width: 1px;
		height: 100%;
		top: 0;
		right: 0;
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;

		padding: 0 1rem;

		background: var(--bg-2);
	}
	.content > div {
		max-width: 60rem;
	}
`;
