// Runs a full build as a handful of rollup processes instead of one.
//
// Nearly all of the cost here is @rollup/plugin-typescript's buildStart, which
// creates a fresh TypeScript program per entry -- around 700ms of the 770ms it
// takes to bundle src/ssr, and it is synchronous, so one rollup process can only
// ever pin one core. Sharding across processes is the only way to use the rest.
//
// A process pays that program cost once more than it needs to, though, plus
// loading rollup and bundling this TS config, so shards want to be few and fat:
// one process per group spends more time starting up than bundling.
//
// See WAVES in rollup.config.ts for why the schedule is ordered rather than a
// free-for-all.

import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import process from "node:process";

import { WAVES } from "./rollup.config.ts";

const args = process.argv.slice(2).filter((x) => !x.startsWith("--shards="));
const wanted = Number(
	process.argv.find((x) => x.startsWith("--shards="))?.slice("--shards=".length)
);

// Deliberately not derived from the core count. What limits us is that a rollup
// process amortizes the TypeScript compiler across the entries it builds, so
// splitting finer makes every shard pay that cost again: measured on a 16 core
// box, 3 shards beat 4 (+9%), 5 (+19%) and one process per group (+19%).
const count = Math.max(1, Math.min(wanted || 3, availableParallelism()));

// --config-dev/--config-prod build a single variant, so the split of core across
// the two waves collapses: it just takes the first wave whole, and whichever
// variant is being built emits the declarations the later wave needs
const single = args.some((x) => x === "--config-dev" || x === "--config-prod");
const waves = WAVES.map((wave) => wave.map((u) => ({ ...u })));
if (single) {
	const seen = new Set<string>();
	for (const wave of waves)
		for (const unit of wave) {
			delete unit.variant;
			unit.groups = unit.groups.filter((g) => !seen.has(g));
			unit.groups.forEach((g) => seen.add(g));
		}
}

const run = (groups: string[], variant?: "prod" | "dev") =>
	new Promise<boolean>((resolve) => {
		const child = spawn(
			process.execPath,
			[
				import.meta.dirname + "/node_modules/rollup/dist/bin/rollup",
				"-c",
				`--config-only=${groups.join(",")}`,
				...(variant === "prod" ? ["--config-prod"] : []),
				// nothing downstream reads this variant's declarations, and skipping
				// them lets the compiler skip type checking too
				...(variant === "dev" ? ["--config-dev", "--config-nodefs"] : []),
				...args,
			],
			{ cwd: import.meta.dirname, stdio: ["ignore", "inherit", "inherit"] }
		);
		child.on("exit", (code) => resolve(code === 0));
	});

for (const wave of waves) {
	// a unit pinned to one variant cannot share a process with the rest
	const pinned = wave.filter((u) => u.variant);
	const free = wave.filter((u) => !u.variant && u.groups.length);

	const slots = Math.min(free.length, Math.max(1, count - pinned.length));
	const shards: string[][] = Array.from({ length: slots }, () => []);
	// the first unit is the longest by construction, so it gets a shard of its
	// own and the rest go round robin over what is left
	free.forEach((u, i) =>
		shards[i && slots > 1 ? 1 + ((i - 1) % (slots - 1)) : 0].push(...u.groups)
	);

	const ok = await Promise.all([
		...pinned.map((u) => run(u.groups, u.variant)),
		...shards.filter((s) => s.length).map((s) => run(s)),
	]);
	// a later wave would only rebuild against types the failed one never emitted
	if (ok.includes(false)) process.exit(1);
}
