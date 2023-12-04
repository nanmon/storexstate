import {
	ActorLogic,
	ActorRefFrom,
	AnyActorLogic,
	AnyActorRef,
	EventObject,
	SnapshotFrom,
	assign,
	fromTransition,
	setup,
} from "xstate";

const spawnActorTypes = {
	spawn: () => "xstate.store.spawn" as const,
	init: (actorId: string) => `xstate.init.actor.${actorId}`,
	done: (actorId: string) => `xstate.done.actor.${actorId}`,
	error: (actorId: string) => `xstate.error.actor.${actorId}`,
};
type SpawnEventType = ReturnType<typeof spawnActorTypes.spawn>;
type Slices<TLogic extends AnyActorLogic = AnyActorLogic> = Record<
	string,
	TLogic
>;

export interface PayloadEvent<TPayload> extends EventObject {
	payload: TPayload;
}
export interface StoreContext<
	TSlices extends Record<string, AnyActorLogic> = Record<string, AnyActorLogic>
> {
	slices: { [TKey in keyof TSlices]: ActorRefFrom<TSlices[TKey]> };
	spawned: Record<string, AnyActorRef>;
}
interface SpawnActorEvent<TInput = any> {
	type: SpawnEventType;
	actorId: string;
	logic: ActorLogic<any, any, TInput>;
	input: TInput;
}
export function createStore<TSlices extends Record<string, AnyActorLogic>>(
	slices: TSlices
) {
	const store = setup({
		types: {} as {
			context: StoreContext<TSlices>;
		},
		actions: {
			spawnActor: assign({
				spawned: ({ context, event, spawn }) => {
					const spawned = { ...context.spawned };
					const spawnEvent = event as SpawnActorEvent;
					spawned[spawnEvent.actorId] = spawn(spawnEvent.logic, {
						id: spawnEvent.actorId,
						input: spawnEvent.input,
					});
					Object.values(context.slices).forEach((sliceRef) => {
						(sliceRef as AnyActorRef).send({
							type: spawnActorTypes.init(spawnEvent.actorId),
							input: spawnEvent.input,
						});
					});
					return spawned;
				},
			}),
			forwardToSlices: ({ context, event }) => {
				console.log({ event });
				Object.values(context.slices).forEach((sliceRef) => {
					(sliceRef as AnyActorRef).send(event);
				});
			},
		},
	}).createMachine({
		context: ({ spawn }) => {
			return {
				slices: Object.fromEntries(
					Object.entries(slices).map(([key, value]) => {
						return [key, spawn(value)];
					})
				) as StoreContext<TSlices>["slices"],
				spawned: {},
			};
		},
		on: {
			[spawnActorTypes.spawn()]: {
				actions: "spawnActor",
			},
			"*": {
				actions: "forwardToSlices",
			},
		},
	});
	return store;
}
export type Store<TSlices extends Slices = any> = ReturnType<
	typeof createStore<TSlices>
>;
export type StoreSnapshot<TStore extends Store> = SnapshotFrom<TStore>;

export function createSpawnEvent<TInput>(
	actorId: string,
	logic: ActorLogic<any, any, TInput>
) {
	const spawnEvent = (input: TInput): SpawnActorEvent<TInput> => ({
		type: spawnActorTypes.spawn(),
		actorId,
		logic,
		input,
	});
	spawnEvent["init"] = spawnActorTypes.init(actorId);
	spawnEvent["done"] = spawnActorTypes.done(actorId);
	spawnEvent["error"] = spawnActorTypes.error(actorId);
	return spawnEvent;
}
export function createSelector<TSnapshot, TSlice, TSelect>(
	sliceSelect: (root: TSnapshot) => TSlice,
	reselect: (slice: SnapshotFrom<TSlice>) => TSelect
): (root: TSnapshot) => TSelect {
	return (root) => {
		const sliceRef = sliceSelect(root);
		return reselect((sliceRef as AnyActorRef).getSnapshot());
	};
}

type TransitionCase<TState, TPayload = never> = (
	state: TState,
	action: TPayload extends never ? {} : { payload: TPayload }
) => void;
interface FromTransitionsConfig<
	TState,
	TTransitionMap extends Record<string, TransitionCase<TState>>
> {
	name: string;
	transitions: TTransitionMap;
	initialState: TState;
}
type GetActionCreators<
	TState,
	TTransitionMap extends Record<string, TransitionCase<TState>>
> = {
	[TKey in keyof TTransitionMap]: TTransitionMap[TKey] extends TransitionCase<
		TState,
		infer TPayload
	>
		? TPayload extends never
			? () => { type: string }
			: (payload: TPayload) => { type: string; payload: TPayload }
		: never;
};
export function createSlice<
	TState,
	TTransitionMap extends Record<string, TransitionCase<TState>>
>(config: FromTransitionsConfig<TState, TTransitionMap>) {
	const transition = fromTransition((state, action) => {
		const [sliceName, transitionKey] = action.type.split(".");
		const transition = config.transitions[transitionKey];
		if (transition && config.name === sliceName) {
			const stateCopy = { ...state };
			// @ts-ignore
			transition(stateCopy, action);
			return stateCopy;
		}
		return state;
	}, config.initialState);

	const actions = Object.fromEntries(
		Object.keys(config.transitions).map((type) => [
			type,
			(payload: any) => ({ type: `${config.name}.${type}`, payload }),
		])
	) as unknown as GetActionCreators<TState, TTransitionMap>;

	return {
		transition,
		actions,
	};
}
