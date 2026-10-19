"use strict";export class Mutex{locked=!1;waiters=[];acquire(){return this.locked?new Promise(e=>{this.waiters.push(()=>{this.locked=!0,e(()=>this.release())})}):(this.locked=!0,Promise.resolve(()=>this.release()))}release(){const e=this.waiters.shift();e?e():this.locked=!1}}
//# sourceMappingURL=mutex.js.map
