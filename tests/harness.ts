import { glob, realpath } from "node:fs/promises";
import { argv, stdout } from "node:process";
import { fileURLToPath } from "node:url";

let rawGC = (() => {
	let gc = global.gc;
	if (!gc) throw new Error("global.gc not found");
	return gc;
})();

// A single synchronous global.gc() does NOT reliably reclaim eligible garbage:
// WeakRef-tracked objects frequently survive one pass and are only collected on a
// later cycle (often after the engine processes a macrotask). Looping gc() with a
// macrotask yield between passes makes collection deterministic, which is required
// to assert that pointers/listeners/derived pointers are actually freed.
export async function collectGarbage(cycles: number = 6): Promise<void> {
	for (let i = 0; i < cycles; i++) {
		rawGC();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

export interface TestFunction {
	(): Promise<void> | void;
}

export abstract class BaseCheck {
	name: string;
	abstract state: TestResult;
	details?: string;

	// @internal
	constructor(name: string) {
		this.name = name;
	}

	// @internal
	abstract _checkInvariants(): void;
}

export class Check extends BaseCheck {
	// @internal
	_targetCalls: number = -1;

	state: TestResult;
	calls: number = 0;

	// @internal
	constructor(name: string) {
		super(name);
		this.state = TestResult.Invalid;
	}

	// @internal
	_checkInvariants() {
		if (this._targetCalls !== -1 && this.calls !== this._targetCalls) {
			this.details = `call count ${this.calls} != ${this._targetCalls}`;
			this.fail();
		}
	}

	expectCalls(calls: number): this {
		this._targetCalls = calls;
		return this;
	}

	once(): this {
		this.expectCalls(1);
		return this;
	}

	assertEq<T>(a: T, b: T) {
		if (a === b) {
			this.details = `${a} === ${b}`;
			this.pass();
		} else {
			this.details = `${a} !== ${b}`;
			this.fail();
		}
	}

	private _deepEqual(
		a: unknown,
		b: unknown,
		path: string = ""
	): { equal: boolean; details: string } {
		if (a === b) {
			return { equal: true, details: "" };
		}

		if (a === null || b === null) {
			return { equal: false, details: `${path}: ${a} !== ${b}` };
		}

		if (typeof a !== typeof b) {
			return { equal: false, details: `${path}: ${typeof a} !== ${typeof b}` };
		}

		if (Array.isArray(a) !== Array.isArray(b)) {
			return {
				equal: false,
				details: `${path}: array !== ${Array.isArray(b) ? "array" : "object"}`,
			};
		}

		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) {
				return {
					equal: false,
					details: `${path}: array length ${a.length} !== ${b.length}`,
				};
			}
			for (let i = 0; i < a.length; i++) {
				let result = this._deepEqual(a[i], b[i], `${path}[${i}]`);
				if (!result.equal) return result;
			}
			return { equal: true, details: "" };
		}

		if (typeof a === "object" && typeof b === "object") {
			let aKeys = Object.keys(a as object);
			let bKeys = Object.keys(b as object);
			let allKeys = new Set([...aKeys, ...bKeys]);

			for (let key of allKeys) {
				let aVal = (a as Record<string, unknown>)[key];
				let bVal = (b as Record<string, unknown>)[key];

				if (!(key in a)) {
					return {
						equal: false,
						details: `${path}.${key}: undefined !== ${bVal}`,
					};
				}
				if (!(key in b)) {
					return {
						equal: false,
						details: `${path}.${key}: ${aVal} !== undefined`,
					};
				}

				let result = this._deepEqual(aVal, bVal, `${path}.${key}`);
				if (!result.equal) return result;
			}
			return { equal: true, details: "" };
		}

		return { equal: false, details: `${path}: ${a} !== ${b}` };
	}

	assertDeepEq<T>(a: T, b: T) {
		let result = this._deepEqual(a, b);
		if (result.equal) {
			this.details = `${JSON.stringify(a)} === ${JSON.stringify(b)}`;
			this.pass();
		} else {
			this.details =
				result.details || `${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
			this.fail();
		}
	}

	passed(): boolean {
		return this.state === TestResult.Passed;
	}

	pass() {
		this.calls++;
		this.state = TestResult.Passed;
	}
	fail() {
		this.calls++;
		this.state = TestResult.Failed;
	}
}

export class GCCheck extends BaseCheck {
	ref: WeakRef<WeakKey>;
	// @internal
	_mustFree: boolean;

	state: TestResult = TestResult.Invalid;

	// @internal
	constructor(name: string, obj: WeakKey, mustFree: boolean) {
		super(name);
		this.ref = new WeakRef(obj);
		this._mustFree = mustFree;
	}

	// @internal
	_checkInvariants(): void {
		let alive = !!this.ref.deref();
		if (this._mustFree) {
			// expected to have been collected once its constraint owner was dropped
			if (alive) {
				this.state = TestResult.GcFailed;
				this.details = "still reachable after GC (leak)";
			} else {
				this.state = TestResult.Passed;
			}
		} else {
			// expected to stay alive (reachable from a still-live constraint owner)
			if (alive) {
				this.state = TestResult.Passed;
			} else {
				this.state = TestResult.GcFailed;
				this.details = "collected prematurely";
			}
		}
	}
}

interface CollectedTest {
	file: string;
	name: string;
	fn: TestFunction;
}

interface Test {
	file: string;
	name: string;
	checks: BaseCheck[];
}

export const TestResult = {
	Passed: "passed",
	GcFailed: "GC-failed",
	Failed: "failed",
	Threw: "threw",
	Invalid: "invalid",
} as const;
export type TestResult = (typeof TestResult)[keyof typeof TestResult];

function resultToSortNum(result: TestResult): number {
	switch (result) {
		case TestResult.Passed:
			return 0;
		case TestResult.GcFailed:
			return 1;
		case TestResult.Failed:
			return 2;
		case TestResult.Threw:
			return 3;
		case TestResult.Invalid:
			return 4;
	}
}

export interface FinishedTest {
	file: string;
	name: string;
	result: TestResult;
	checks: BaseCheck[];
	error?: unknown;
}

export interface TestRunnerCallbacks {
	collected?: (files: { file: string; name: string }[]) => void;
	pre?: (file: string, name: string) => void;
	post?: (test: FinishedTest) => void;
}

let currentFile = "<no file>";
let currentTest: Test | undefined;
let tests: CollectedTest[] = [];

export function test(name: string, fn: TestFunction) {
	tests.push({ file: currentFile, name, fn });
}

export function check(name: string): Check {
	if (!currentTest) throw new Error("run this in a test");

	let check = new Check(name);
	currentTest.checks.push(check);
	return check;
}

// asserts `val` is still reachable after the end-of-test GC (i.e. it is correctly
// retained by a constraint owner that is still alive). passes when alive.
export function checkAlive<T extends WeakKey>(name: string, val: T): T {
	if (!currentTest) throw new Error("run this in a test");
	currentTest.checks.push(new GCCheck("GC-alive: " + name, val, false));
	return val;
}
// asserts `val` is collected after the end-of-test GC (i.e. once its constraint
// owner is dropped, nothing keeps it alive). passes when freed, fails (leak) if alive.
export function checkFreed<T extends WeakKey>(name: string, val: T): T {
	if (!currentTest) throw new Error("run this in a test");
	currentTest.checks.push(new GCCheck("GC-freed: " + name, val, true));
	return val;
}
// @deprecated ambiguous; prefer checkAlive (stays reachable) or checkFreed (collected)
export let checkGC = checkAlive;

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

	let testList: CollectedTest[] = [];
	tests = testList;
	for (let folder of folders) {
		for await (let entry of glob(
			["js", "ts"].map((x) => folder + "/**/*." + x)
		)) {
			let displayEntry = entry.replace(common, "").slice(1);

			currentFile = displayEntry;
			await import(entry);
			currentFile = "<no file>";
		}
	}
	tests = [];

	return testList;
}

export async function runTests(
	folders: string[],
	callbacks?: TestRunnerCallbacks
): Promise<FinishedTest[]> {
	let tests = await collectTests(folders);

	callbacks?.collected?.(tests.map((x) => ({ file: x.file, name: x.name })));

	let finished = [];
	for (let testDesc of tests) {
		let test: Test = {
			file: testDesc.file,
			name: testDesc.name,

			checks: [],
		} satisfies Test;

		callbacks?.pre?.(test.file, test.name);

		let result: TestResult | undefined;
		let error: unknown;

		currentTest = test;
		try {
			await testDesc.fn();
		} catch (err) {
			result = TestResult.Threw;
			error = err;
		}
		currentTest = undefined;

		await collectGarbage();

		test.checks.map((x) => x._checkInvariants());

		let checkResult =
			test.checks.toSorted(
				(a, b) => resultToSortNum(b.state) - resultToSortNum(a.state)
			)[0]?.state || TestResult.Invalid;
		if (!result) result = checkResult;

		let finishedTest: FinishedTest = {
			file: test.file,
			name: test.name,
			result,
			checks: test.checks,
			error,
		} satisfies FinishedTest;
		callbacks?.post?.(finishedTest);
		finished.push(finishedTest);
	}
	return finished;
}

if (fileURLToPath(import.meta.url) === argv[1]) {
	(async () => {
		let folders = argv.slice(2);
		if (!folders.length) folders.push(".");

		let tests = await runTests(folders, {
			collected(files) {
				stdout.write(`Collected ${files.length} tests\n\n`);
			},
			pre(file, name) {
				stdout.write(`Running test ${file}/${name}...`);
			},
			post({ result, error, checks }) {
				stdout.write(result.toUpperCase() + "\n");
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
			},
		});

		let map = tests.reduce((acc, x) => {
			let arr = acc.get(x.result);
			if (arr) arr.push(x);
			else acc.set(x.result, [x]);
			return acc;
		}, new Map<TestResult, FinishedTest[]>());
		let results = [...map.entries()]
			.sort(([a], [b]) => resultToSortNum(a) - resultToSortNum(b))
			.map(([a, b]) => `${b.length} ${a}`)
			.join(" ");

		stdout.write(`\nResults: ${results}\n`);
		let invalid = map.get(TestResult.Invalid);
		if (invalid) {
			stdout.write(
				`Please fix these tests: ${invalid.map((x) => `${x.file}/${x.name}`).join(" ")}\n`
			);
		}
	})();
}
