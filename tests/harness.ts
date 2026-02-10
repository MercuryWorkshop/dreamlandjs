import { glob, realpath } from "node:fs/promises";
import { argv, stdout } from "node:process";
import { fileURLToPath } from "node:url";

let induceGC = (() => {
	let induceGC = global.gc;
	if (!induceGC) throw new Error("global.gc not found");
	return induceGC;
})();

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
			this.fail();
			this.details = `call count ${this.calls} != ${this._targetCalls}`;
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
	constructor(name: string, obj: WeakKey) {
		super(name);
		this.ref = new WeakRef(obj);
	}

	// @internal
	_checkInvariants(): void {}

	get state(): TestResult {
		if (this.ref.deref()) return TestResult.Passed;
		else return TestResult.GcFailed;
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

export enum TestResult {
	Passed = "passed",
	GcFailed = "GC-failed",
	Failed = "failed",
	Threw = "threw",
	Invalid = "invalid",
}

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

export function checkGC<T extends WeakKey>(name: string, val: T): T {
	if (!currentTest) throw new Error("run this in a test");
	let check = new GCCheck("GC: " + name, val);
	currentTest.checks.push(check);
	return val;
}

async function collectTests(folders: string[]) {
	folders = await Promise.all(folders.map((x) => realpath(x)));

	let testList: CollectedTest[] = [];
	tests = testList;
	for (let folder of folders) {
		for await (let entry of glob(
			["js", "ts"].map((x) => folder + "/**/*." + x)
		)) {
			let displayEntry = entry.replace(folder, "").slice(1);

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

		induceGC();

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
