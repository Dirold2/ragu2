import type { ApiServer } from "./server.js";
import type { ModuleExports } from "../../types/index.js";

export interface ApiExports extends ModuleExports {
	getServer: () => ApiServer | null;
}
