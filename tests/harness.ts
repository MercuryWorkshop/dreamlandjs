import { parentPort } from "node:worker_threads";
import type {
	CollectedTestFile,
	HarnessMessage,
	IndexMessage,
} from "./index.ts";

let rawGC = (() => {
	let gc = global.gc;
	if (!gc) throw new Error("global.gc not found");
	return gc;
})();

function s(obj: any) {
	try {
		return "" + obj;
	} catch {
		return `[failed stringify: ${typeof obj}]`;
	}
}

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

	serialize(): SCheck {
		return { name: this.name, state: this.state, details: this.details };
	}
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
			this.details = `${s(a)} === ${s(b)}`;
			this.pass();
		} else {
			this.details = `${s(a)} !== ${s(b)}`;
			this.fail();
		}
	}

	assertInstance(val: any, cls: any) {
		if (val instanceof cls) {
			this.details = `${s(val)} instanceof ${s(cls)}`;
			this.pass();
		} else {
			this.details = `${s(val)} is not instanceof ${s(cls)}`;
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

let currentFile = "<no file>";
let currentTest: Test | undefined;
let tests: CollectedTest[] = [];

export function test(name: string, fn: TestFunction, variant?: string) {
	tests.push({ file: currentFile, name, fn, variant });
}

export function check(name: string): Check {
	if (!currentTest) throw new Error("run this in a test");

	let check = new Check(name);
	currentTest.checks.push(check);
	return check;
}

export function checkAlive<T extends WeakKey>(name: string, val: T): T {
	if (!currentTest) throw new Error("run this in a test");
	currentTest.checks.push(new GCCheck("GC-alive: " + name, val, false));
	return val;
}
export function checkFreed<T extends WeakKey>(name: string, val: T): T {
	if (!currentTest) throw new Error("run this in a test");
	currentTest.checks.push(new GCCheck("GC-freed: " + name, val, true));
	return val;
}
// @deprecated ambiguous; prefer checkAlive (stays reachable) or checkFreed (collected)
export let checkGC = checkAlive;

interface CollectedTest {
	file: string;
	name: string;
	variant?: string;
	fn: TestFunction;
}
export interface SCollectedTest {
	file: string;
	name: string;
	variant?: string;
}

interface Test {
	file: string;
	name: string;
	variant?: string;
	checks: BaseCheck[];
}
export interface SCheck {
	name: string;
	state: TestResult;
	details?: string;
}

export const TestResult = {
	Passed: "passed",
	GcFailed: "GC-failed",
	Failed: "failed",
	Threw: "threw",
	Invalid: "invalid",
} as const;
export type TestResult = (typeof TestResult)[keyof typeof TestResult];

export function resultToSortNum(result: TestResult): number {
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
	variant?: string;
	result: TestResult;
	checks: BaseCheck[];
	error?: unknown;
}
export interface SFinishedTest {
	file: string;
	name: string;
	variant?: string;
	result: TestResult;
	checks: SCheck[];
	error?: unknown;
}

async function collectTests(
	files: CollectedTestFile[]
): Promise<CollectedTest[]> {
	let collected = [];
	for (let file of files) {
		tests = [];
		currentFile = file.display;
		await import(file.path);
		currentFile = "<no file>";
		collected.push(...tests);
	}
	return collected;
}

async function runTest(testDesc: CollectedTest): Promise<FinishedTest> {
	let test: Test = {
		file: testDesc.file,
		name: testDesc.name,
		variant: testDesc.variant,

		checks: [],
	} satisfies Test;

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

	return {
		file: test.file,
		name: test.name,
		variant: test.variant,
		result,
		checks: test.checks,
		error,
	} satisfies FinishedTest;
}

async function runTests(
	tests: CollectedTest[],
	pre: (test: SCollectedTest) => void,
	post: (test: FinishedTest) => void
): Promise<FinishedTest[]> {
	let results = [];
	for (let test of tests) {
		pre({ file: test.file, name: test.name, variant: test.variant });

		let ret = await runTest(test);

		results.push(ret);
		post(ret);
	}

	return results;
}

let collected: CollectedTest[];

if (parentPort) {
	let port = (data: HarnessMessage) => {
		try {
			parentPort!.postMessage(data);
		} catch (err) {
			console.log(data);
			throw err;
		}
	};
	parentPort.on("message", async (data: IndexMessage) => {
		try {
			if (data.type === "collect") {
				collected = await collectTests(data.files);
				port({
					type: "collected",
					tests: collected.map(({ file, name, variant }) => ({
						file,
						name,
						variant,
					})),
				});
			} else if (data.type === "run") {
				let ret = await runTests(
					collected,
					(test) => port({ type: "pre", test }),
					({ file, name, variant, result, checks, error }) =>
						port({
							type: "post",
							test: {
								file,
								name,
								variant,
								result,
								checks: checks.map((x) => x.serialize()),
								error,
							},
						})
				);
				port({
					type: "done",
					tests: ret.map(({ file, name, variant, result, checks, error }) => ({
						file,
						name,
						variant,
						result,
						checks: checks.map((x) => x.serialize()),
						error,
					})),
				});
			}
		} catch (err) {
			port({ type: "err", err });
		}
	});
}
