import { EventEmitter } from 'events';
import type { BaseModule } from '../types/index.js';

export abstract class Module extends EventEmitter implements BaseModule {
    public abstract readonly name: string;
    public abstract readonly description: string;
    public abstract readonly version: string;
    public abstract readonly dependencies: string[];
    public abstract readonly exports: Record<string, unknown>;
    public abstract readonly disabled: boolean;
    protected imports: { [key: string]: unknown };

    constructor() {
        super();
        this.imports = {};
    }

    public abstract start(): Promise<void>;
    public abstract stop(): Promise<void>;
    
    public async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }

    public setImports(imports: { [key: string]: unknown }): void {
        this.imports = imports;
    }

    protected getModuleExports<T>(moduleName: string): T {
        const moduleExports = this.imports[moduleName];
        if (!moduleExports) {
            throw new Error(`Module ${moduleName} not found in imports`);
        }
        return moduleExports as T;
    }
} 