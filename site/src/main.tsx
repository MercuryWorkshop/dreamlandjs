import { css, type Component } from "dreamland/core";

import logo from "./logo/uwu.svg";

let MainPage: Component = function () {
	return (
		<div id="app">
			<div class="hero">
				<img src={logo} alt="dreamland logo" />
				<div class="slogan">A utilitarian web framework</div>
				<div class="links">
					<a href="https://github.com/MercuryWorkshop/dreamlandjs">GitHub</a>
				</div>
			</div>
			<div class="content">
				<h2>Write components without the overhead</h2>
				<p>
					dreamland has <b>no virtual DOM</b> and is <b>extremely small</b>, at{" "}
					{import.meta.env.VITE_ENV_BUNDLE_SIZE}kb minified (
					{import.meta.env.VITE_ENV_GZIP_SIZE}kb gzipped,{" "}
					{import.meta.env.VITE_ENV_BROTLI_SIZE}kb brotli'd).
				</p>
			</div>
		</div>
	);
};
MainPage.style = css`
	:scope {
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

	.links a {
		font-size: 1.25rem;
		text-decoration: none;
	}

	.content {
		flex: 2;
		min-height: 0;
		overflow-y: scroll;

		background: var(--bg-2);

		padding: 0 1rem;
	}
`;

export default () => <MainPage />;
