import { useQuery } from "@tanstack/react-query";
import { getCloudStorage } from "../../sync";
import { syncKeys } from "./query-keys";

/** Cloud storage use and the books refused for lack of it; see `getCloudStorage`. */
export function useCloudStorage(enabled = true) {
	return useQuery({ queryKey: syncKeys.cloudStorage, queryFn: getCloudStorage, enabled });
}
