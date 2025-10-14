import { css, type Component, type ComponentChild } from "dreamland/core";

export let Columns: Component<{ reverse: boolean; children?: ComponentChild }> =
	function (cx) {
		return <div class:reverse={this.reverse}>{cx.children}</div>;
	};
Columns.style = css`
	:scope {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	:scope > :global(*) {
		flex: 1;
	}

	@media (max-width: 900px) {
		:scope {
			flex-direction: column;
			align-items: stretch;

			gap: 0;
		}

		.reverse.reverse {
			flex-direction: column-reverse;
		}
	}
`;
