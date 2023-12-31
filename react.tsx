import { createContext, useContext } from "react";
import { ActorRefFrom, AnyActorRef, SnapshotFrom } from "xstate";
import { useActorRef, useSelector } from "@xstate/react";
import { Store, createSelector } from ".";

const StoreContext = createContext<ActorRefFrom<Store> | null>(null);
interface XStateProviderProps extends React.PropsWithChildren {
	store: Store;
}
export function StoreProvider({ store, children }: XStateProviderProps) {
	const ref = useActorRef(store);
	return <StoreContext.Provider value={ref}>{children}</StoreContext.Provider>;
}

export function useStore() {
	const ref = useContext(StoreContext);
	if (!ref) throw new Error("forgot XStateProvider");
	return ref;
}

export function useDispatch() {
	const ref = useStore();
	return ref.send;
}

export function useReselector<TSlice extends AnyActorRef, TSelect>(
	selector: ReturnType<
		typeof createSelector<SnapshotFrom<Store>, TSlice, TSelect>
	>
) {
	const ref = useStore();
	const sliceRef = useSelector(ref, selector[0]);
	return useSelector(sliceRef, selector[1]);
}
