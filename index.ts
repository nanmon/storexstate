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
const defaultRefToSnapshot = <TRef extends AnyActorRef>(
	ref: TRef
): SnapshotFrom<TRef> => ref.getSnapshot();
export function createSelector<TSnapshot, TSlice extends AnyActorRef, TSelect>(
	sliceSelect: (root: TSnapshot) => TSlice,
	reselect: (slice: SnapshotFrom<TSlice>) => TSelect,
	refToSnapshot = defaultRefToSnapshot<TSlice>
): (root: TSnapshot) => TSelect {
	return (root) => {
		const sliceRef = sliceSelect(root);
		return reselect(refToSnapshot(sliceRef));
	};
}

type SimpleTransitionCase<TState> = (state: TState, action?: any) => void;
type TransitionCase<TState, TPayload> = (
	state: TState,
	action: { payload: TPayload }
) => void;
interface FromTransitionsConfig<
	TState,
	TTransitionMap extends Record<string, SimpleTransitionCase<TState>>
> {
	name: string;
	transitions: TTransitionMap;
	initialState: TState;
}
type GetActionCreators<
	TState,
	TTransitionMap extends Record<string, SimpleTransitionCase<TState>>
> = {
	[TKey in keyof TTransitionMap]: TTransitionMap[TKey] extends TransitionCase<
		TState,
		infer TPayload
	>
		? TPayload extends {}
			? (payload: TPayload) => { type: string; payload: TPayload }
			: () => { type: string }
		: never;
};

function getTransitionKey(sliceName: string, actionType: string) {
	const typeSplits = actionType.split(".");
	if (typeSplits[0] === sliceName) return typeSplits[1]; // action creator
	if (typeSplits[0] === "xstate") return actionType; // spawn actor
}

export function createSlice<
	TState,
	TTransitionMap extends Record<string, SimpleTransitionCase<TState>>
>(config: FromTransitionsConfig<TState, TTransitionMap>) {
	const transition = fromTransition((state, action) => {
		const transitionKey = getTransitionKey(config.name, action.type);
		if (!transitionKey) return state;
		const transitionCase = config.transitions[transitionKey];
		if (!transitionCase) return state;
		const stateCopy = { ...state };
		transitionCase(stateCopy, action);
		return stateCopy;
	}, config.initialState);

	const actions = Object.fromEntries(
		Object.keys(config.transitions).map((type) => [
			type,
			(payload: any) => ({ type: `${config.name}.${type}`, payload }),
		])
	) as unknown as GetActionCreators<TState, typeof config.transitions>;

	return {
		transition,
		actions,
	};
}
