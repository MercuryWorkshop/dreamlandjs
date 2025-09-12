import { css, type Component, type ComponentChild } from "dreamland/core";

// @ts-expect-error
import Main from "./main.mdx";

import logo from "../logo/uwu.svg";

let Link: Component<{ href: string, children: ComponentChild }> = function(cx) {
	return (
		<a href={this.href} target="_blank">{cx.children}</a>
	)
}

export let MainPage: Component = function() {
	return (
		<div>
			<div class="hero">
				<img src={logo} alt="dreamland logo" />
				<div>
					<div class="slogan">A utilitarian web framework</div>
					<div>by <Link href="https://mercurywork.shop/">Mercury Workshop</Link></div>
				</div>
				<div class="links">
					<Link href="https://npmjs.com/package/dreamland">npm</Link>
					<Link href="https://github.com/MercuryWorkshop/dreamlandjs">GitHub</Link>
					<Link href="https://discord.gg/GKKF3CmHPA">Discord</Link>
				</div>
			</div>
			<div class="content">
				<div>
					<Main />
				</div>
			</div>
		</div>
	);
};
MainPage.style = css`
	:scope {
		width: 100%;
		height: 100%;
		display: flex;
	}

	.hero {
		max-width: 30rem;
		flex: 1;

		display: flex;
		text-align: center;
		gap: 1rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;

		padding: 1rem;
	}
	.hero img {
		margin: 0 1rem;
	}
	.slogan {
		font-size: 1.75rem;
		font-weight: 600;
	}

	.links {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
	}

	.links :global(a) {
		font-size: 1.25rem;
		text-decoration: none;
	}

	.content {
		flex: 2;
		min-height: 0;
		overflow-y: scroll;

		padding: 0 1rem;

		background: var(--bg-2);
	}

	.content > div {
		max-width: 60rem;
	}
`;
