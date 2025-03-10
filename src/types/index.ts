export type ModuleExports = ModuleExportsMap[keyof ModuleExportsMap];

export interface ModuleConfig {
    readonly name: keyof ModuleExportsMap;
    readonly description: string;
    readonly version: string;
    readonly dependencies: (keyof ModuleExportsMap)[];
    readonly exports: ModuleExports;
}

export interface ModuleConstructor {
    new (): {
        config: ModuleConfig;
        start(): Promise<void>;
        stop(): Promise<void>;
        restart(): Promise<void>;
    };
} 

// Базовый тип для всех модулей
export interface BaseModule {
    readonly name: string;
    readonly description: string;
    readonly version: string;
    readonly dependencies: string[];
    readonly exports: Record<string, unknown>;
    readonly disabled: boolean;
    
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    setImports(imports: { [key: string]: unknown }): void;
}

// Тип для объединения всех модулей
export type ModuleExportsMap = {
    [ModuleName: string]: Record<string, unknown>;
}

// Обновляем интерфейс I18nOptions
export interface I18nOptions<T = any> {
    category: keyof T;
    params?: Record<string, string | number>;
}

export interface ModuleTranslations {
    [category: string]: {
        [key: string]: any;
    };
}