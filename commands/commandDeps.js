"use strict";let n=null;export function setCommandDeps(e){n=e}export function getDeps(){if(!n)throw new Error("CommandDeps not initialized \u2013 call setCommandDeps() before importing commands");return n}export function t(e,o,r){return n?.t(e,o,r)??e}
//# sourceMappingURL=commandDeps.js.map
