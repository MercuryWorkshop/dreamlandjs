import { hydrate } from "dreamland/ssr/client";
import App from "./main";

hydrate(
	App,
	document.querySelector("#app")!,
	document.head,
	document.querySelector("[dlssr-d]")!
);
