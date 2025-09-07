import { render } from "dreamland/ssr/server";
import App from "./main";

export { router } from "dreamland/router";
export default (path: string) => render(() => App(path));
