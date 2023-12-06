# storexstate

small global state management library based on xstate and inspired by @reduxjs/toolkit

```
npm install storexstate
```

# Usage

### Setting up your store

```typescript
import {
	createSpawnEvent,
	createSlice,
	createStore,
	createSelector,
} from "storexstate";

// create spawn events if you need async logic
const asyncIncrement = createSpawnEvent<number>(
	"asyncIncrement",
	fromPromise(({ input }) => wait(0).then(() => input))
);

// build slices
const counterSlice = createSlice({
	name: "counter",
	initialState: { count: 0, loading: false, error: false },
	transitions: {
		incrementByOne: (state) => {
			state.count += 1;
		},
		incrementBy: (state, action: { payload: number }) => {
			state.count += action.payload;
		},
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
// add them slices to your store
const store = createStore({
	counter: counterSlice.transition,
});

// create selectors
const countSelector = createSelector(
	(root: SnapshotFrom<typeof store>) => root.context.slices.counter, // select slice
	(counter) => counter.context.count // select anything from slice
);
```

### Vanilla usage

```typescript
import { createActor } from "xstate";

const actor = createActor(store);
actor.start();
actor.send(counterSlice.actions.incrementByOne());
actor.send(counterSlice.actions.incrementBy(1));
actor.send(asyncIncrement(1));

const count = countSelector(actor.getSnapshot());
```

### With React

```tsx
import { StoreProvider, useDispatch, useReselector } from "storexstate/react";

function App() {
	return (
		<StoreProvider store={store}>
			<Counter />
		</StoreProvider>
	);
}

function Counter() {
	const dispatch = useDispatch();
	const count = useReselector(countSelector);
	return (
		<button onClick={() => dispatch(counterSlice.actions.increment())}>
			{count}
		</button>
	);
}
```

### Using createMachine instead of createSlice

```typescript
import { createMachine } from "xstate";
// any actor logic that can receive events
const counter = createMachine({
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
	counter,
});
```

### Using createMachine for spawn events

```typescript
import { createMachine } from "xstate";

const asyncIncrement = createSpawnEvent<number>(
	"asyncIncrement",
	// any actor logic with input and output
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
		output: ({ context }) => context.input,
	})
);
```
