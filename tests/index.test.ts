import { describe, it, expect } from "bun:test";
import {
	StoreSnapshot,
	createSelector,
	createSpawnEvent,
	createStore,
	createSlice,
} from "..";
import {
	createActor,
	fromPromise,
	fromTransition,
	DoneActorEvent,
	waitFor,
} from "xstate";
import { wait } from "./support";
import { stat } from "fs";

interface IncrementEvent {
	type: "increment";
}

describe("xstore", () => {
	it("creates a store and sends an event", async () => {
		const { transition, actions } = createSlice({
			name: 'counter',
			initialState: { count: 0 },
			transitions: {
				increment: (state) => {
					state.count += 1
				}
			}
		})
		const store = createStore({
			counter: transition
		});
		const countSelector = createSelector(
			(root: StoreSnapshot<typeof store>) => root.context.slices.counter,
			(counter) => counter.context.count
		);
		const actor = createActor(store);
		actor.start();
		actor.send(actions.increment());
		const count = countSelector(actor.getSnapshot());
		expect(count).toBe(1);
	});

	it("creates and sends spawn event to store", async () => {
		const asyncIncrement = createSpawnEvent<number>(
			"asyncIncrement",
			fromPromise(({ input }) => wait(0).then(() => input))
		);
		const { transition } = createSlice({
			name: 'counter',
			initialState: { count: 0, loading: false, error: false },
			transitions: {
				[asyncIncrement.init]: (state) => {
					console.log(asyncIncrement.init)
					state.loading = true
					state.error = false
				},
				[asyncIncrement.done]: (state, action: DoneActorEvent<number>) => {
					console.log(asyncIncrement.done)
					state.count += action.output
					state.loading = false
				},
				[asyncIncrement.error]: (state) => {
					console.log(asyncIncrement.error)
					state.error = true
					state.loading = false
				}
			}
		})
		const store = createStore({
			counter: transition
		});
		const countSelector = createSelector(
			(root: StoreSnapshot<typeof store>) => root.context.slices.counter,
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

	it("creates reducer fromTransitions", async () => {
		const slice = createSlice({
			name: "counter",
			initialState: { count: 0 },
			transitions: {
				increment: (state, action: { payload: 1 }) => {
					state.count += action.payload;
				},
				decrement: (state, action: { payload: 2 }) => {
					state.count -= action.payload;
				},
			},
		});
		const store = createStore({
			counter: slice.transition,
		});
		const countSelector = createSelector(
			(root: StoreSnapshot<typeof store>) => root.context.slices.counter,
			(counter) => counter.context.count
		);
		const actor = createActor(store);
		actor.start();
		actor.send(slice.actions.increment(1));
		let count = countSelector(actor.getSnapshot());
		expect(count).toBe(1);
		actor.send(slice.actions.decrement(2));
		count = countSelector(actor.getSnapshot());
		expect(count).toBe(-1);
	});
});
