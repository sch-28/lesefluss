import { createContext, useContext } from "react";
import type { ReaderApi } from "./types";

export const ReaderApiContext = createContext<ReaderApi | null>(null);

/** Null outside an open book. */
export function useReaderApi(): ReaderApi | null {
	return useContext(ReaderApiContext);
}
