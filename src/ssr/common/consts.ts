export let DL_INTERNAL_TYPE = "__dreamland_internal_type" as const;
export let DL_INTERNAL_TYPE_PTR = "ptr" as const;
export let DL_INTERNAL_TYPE_MAP = "map" as const;
export let DL_INTERNAL_TYPE_SET = "set" as const;

let SSR = "dl-ssr-" as const;
export let DL_SSR_STATE_ATTR = SSR + "state";
export let DL_SSR_COMPONENT_STATE = SSR + "component-state";
export let DL_SSR_ID = SSR + "id";
export let DL_SSR_CSS_ID = SSR + "css-id";
