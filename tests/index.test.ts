import { describe, it, expect } from "bun:test";
import { createSelector, createSpawnEvent, createStore, createSlice } from "..";
import {
	createActor,
	fromPromise,
	DoneActorEvent,
	waitFor,
	createMachine,
	assign,
	SnapshotFrom,
} from "xstate";
import { wait } from "./support";

describe("storexstate", () => {
	it("creates a store and sends an event", async () => {
		const { transition, actions } = createSlice({
			name: "counter",
			initialState: { count: 0 },
			transitions: {
				incrementByOne: (state) => {
					state.count += 1;
				},
				incrementBy: (state, action: { payload: number }) => {
					state.count += action.payload;
				},
			},
		});
		const store = createStore({
			counter: transition,
		});
		const countSelector = createSelector(
			(root: SnapshotFrom<typeof store>) => root.context.slices.counter,
			(counter) => counter.context.count
		);
		const actor = createActor(store);
		actor.start();
		actor.send(actions.incrementByOne());
		let count = countSelector(actor.getSnapshot());
		expect(count).toBe(1);

		actor.send(actions.incrementBy(5));
		count = countSelector(actor.getSnapshot());
		expect(count).toBe(6);
	});

	it("creates and sends spawn event to store", async () => {
		const asyncIncrement = createSpawnEvent<number>(
			"asyncIncrement",
			fromPromise(({ input }) => wait(0).then(() => input))
		);
		const { transition } = createSlice({
			name: "counter",
			initialState: { count: 0, loading: false, error: false },
			transitions: {
				[asyncIncrement.init]: (state) => {
					state.loading = true;
					state.error = false;
				},
				[asyncIncrement.done]: (state, action: DoneActorEvent<number>) => {
					state.count += action.output;
					state.loading = false;
				},
				[asyncIncrement.error]: (state) => {
					state.error = true;
					state.loading = false;
				},
			},
		});
		const store = createStore({
			counter: transition,
		});
		const countSelector = createSelector(
			(root: SnapshotFrom<typeof store>) => root.context.slices.counter,
			(counter) => counter.context
		);
		const actor = createActor(store);
		actor.start();
		actor.send(asyncIncrement(5));
		let snapshot = await waitFor(
			actor,
			(snapshot) => countSelector(snapshot).loading
		);
		let context = countSelector(snapshot);
		expect(context.loading).toBeTrue();
		expect(context.count).toBe(0);
		snapshot = await waitFor(
			actor,
			(snapshot) => !countSelector(snapshot).loading
		);
		context = countSelector(snapshot);
		expect(context.loading).toBeFalse();
		expect(context.count).toBe(5);
	});

	it("uses machine as slice", async () => {
		const slice = createMachine({
			context: {
				count: 0,
			},
			on: {
				increment: {
					actions: assign({
						count: ({ context }) => context.count + 1,
					}),
				},
			},
		});
		const store = createStore({
			counter: slice,
		});
		const countSelector = createSelector(
			(root: SnapshotFrom<typeof store>) => root.context.slices.counter,
			(counter) => counter.context.count
		);
		const actor = createActor(store);
		actor.start();
		actor.send({ type: "increment" });
		let count = countSelector(actor.getSnapshot());
		expect(count).toBe(1);
	});

	it("uses machine for spawn event", async () => {
		const asyncIncrement = createSpawnEvent<number>(
			"asyncIncrement",
			createMachine({
				context: ({ input }) => ({
					input,
				}),
				after: {
					0: {
						target: ".done",
					},
				},
				initial: "init",
				states: {
					init: {},
					done: {
						type: "final",
					},
				},
				// @ts-ignore
				output: ({ context }) => context.input,
			})
		);
		const { transition } = createSlice({
			name: "counter",
			initialState: { count: 0, loading: false, error: false },
			transitions: {
				[asyncIncrement.init]: (state) => {
					state.loading = true;
					state.error = false;
				},
				[asyncIncrement.done]: (state, action: DoneActorEvent<number>) => {
					state.count += action.output;
					state.loading = false;
				},
				[asyncIncrement.error]: (state) => {
					state.error = true;
					state.loading = false;
				},
			},
		});
		const store = createStore({
			counter: transition,
		});
		const countSelector = createSelector(
			(root: SnapshotFrom<typeof store>) => root.context.slices.counter,
			(counter) => counter.context
		);
		const actor = createActor(store);
		actor.start();
		actor.send(asyncIncrement(5));
		let snapshot = await waitFor(
			actor,
			(snapshot) => countSelector(snapshot).loading
		);
		let context = countSelector(snapshot);
		expect(context.loading).toBeTrue();
		expect(context.count).toBe(0);
		snapshot = await waitFor(
			actor,
			(snapshot) => !countSelector(snapshot).loading
		);
		context = countSelector(snapshot);
		expect(context.loading).toBeFalse();
		expect(context.count).toBe(5);
	});
});
