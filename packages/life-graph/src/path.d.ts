export interface LifeGraphPathOptions {
    baseDir?: string;
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    homeDir?: string;
}
export declare function getDefaultLifeGraphPath(baseDir?: string): string;
export declare function getDefaultLifeGraphPath(options?: LifeGraphPathOptions): string;
export declare function resolveLifeGraphPath(graphPath?: string, options?: LifeGraphPathOptions): string;
