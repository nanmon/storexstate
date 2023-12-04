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

interface IncrementEvent {
	type: "increment";
}

describe("xstore", () => {
	it("creates a store and sends an event", async () => {
		const store = createStore({
			counter: fromTransition(
				(state, action: IncrementEvent) => {
					switch (action.type) {
						case "increment":
							return {
								...state,
								count: state.count + 1,
							};
					}
					return state;
				},
				{ count: 0 }
			),
			x: fromTransition((state) => state, {}),
		});
		const countSelector = createSelector(
			(root: StoreSnapshot<typeof store>) => root.context.slices.counter,
			(counter) => counter.context.count
		);
		const actor = createActor(store);
		actor.start();
		actor.send({ type: "increment" });
		const count = countSelector(actor.getSnapshot());
		expect(count).toBe(1);
	});

	it("creates and sends spawn event to store", async () => {
		const asyncIncrement = createSpawnEvent<number>(
			"asyncIncrement",
			fromPromise(({ input }) => wait(0).then(() => input))
		);
		const store = createStore({
			counter: fromTransition(
				(state, action: DoneActorEvent<number>) => {
					switch (action.type) {
						case asyncIncrement.init:
							return {
								...state,
								loading: true,
								error: false,
							};
						case asyncIncrement.done:
							return {
								...state,
								count: state.count + action.output,
								loading: false,
							};
						case asyncIncrement.error:
							return {
								...state,
								error: true,
								loading: false,
							};
					}
					return state;
				},
				{ count: 0, loading: false, error: false }
			),
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
