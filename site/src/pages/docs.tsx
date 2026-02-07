import { css, type FC } from "dreamland/core";
import { Link, RouterState } from "dreamland/router";

import { docs, groups, type DocGroup, type DocPage } from "../docs";
import { Hero, MdiIcon } from "../utils";
import { mdiMenu } from "@mdi/js";

function Sidebar(this: FC<{ doc?: DocPage; menu: boolean }>) {
	let render = (x: DocGroup | DocPage) => {
		if (x.type === "page") {
			return (
				<Link
					href={"/docs/" + x.path}
					on:click={() => (this.menu = false)}
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
			<Link href="/">
				<Hero version={true} />
			</Link>
			{groups.map(render)}
		</div>
	);
}
Sidebar.style = css`
	:scope {
		width: 100%;

		position: relative;

		display: flex;
		gap: 1rem;
		flex-direction: column;

		padding: 1.5rem 1rem 1rem 1rem;

		min-height: max-content;
		height: 100%;

		background: var(--bg-1);
	}
	:scope :global(:is(a, a:visited)) {
		text-decoration: none;
		color: var(--text);
	}
	:scope :global(a):hover {
		text-decoration: underline;
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

	:scope :global(.active) {
		font-weight: bold;

		position: relative;
		z-index: 1;
	}

	:scope :global(.active)::after {
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
	:scope::after {
		content: "";
		background: var(--border-2);

		position: absolute;
		width: 1px;
		height: 100%;
		top: 0;
		right: 0;
	}
`;

export function DocsLayout(
	this: FC<
		{ routerState: RouterState },
		{
			doc?: DocPage;
			menu: boolean;
			jsbroken: boolean;
		}
	>
) {
	this.menu = false;
	this.jsbroken = true;

	this.cx.mount = () => (this.jsbroken = false);

	use(this.routerState.path).constrain(this).listen((path) => {
		if (!this.routerState.loading) {
			let page = docs.find((x) => path.replace("/docs/", "") === x.path);
			this.doc = page;
		}
	})

	let contentClicked = (e: MouseEvent) => {
		if (this.menu) {
			e.preventDefault();
			this.menu = false;
		}
	};
	let sidebarContainerClicked = (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			e.preventDefault();
			this.menu = false;
		}
	};

	return (
		<div class:jsbroken={use(this.jsbroken)}>
			<div
				class="sidebar"
				class:visible={use(this.menu)}
				on:click={sidebarContainerClicked}
			>
				<Sidebar doc={use(this.doc)} menu={use(this.menu)} />
			</div>
			<div class="content" on:click={contentClicked}>
				<div class="menu">
					<Hero />
					<button
						on:click={(e: MouseEvent) => {
							e.stopPropagation();
							this.menu = !this.menu;
						}}
					>
						<MdiIcon icon={mdiMenu} />
					</button>
				</div>
				<div>
					{use(this.doc).and((x) => (
						<h1>{x.title}</h1>
					))}
					{use(this.routerState.outlet)}
				</div>
			</div>
		</div>
	);
}
DocsLayout.style = css`
	:scope {
		position: relative;

		width: 100%;
		min-height: 100%;
		height: 100%;
		display: flex;

		background: var(--bg-2);
	}

	.sidebar {
		width: 18rem;
		height: 100%;
		overflow: hidden scroll;
	}

	.menu {
		margin: 1.5rem 0;
		display: none;

		gap: 0.5rem;
	}

	.menu button {
		background: var(--bg-3);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 0.25rem;

		font-size: 2rem;

		display: flex;
		align-items: center;
		padding: 0.25rem;

		transition: background 0.1s ease;
		cursor: pointer;
	}
	.menu button:hover,
	.sidebar.visible ~ .content .menu button {
		background: var(--border-2);
	}

	:scope :is(.menu, .sidebar) :global(.hero) {
		font-size: 1.75rem;
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

	@media (max-width: 65rem) {
		.menu {
			display: flex;
			justify-content: space-between;
		}
		.jsbroken .menu button {
			visibility: hidden;
		}

		.sidebar {
			display: none;
		}
		.sidebar.visible {
			display: block;
			position: absolute;

			width: 22rem;
			padding-right: 4rem;
			background: linear-gradient(to right, var(--bg-2) 85%, transparent 100%);
		}
	}
`;
