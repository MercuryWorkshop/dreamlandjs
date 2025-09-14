import { css, type Component } from "dreamland/core";
import { Link } from "dreamland/router";

// @ts-expect-error
import Main from "./main.mdx";
import { ExternalLink } from "../utils";

import logo from "../logo/uwu.svg";

export let MainPage: Component = function () {
	return (
		<div>
			<div class="hero">
				<img src={logo} alt="dreamland.js" />
				<div>
					<div class="slogan">A utilitarian web framework</div>
					<div>
						by{" "}
						<ExternalLink href="https://mercurywork.shop/">
							Mercury Workshop
						</ExternalLink>
					</div>
				</div>
				<div class="links">
					<ExternalLink href="https://npmjs.com/package/dreamland">
						npm
					</ExternalLink>
					<ExternalLink href="https://github.com/MercuryWorkshop/dreamlandjs">
						GitHub
					</ExternalLink>
					<ExternalLink href="https://discord.gg/GKKF3CmHPA">
						Discord
					</ExternalLink>
					<Link href="/docs/getting-started">Docs</Link>
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
		min-height: 100%;
		height: 100%;
		display: flex;
	}

	.hero {
		min-width: 21rem;
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
		font-size: 1.5rem;
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
		overflow-y: auto;

		padding: 0 1rem;

		background: var(--bg-2);
	}

	.content > div {
		max-width: 60rem;
	}

	@media (max-width: 65rem) {
		:scope {
			flex-direction: column;
			height: auto;
			overflow-y: auto;
		}

		.hero {
			flex: 0;
			width: min(100%, 30rem);
			align-self: center;
		}

		.content {
			overflow-y: visible;
		}
	}
`;
