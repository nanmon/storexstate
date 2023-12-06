import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreProvider, useDispatch, useReselector } from "../react";
import { createSelector, createSlice, createStore } from "..";
import { SnapshotFrom } from "xstate";

interface HTMLElement {
	innerHTML: string;
}

const counterSlice = createSlice({
	name: "counter",
	initialState: { count: 0 },
	transitions: {
		increment: (state) => {
			state.count += 1;
		},
	},
});
const store = createStore({
	counter: counterSlice.transition,
});

const countSelector = createSelector(
	(root: SnapshotFrom<typeof store>) => root.context.slices.counter,
	(counter) => counter.context.count
);

function Test() {
	const dispatch = useDispatch();
	const count = useReselector(countSelector);
	return (
		<button onClick={() => dispatch(counterSlice.actions.increment())}>
			{count}
		</button>
	);
}

describe("storexstate/react", () => {
	const TestApp = () => (
		<StoreProvider store={store}>
			<Test />
		</StoreProvider>
	);

	it("increments the counter", async () => {
		render(<TestApp />);
		const button = screen.getByRole("button");
		expect((button as HTMLElement).innerHTML).toBe("0");
		await userEvent.click(button);
		expect((button as HTMLElement).innerHTML).toBe("1");
	});
});
