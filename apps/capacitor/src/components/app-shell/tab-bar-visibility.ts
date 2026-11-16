import { createFlag } from "../../commands/signal";

/** Set while a screen shows its own bottom bar in the tab bar's place (library selection). */
export const tabBarHidden = createFlag();

/** Set while the library's add button floats above the tab bar; bottom bars clear it. */
export const addButtonShown = createFlag();
