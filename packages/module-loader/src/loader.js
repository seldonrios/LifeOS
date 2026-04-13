import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { createEventBusClient, } from '@lifeos/event-bus';
import { createLifeGraphClient, } from '@lifeos/life-graph';
import { readLifeOSManifestFile } from './manifest';
import { checkPermissions } from './permissions';
const MODULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const WRITE_METHOD_PATTERN = /^(save|set|update|delete|remove|merge|apply|register)/i;
const EVENT_SECURITY_POLICY_DENIED = 'lifeos.security.policy.denied';
function createEventEnvelope(topic, data, source) {
    return {
        id: randomUUID(),
        type: topic,
        timestamp: new Date().toISOString(),
        source,
        version: '0.1.0',
        data,
    };
}
function parseEventPermission(permission) {
    const [action, topic] = permission.split(':', 2);
    if (!action || !topic || (action !== 'subscribe' && action !== 'publish')) {
        return null;
    }
    return {
        action,
        topic,
    };
}
function topicMatches(pattern, topic) {
    if (pattern === topic) {
        return true;
    }
    const patternParts = pattern.split('.');
    const topicParts = topic.split('.');
    for (let index = 0; index < patternParts.length; index += 1) {
        const token = patternParts[index];
        if (token === '>') {
            return true;
        }
        const part = topicParts[index];
        if (!part) {
            return false;
        }
        if (token !== '*' && token !== part) {
            return false;
        }
    }
    return patternParts.length === topicParts.length;
}
function resolveRuntimePermissionMode(env) {
    const raw = (env.LIFEOS_MODULE_RUNTIME_PERMISSIONS ?? 'strict').trim().toLowerCase();
    if (raw === 'off' || raw === 'disabled' || raw === 'false' || raw === '0') {
        return 'off';
    }
    if (raw === 'warn') {
        return 'warn';
    }
    if (raw === 'strict' || raw === 'enforce' || raw === 'true' || raw === '1' || raw.length === 0) {
        return 'strict';
    }
    return 'strict';
}
function resolveResourceEnforcementMode(env) {
    const raw = (env.LIFEOS_MODULE_RESOURCE_ENFORCEMENT ?? '').trim().toLowerCase();
    if (raw === 'off' || raw === 'disabled' || raw === 'false' || raw === '0') {
        return 'off';
    }
    if (raw === 'warn') {
        return 'warn';
    }
    if (raw === 'strict' || raw === 'enforce' || raw === 'true' || raw === '1') {
        return 'strict';
    }
    return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production' ? 'strict' : 'warn';
}
function deriveResourceTier(manifest) {
    if (manifest.resources.cpu === 'high' || manifest.resources.memory === 'medium') {
        return 'high';
    }
    if (manifest.resources.cpu === 'medium') {
        return 'medium';
    }
    return 'low';
}
function getResourcePressureThreshold(tier) {
    if (tier === 'high') {
        return 0.78;
    }
    if (tier === 'medium') {
        return 0.88;
    }
    return 0.95;
}
function defaultHeapUsageProvider() {
    const stats = getHeapStatistics();
    return {
        heapUsed: process.memoryUsage().heapUsed,
        heapLimit: stats.heap_size_limit,
    };
}
export class ModuleLoader {
    modules = new Map();
    moduleContexts = new Map();
    env;
    baseDir;
    graphPath;
    requireManifest;
    runtimePermissionMode;
    resourceEnforcementMode;
    eventBus;
    createGraphClient;
    heapUsageProvider;
    logger;
    prevalidatedModules = new Map();
    constructor(options = {}) {
        this.env = options.env ?? process.env;
        this.baseDir = options.baseDir ?? process.cwd();
        this.graphPath = options.graphPath;
        const legacyManifestBypass = (this.env.LIFEOS_ALLOW_LEGACY_MANIFESTLESS ?? '').trim().toLowerCase() === 'true';
        this.requireManifest =
            options.requireManifest ??
                (!legacyManifestBypass &&
                    (this.env.LIFEOS_MODULE_MANIFEST_REQUIRED ?? 'true').trim().toLowerCase() !== 'false');
        this.runtimePermissionMode = resolveRuntimePermissionMode(this.env);
        this.resourceEnforcementMode = resolveResourceEnforcementMode(this.env);
        this.createGraphClient = options.createLifeGraphClient ?? createLifeGraphClient;
        this.heapUsageProvider = options.heapUsageProvider ?? defaultHeapUsageProvider;
        this.logger = options.logger ?? ((line) => console.log(line));
        this.eventBus =
            options.eventBus ??
                createEventBusClient({
                    env: this.env,
                    name: 'lifeos-module-loader',
                    ...(options.eventBusOptions ?? {}),
                });
        if (legacyManifestBypass) {
            this.logStructured('warn', {
                component: 'module-loader',
                message: 'legacy manifest bypass enabled; this compatibility mode is deprecated and should be removed after manifest migration.',
                errorCode: 'manifest-bypass-enabled',
                eventType: 'module.loader.compatibility_mode',
            });
        }
    }
    logStructured(level, entry) {
        this.logger(JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            ...entry,
        }));
    }
    suggestedFixForStage(stage) {
        if (stage === 'manifest-validation') {
            return 'Fix lifeos.json fields and rerun `pnpm lifeos module validate <module-id>`.';
        }
        if (stage === 'permission-check') {
            return 'Update manifest permissions or policy settings to least-privilege values.';
        }
        if (stage === 'dispose') {
            return 'Make dispose idempotent and handle cleanup errors without throwing.';
        }
        return 'Review module init logic, dependencies, and runtime environment variables.';
    }
    parseRequiredPackageName(required) {
        const match = required.trim().match(/^(@lifeos\/[a-z0-9-]+)(?:@.+)?$/);
        return match?.[1] ?? '';
    }
    detectDependencyCycles(modules, manifests) {
        const moduleIds = new Set(modules.map((module) => module.id));
        const adjacency = new Map();
        for (const module of modules) {
            const manifest = manifests.get(module.id);
            if (!manifest) {
                continue;
            }
            const dependencies = manifest.requires
                .map((required) => this.parseRequiredPackageName(required))
                .filter((required) => required.startsWith('@lifeos/'))
                .map((required) => required.replace('@lifeos/', ''))
                .filter((requiredId) => moduleIds.has(requiredId));
            adjacency.set(module.id, dependencies);
        }
        const visiting = new Set();
        const visited = new Set();
        const cycles = new Set();
        const walk = (node, path) => {
            if (visiting.has(node)) {
                const cycleStart = path.indexOf(node);
                const cyclePath = cycleStart >= 0 ? path.slice(cycleStart).concat(node) : [...path, node];
                cycles.add(cyclePath.join(' -> '));
                return;
            }
            if (visited.has(node)) {
                return;
            }
            visiting.add(node);
            const nextPath = [...path, node];
            for (const dependency of adjacency.get(node) ?? []) {
                walk(dependency, nextPath);
            }
            visiting.delete(node);
            visited.add(node);
        };
        for (const module of modules) {
            walk(module.id, []);
        }
        return [...cycles];
    }
    async preStart(modules) {
        const failures = [];
        const validated = new Map();
        // Basic config sanity check (presence/readability) before module init.
        const configPath = resolve(this.baseDir, 'config', 'defaults.yaml');
        try {
            await access(configPath);
        }
        catch {
            failures.push(`Config validation failed: missing expected config file at ${configPath}`);
        }
        const manifestById = new Map();
        for (const module of modules) {
            if (!MODULE_ID_PATTERN.test(module.id)) {
                failures.push(`Module id "${module.id}" is invalid. Use lowercase kebab-case with 2-63 characters.`);
                continue;
            }
            const manifestPath = resolve(this.baseDir, 'modules', module.id, 'lifeos.json');
            try {
                await access(manifestPath);
                const manifestResult = await readLifeOSManifestFile(manifestPath);
                if (!manifestResult.valid || !manifestResult.manifest) {
                    failures.push(`Module ${module.id} has invalid lifeos.json: ${manifestResult.errors.join('; ')}`);
                    continue;
                }
                if (manifestResult.manifest.name !== module.id) {
                    failures.push(`Module ${module.id} manifest name mismatch: expected "${module.id}", got "${manifestResult.manifest.name}"`);
                    continue;
                }
                const permissionResult = await checkPermissions(manifestResult.manifest.permissions, {
                    moduleId: module.id,
                    env: this.env,
                });
                if (!permissionResult.allowed) {
                    failures.push(`Module ${module.id} requested unauthorized permissions${permissionResult.reason ? `: ${permissionResult.reason}` : ''}`);
                    continue;
                }
                manifestById.set(module.id, manifestResult.manifest);
                validated.set(module.id, {
                    manifest: manifestResult.manifest,
                    policy: this.buildRuntimePolicy(module.id, manifestResult.manifest),
                });
            }
            catch (error) {
                const code = error?.code;
                if (code === 'ENOENT' && !this.requireManifest) {
                    continue;
                }
                if (code === 'ENOENT') {
                    failures.push(`Module ${module.id} missing required lifeos.json at ${manifestPath}.`);
                    continue;
                }
                const message = error instanceof Error ? error.message : String(error);
                failures.push(`Module ${module.id} pre-start check failed: ${message}`);
            }
        }
        const cycles = this.detectDependencyCycles(modules, manifestById);
        for (const cycle of cycles) {
            failures.push(`Module dependency cycle detected: ${cycle}`);
        }
        if (failures.length > 0) {
            throw new Error(`Pre-start validation failed:\n- ${failures.join('\n- ')}`);
        }
        this.prevalidatedModules.clear();
        for (const [moduleId, info] of validated.entries()) {
            this.prevalidatedModules.set(moduleId, info);
        }
    }
    emitPolicyDenied(moduleId, action, detail, extras) {
        const event = createEventEnvelope(EVENT_SECURITY_POLICY_DENIED, {
            moduleId,
            action,
            detail,
            runtimeMode: this.runtimePermissionMode,
            ...(extras ?? {}),
        }, 'module-loader');
        void this.eventBus.publish(EVENT_SECURITY_POLICY_DENIED, event).catch(() => {
            return;
        });
    }
    emitResourceEnforcement(moduleId, tier, pressure, threshold, blocked) {
        const action = blocked ? 'resource.enforcement.denied' : 'resource.enforcement.warn';
        const detail = `tier=${tier} pressure=${pressure.toFixed(4)} threshold=${threshold.toFixed(4)}`;
        this.emitPolicyDenied(moduleId, action, detail, {
            resourceTier: tier,
            currentPressure: Number(pressure.toFixed(6)),
            threshold: Number(threshold.toFixed(6)),
            enforcementMode: this.resourceEnforcementMode,
        });
    }
    enforceResourceBudget(moduleId, manifest) {
        if (this.resourceEnforcementMode === 'off') {
            return;
        }
        const tier = deriveResourceTier(manifest);
        const threshold = getResourcePressureThreshold(tier);
        const snapshot = this.heapUsageProvider();
        const heapLimit = snapshot.heapLimit > 0 ? snapshot.heapLimit : 1;
        const pressure = snapshot.heapUsed / heapLimit;
        if (pressure < threshold) {
            return;
        }
        const blocked = this.resourceEnforcementMode === 'strict';
        this.emitResourceEnforcement(moduleId, tier, pressure, threshold, blocked);
        const message = `[ModuleLoader] ${moduleId} resource budget exceeded: tier=${tier} pressure=${pressure.toFixed(4)} threshold=${threshold.toFixed(4)} mode=${this.resourceEnforcementMode}`;
        if (blocked) {
            throw new Error(message);
        }
        this.logStructured('warn', {
            component: 'module-loader',
            moduleId,
            eventType: 'module.resource.enforcement.warn',
            errorCode: 'resource-budget-exceeded',
            message: `${message} (continuing in warn mode)`,
        });
    }
    buildRuntimePolicy(moduleId, manifest) {
        const subscribe = [];
        const publish = [];
        for (const permission of manifest.permissions.events) {
            const parsed = parseEventPermission(permission);
            if (!parsed) {
                continue;
            }
            if (parsed.action === 'subscribe') {
                subscribe.push(parsed.topic);
            }
            else {
                publish.push(parsed.topic);
            }
        }
        return {
            moduleId,
            graph: {
                read: manifest.permissions.graph.includes('read') ||
                    manifest.permissions.graph.includes('write'),
                append: manifest.permissions.graph.includes('append') ||
                    manifest.permissions.graph.includes('write'),
                write: manifest.permissions.graph.includes('write'),
            },
            eventPermissions: {
                subscribe,
                publish,
            },
        };
    }
    authorizeRuntimeAction(moduleId, action, detail, allowed) {
        if (allowed || this.runtimePermissionMode === 'off') {
            return true;
        }
        const message = `[ModuleLoader] ${moduleId} unauthorized ${action}: ${detail}`;
        this.emitPolicyDenied(moduleId, action, detail);
        if (this.runtimePermissionMode === 'strict') {
            throw new Error(message);
        }
        this.logStructured('warn', {
            component: 'module-loader',
            moduleId,
            eventType: 'module.permission.warn',
            errorCode: 'permission-denied-warn',
            message: `${message} (allowed in warn mode)`,
        });
        return true;
    }
    wrapGraphClientWithPolicy(moduleId, client, policy) {
        if (policy.graph.write) {
            return client;
        }
        return new Proxy(client, {
            get: (target, property, receiver) => {
                const value = Reflect.get(target, property, receiver);
                if (typeof value !== 'function') {
                    return value;
                }
                const methodName = String(property);
                return (...args) => {
                    const requiresWrite = WRITE_METHOD_PATTERN.test(methodName) ||
                        methodName === 'createRelationship' ||
                        methodName === 'saveGraph' ||
                        methodName === 'mergeDelta' ||
                        methodName === 'applyUpdates';
                    const requiresAppend = methodName.startsWith('append') ||
                        methodName === 'createNode' ||
                        methodName === 'createRelationship';
                    if (requiresWrite) {
                        this.authorizeRuntimeAction(moduleId, 'graph.write', `method "${methodName}" requires graph.write`, policy.graph.write);
                    }
                    else if (requiresAppend) {
                        this.authorizeRuntimeAction(moduleId, 'graph.append', `method "${methodName}" requires graph.append or graph.write`, policy.graph.append || policy.graph.write);
                    }
                    return Reflect.apply(value, target, args);
                };
            },
        });
    }
    createContext(policy) {
        const context = {
            env: this.env,
            eventBus: this.eventBus,
            createLifeGraphClient: (options) => {
                const resolved = this.createGraphClient(options);
                if (!policy) {
                    return resolved;
                }
                this.authorizeRuntimeAction(policy.moduleId, 'graph.read', 'createLifeGraphClient requested graph access without graph permissions', policy.graph.read || policy.graph.append || policy.graph.write);
                return this.wrapGraphClientWithPolicy(policy.moduleId, resolved, policy);
            },
            subscribe: async (topic, handler) => {
                try {
                    if (policy) {
                        const allowed = policy.eventPermissions.subscribe.some((pattern) => topicMatches(pattern, topic));
                        this.authorizeRuntimeAction(policy.moduleId, 'event.subscribe', `topic "${topic}" is not declared in lifeos.json`, allowed);
                    }
                    await this.eventBus.subscribe(topic, async (event) => {
                        await handler(event);
                    });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.logStructured('warn', {
                        component: 'module-loader',
                        moduleId: policy?.moduleId,
                        eventType: 'module.subscribe.degraded',
                        errorCode: 'event-subscribe-degraded',
                        message: `subscribe degraded for topic "${topic}": ${message}`,
                    });
                    if (this.runtimePermissionMode === 'strict') {
                        throw error;
                    }
                }
            },
            publish: async (topic, data, source = 'lifeos-module-loader') => {
                const event = createEventEnvelope(topic, data, source);
                try {
                    if (policy) {
                        const allowed = policy.eventPermissions.publish.some((pattern) => pattern === topic);
                        this.authorizeRuntimeAction(policy.moduleId, 'event.publish', `topic "${topic}" is not declared in lifeos.json`, allowed);
                    }
                    await this.eventBus.publish(topic, event);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.logStructured('warn', {
                        component: 'module-loader',
                        moduleId: policy?.moduleId,
                        eventType: 'module.publish.degraded',
                        errorCode: 'event-publish-degraded',
                        message: `publish degraded for topic "${topic}": ${message}`,
                    });
                    if (this.runtimePermissionMode === 'strict') {
                        throw error;
                    }
                }
                return event;
            },
            log: this.logger,
        };
        if (this.graphPath) {
            context.graphPath = this.graphPath;
        }
        return context;
    }
    async load(module) {
        if (this.modules.has(module.id)) {
            return;
        }
        if (!MODULE_ID_PATTERN.test(module.id)) {
            throw new Error(`Module id "${module.id}" is invalid. Use lowercase kebab-case with 2-63 characters.`);
        }
        const manifestPath = resolve(this.baseDir, 'modules', module.id, 'lifeos.json');
        let runtimePolicy;
        let validatedManifest;
        let stage = 'manifest-validation';
        try {
            const prevalidated = this.prevalidatedModules.get(module.id);
            if (prevalidated) {
                validatedManifest = prevalidated.manifest;
                runtimePolicy = prevalidated.policy;
            }
            else {
                await access(manifestPath);
                const manifestResult = await readLifeOSManifestFile(manifestPath);
                if (!manifestResult.valid || !manifestResult.manifest) {
                    throw new Error(`Module ${module.id} has invalid lifeos.json: ${manifestResult.errors.join('; ')}`);
                }
                if (manifestResult.manifest.name !== module.id) {
                    throw new Error(`Module ${module.id} manifest name mismatch: expected "${module.id}", got "${manifestResult.manifest.name}"`);
                }
                validatedManifest = manifestResult.manifest;
                stage = 'permission-check';
                const permissionResult = await checkPermissions(manifestResult.manifest.permissions, {
                    moduleId: module.id,
                    env: this.env,
                });
                if (!permissionResult.allowed) {
                    throw new Error(`Module ${module.id} requested unauthorized permissions${permissionResult.reason ? `: ${permissionResult.reason}` : ''}`);
                }
                runtimePolicy = this.buildRuntimePolicy(module.id, manifestResult.manifest);
            }
            this.logStructured('info', {
                component: 'module-loader',
                moduleId: module.id,
                eventType: 'module.permission.approved',
                message: `${module.id} permissions approved`,
            });
        }
        catch (error) {
            const code = error?.code;
            if (code === 'ENOENT') {
                if (this.requireManifest) {
                    throw new Error(`Module ${module.id} missing required lifeos.json at ${manifestPath}.`);
                }
                this.logStructured('warn', {
                    component: 'module-loader',
                    moduleId: module.id,
                    eventType: 'module.manifest.missing',
                    errorCode: 'manifest-missing',
                    message: `${module.id} has no lifeos.json manifest; skipping policy check`,
                    suggestedFix: 'Add modules/<module-id>/lifeos.json or disable strict manifest requirement.',
                });
            }
            else {
                const reason = error instanceof Error ? error.message : String(error);
                this.logStructured('error', {
                    component: 'module-loader',
                    moduleId: module.id,
                    eventType: 'module.load.failed',
                    errorCode: stage,
                    message: reason,
                    suggestedFix: this.suggestedFixForStage(stage),
                    stage,
                });
                throw error;
            }
        }
        if (validatedManifest) {
            this.enforceResourceBudget(module.id, validatedManifest);
        }
        stage = 'init';
        const context = this.createContext(runtimePolicy);
        try {
            await module.init(context);
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logStructured('error', {
                component: 'module-loader',
                moduleId: module.id,
                eventType: 'module.load.failed',
                errorCode: stage,
                message: reason,
                suggestedFix: this.suggestedFixForStage(stage),
                stage,
            });
            throw error;
        }
        this.modules.set(module.id, module);
        this.moduleContexts.set(module.id, context);
        this.logStructured('info', {
            component: 'module-loader',
            moduleId: module.id,
            eventType: 'module.loaded',
            message: `${module.id} loaded`,
        });
    }
    async loadMany(modules) {
        await this.preStart(modules);
        for (const module of modules) {
            await this.load(module);
        }
    }
    getAll() {
        return Array.from(this.modules.values());
    }
    getModuleIds() {
        return Array.from(this.modules.keys());
    }
    has(moduleId) {
        return this.modules.has(moduleId);
    }
    async publish(topic, data, source) {
        return this.createContext().publish(topic, data, source);
    }
    async close() {
        const modules = Array.from(this.modules.values()).reverse();
        for (const module of modules) {
            if (!module.dispose) {
                continue;
            }
            try {
                const context = this.moduleContexts.get(module.id) ?? this.createContext();
                await module.dispose(context);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logStructured('error', {
                    component: 'module-loader',
                    moduleId: module.id,
                    eventType: 'module.dispose.failed',
                    errorCode: 'dispose',
                    message: `${module.id} dispose failed: ${message}`,
                    suggestedFix: this.suggestedFixForStage('dispose'),
                    stage: 'dispose',
                });
            }
        }
        this.modules.clear();
        this.moduleContexts.clear();
        await this.eventBus.close();
    }
}
export function createModuleLoader(options = {}) {
    return new ModuleLoader(options);
}
export const moduleLoader = createModuleLoader();
