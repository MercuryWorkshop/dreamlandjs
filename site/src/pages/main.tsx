import { css, type FC } from "dreamland/core";
import { Link } from "dreamland/router";

// @ts-expect-error mdx isn't typed
import Main from "./main.mdx";
import { ExternalLink, MdiIcon } from "../utils";

import logo from "../logo/uwu.svg";
import { mdiNpm, mdiGithub } from "@mdi/js";

let discord =
	"M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612";

export function MainPage(this: FC<{}, { "on:routeshown": () => void }>) {
	return (
		<div>
			<div class="hero">
				<img src={logo} alt="dreamland.js" width={252} height={150} />
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
					<Link href="/playground">Playground</Link>
					<Link href="/docs/getting-started">Docs</Link>
				</div>
				<div class="links">
					<ExternalLink href="https://npmjs.com/package/dreamland" label="npm">
						<MdiIcon icon={mdiNpm} viewBox="2 2 20 20" />
					</ExternalLink>
					<ExternalLink
						href="https://github.com/MercuryWorkshop/dreamlandjs"
						label="GitHub"
					>
						<MdiIcon icon={mdiGithub} />
					</ExternalLink>
					<ExternalLink href="https://discord.gg/GKKF3CmHPA" label="Discord">
						<MdiIcon icon={discord} viewBox="0 0 16 16" />
					</ExternalLink>
				</div>
			</div>
			<div class="content">
				<div>
					<Main />
				</div>
			</div>
		</div>
	);
}
MainPage.style = css`
	:scope {
		width: 100%;
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	.hero {
		display: flex;
		flex-direction: column;

		align-items: center;
		justify-content: center;
		text-align: center;

		align-self: center;

		padding: 1rem;
		gap: 1rem;
		width: min(100%, 30rem);
	}
	.hero img {
		width: calc(100% - 2rem);
		height: auto;
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

		display: flex;
		align-items: center;
	}
	:scope .links :global(a > svg) {
		width: 2em;
		height: 2em;
	}

	.content {
		flex: 1;
		padding: 0 1rem 2rem 1rem;
		background: var(--bg-2);
	}

	.content > div {
		max-width: 75rem;
		margin: auto;
	}
`;
