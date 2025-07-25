/* simple svelte/motion spring port.

Copyright (c) 2016-2025 [Svelte Contributors](https://github.com/sveltejs/svelte/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

import { createState, Stateful } from "dreamland/core";

interface TickContext {
	_inv_mass: number;
	_dt: number;
	_settled: boolean;

	_stiffness: number;
	_damping: number;
	_precision: number;
}

let is_date = (val: any): val is Date => val instanceof Date;

let tick_spring = <T>(
	ctx: TickContext,
	last_value: T,
	current_value: T,
	target_value: T
) => {
	if (typeof current_value === "number" || is_date(current_value)) {
		// @ts-ignore
		let delta = target_value - current_value;
		// @ts-ignore
		let velocity = (current_value - last_value) / (ctx._dt || 1 / 60); // guard div by 0
		let spring = ctx._stiffness * delta;
		let damper = ctx._damping * velocity;
		let acceleration = (spring - damper) * ctx._inv_mass;
		let d = (velocity + acceleration) * ctx._dt;
		if (Math.abs(d) < ctx._precision && Math.abs(delta) < ctx._precision) {
			return target_value; // settled
		} else {
			ctx._settled = false; // signal loop to keep ticking
			return is_date(current_value)
				? new Date(current_value.getTime() + d)
				: current_value + d;
		}
	} else if (Array.isArray(current_value)) {
		return current_value.map((_, i) =>
			tick_spring(ctx, last_value[i], current_value[i], target_value[i])
		);
	} else if (typeof current_value === "object") {
		let next_value = {};
		for (let k in current_value) {
			// @ts-ignore
			next_value[k] = tick_spring(
				ctx,
				last_value[k],
				current_value[k],
				target_value[k]
			);
		}
		return next_value;
	} else {
		dev: {
			throw new Error(`Cannot spring ${typeof current_value} values`);
		}
	}
};

export interface SpringOptions {
	stiffness?: number;
	damping?: number;
	precision?: number;
}
export interface SpringState<T> {
	stiffness: number;
	damping: number;
	precision: number;

	target: T;
	current: T;
}
export type Spring<T> = Stateful<SpringState<T>>;

let timeNow = () => performance.now();

export let createSpring = <T>(val: T, opts: SpringOptions = {}): Spring<T> => {
	let state = createState({
		stiffness: opts.stiffness ?? 0.15,
		damping: opts.damping ?? 0.8,
		precision: opts.precision ?? 0.01,

		target: val,
		current: val,
	} satisfies SpringState<T>);

	let settling = false;
	let last_time = 0;
	let last_value = val;
	let _inv_mass = 1;
	let inv_mass_recovery_rate = 0;
	let momentum = 0;

	let update = () => {
		let now = timeNow();

		_inv_mass = Math.min(_inv_mass + inv_mass_recovery_rate, 1);
		let elapsed = Math.min(now - last_time, 1000 / 30);

		let ctx = {
			_inv_mass,
			_settled: true,
			_dt: (elapsed * 60) / 1000,

			_stiffness: state.stiffness,
			_damping: state.damping,
			_precision: state.precision,
		} satisfies TickContext;
		let next = tick_spring(ctx, last_value, state.current, state.target);
		last_value = state.current;
		last_time = now;
		state.current = next;

		if (ctx._settled) settling = false;
		else requestAnimationFrame(update);
	};

	use(state.target).listen((_) => {
		if (!settling) {
			last_time = timeNow();
			inv_mass_recovery_rate = 1000 / (momentum * 60);
			settling = true;
			requestAnimationFrame(update);
		}
	});

	return state;
};
