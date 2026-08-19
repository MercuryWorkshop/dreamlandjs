import { glob, realpath } from "node:fs/promises";
import { argv, stdout } from "node:process";
import { cpus } from "node:os";
import type { SCollectedTest, SFinishedTest } from "./harness.ts";
import { TestResult, resultToSortNum } from "./harness.ts";
import { Worker } from "node:worker_threads";
import { join as pathJoin } from "node:path";

export type IndexMessage =
	| { type: "collect"; files: CollectedTestFile[] }
	| { type: "run" };

export type HarnessMessage =
	| { type: "collected"; tests: SCollectedTest[] }
	| { type: "pre"; test: SCollectedTest }
	| { type: "post"; test: SFinishedTest }
	| { type: "done"; tests: SFinishedTest[] }
	| { type: "err"; err: any };

export interface TestRunnerCallbacks {
	collected?: (files: SCollectedTest[]) => void;
	pre?: (test: SCollectedTest) => void;
	post?: (test: SFinishedTest) => void;
}

export interface CollectedTestFile {
	display: string;
	path: string;
}

async function collectTests(folders: string[]) {
	if (!folders.length) return [];

	folders = await Promise.all(folders.map((x) => realpath(x)));

	let commonParts = [];
	let sepFolders = folders.map((x) => x.split("/").slice(1));
	while (true) {
		let parts = sepFolders.map((x) => x.shift());
		if (parts.every((x) => x?.length) && parts.every((x) => x === parts[0])) {
			commonParts.push(parts[0]);
		} else {
			break;
		}
	}

	let common = commonParts.join("/") + "/";

	let testList: CollectedTestFile[] = [];
	for (let folder of folders) {
		for await (let entry of glob(
			["js", "ts"].map((x) => folder + "/**/*." + x)
		)) {
			let displayEntry = entry.replace(common, "").slice(1);

			testList.push({ display: displayEntry, path: entry });
		}
	}

	return testList;
}

export async function runTests(
	folders: string[],
	callbacks?: TestRunnerCallbacks
): Promise<SFinishedTest[]> {
	let tests = await collectTests(folders);

	let buckets = Array.from(
		Array(cpus().length),
		() => [] as CollectedTestFile[]
	);

	for (let i = 0; tests.length; i = (i + 1) % buckets.length) {
		buckets[i].push(tests.shift()!);
	}

	let collectedThreads: SCollectedTest[][] = [];
	let collectedRes: (data: SCollectedTest[]) => void;
	let collectedRej: (err: any) => void;
	let collected: Promise<SCollectedTest[]> = new Promise((r, rej) => {
		collectedRes = r;
		collectedRej = rej;
	});

	let doneThreads: SFinishedTest[][] = [];
	let doneRes: (data: SFinishedTest[]) => void;
	let doneRej: (err: any) => void;
	let done: Promise<SFinishedTest[]> = new Promise((r, rej) => {
		doneRes = r;
		doneRej = rej;
	});

	let handler = (data: HarnessMessage) => {
		if (data.type === "collected") {
			collectedThreads.push(data.tests);
			if (collectedThreads.length === buckets.length) {
				collectedRes(collectedThreads.flat());
			}
		} else if (data.type === "pre") {
			callbacks?.pre?.(data.test);
		} else if (data.type === "post") {
			callbacks?.post?.(data.test);
		} else if (data.type === "done") {
			doneThreads.push(data.tests);
			if (doneThreads.length === buckets.length) {
				doneRes(doneThreads.flat());
			}
		} else if (data.type === "err") {
			doneRej(data.err);
			collectedRej(data.err);
		}
	};

	let workers = buckets.map((bucket) => {
		let worker = new Worker(pathJoin(import.meta.dirname, "harness.ts"));
		worker.on("message", handler);
		worker.postMessage({
			type: "collect",
			files: bucket,
		} satisfies IndexMessage);

		return worker;
	});

	callbacks?.collected?.(await collected);

	workers.forEach((x) => x.postMessage({ type: "run" } satisfies IndexMessage));

	let ret = await done;

	workers.forEach((x) => x.terminate());

	return ret;
}

let folders = argv.slice(2);
if (!folders.length) folders.push(".");

let running: Set<string> = new Set();
let testDesc = (file: string, name: string, variant?: string) =>
	`${file}/${name} ${variant ? `(${variant})` : ""}`;
let runningDesc = () =>
	`\x1b[1m\x1b[38;5;165mRunning ${running.size} tests\x1b[0m`;
let ifTTY = (...args: any[]) => {
	if (stdout.isTTY) {
		(stdout.write as any)(...args);
	}
};

let tests = await runTests(folders, {
	collected(files) {
		stdout.write(`Collected ${files.length} tests\n\n`);
	},
	pre({ file, name, variant }) {
		running.add(testDesc(file, name, variant));
		ifTTY(`\x1b[2K\r${runningDesc()}`);
	},
	post({ file, name, variant, result, error, checks }) {
		running.delete(testDesc(file, name, variant));
		ifTTY("\x1b[2K\r");
		stdout.write(
			`Ran test ${testDesc(file, name, variant)}... ${result.toUpperCase()}\n`
		);

		let failed = checks.filter((x) => x.state !== TestResult.Passed);
		if (failed.length) {
			stdout.write("\tFailed checks:\n");
			for (let check of failed) {
				let details = check.details ? ` (${check.details})` : "";
				stdout.write(
					`\t\t${check.name}...${check.state.toUpperCase()}${details}\n`
				);
			}
		}
		if (result === TestResult.Threw) {
			stdout.write(`\tThrown error: ${error}\n`);
			if (error instanceof Error) {
				for (let line of error.stack!.split("\n").slice(1)) {
					stdout.write(`\t\t${line}\n`);
				}
			}
		}

		ifTTY(runningDesc());
	},
});

let map = tests.reduce((acc, x) => {
	let arr = acc.get(x.result);
	if (arr) arr.push(x);
	else acc.set(x.result, [x]);
	return acc;
}, new Map<TestResult, SFinishedTest[]>());
let results = [...map.entries()]
	.sort(([a], [b]) => resultToSortNum(a) - resultToSortNum(b))
	.map(([a, b]) => `${b.length} ${a}`)
	.join(" ");

ifTTY("\x1b[2K\r");
stdout.write(`Results: ${results}\n`);
let invalid = map.get(TestResult.Invalid);
if (invalid) {
	stdout.write(
		`Please fix these tests: ${invalid.map((x) => `${x.file}/${x.name}`).join(" ")}\n`
	);
}
