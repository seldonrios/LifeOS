export * from './types';
import { setTimeout as delay } from 'node:timers/promises';
import { connect, StringCodec } from 'nats';
const DEFAULT_NATS_URL = 'nats://127.0.0.1:4222';
const HANDLER_TIMEOUT_MS = 30_000;
const MIN_TOPIC_LENGTH = 1;
const MAX_TOPIC_LENGTH = 255;
const TOPIC_PATTERN = /^[a-zA-Z0-9._>*-]+$/;
function normalizeServers(value, env) {
    if (Array.isArray(value) && value.length > 0) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return value
            .split(',')
            .map((server) => server.trim())
            .filter((server) => server.length > 0);
    }
    const fromEnv = env?.LIFEOS_NATS_URL?.trim();
    if (fromEnv) {
        return fromEnv
            .split(',')
            .map((server) => server.trim())
            .filter((server) => server.length > 0);
    }
    return [DEFAULT_NATS_URL];
}
/**
 * Validates topic name to prevent injection and ensure well-formed topics.
 * @throws Error if topic is invalid
 */
function validateTopic(topic) {
    if (!topic || topic.length < MIN_TOPIC_LENGTH || topic.length > MAX_TOPIC_LENGTH) {
        throw new Error(`Invalid topic: length must be between ${MIN_TOPIC_LENGTH} and ${MAX_TOPIC_LENGTH}`);
    }
    if (!TOPIC_PATTERN.test(topic)) {
        throw new Error(`Invalid topic characters: must match [a-zA-Z0-9._>*-]+`);
    }
    // Prevent null bytes
    if (topic.includes('\0')) {
        throw new Error('Topic contains null bytes');
    }
}
/**
 * Validates event structure before processing.
 * @throws Error if event is invalid
 */
function validateEvent(event) {
    if (!event || typeof event !== 'object') {
        throw new Error('Event must be an object');
    }
    const candidate = event;
    if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
        throw new Error('Event must have a non-empty id');
    }
    if (typeof candidate.type !== 'string' || !candidate.type.trim()) {
        throw new Error('Event must have a non-empty type');
    }
    if (typeof candidate.timestamp !== 'string' || !candidate.timestamp.trim()) {
        throw new Error('Event must have a non-empty timestamp');
    }
    // Validate timestamp is parseable ISO date
    const ts = new Date(candidate.timestamp);
    if (Number.isNaN(ts.getTime())) {
        throw new Error('Event timestamp must be a valid ISO date string');
    }
    if (typeof candidate.source !== 'string' || !candidate.source.trim()) {
        throw new Error('Event must have a non-empty source');
    }
    return candidate;
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function matchSubject(pattern, subject) {
    if (pattern === subject) {
        return true;
    }
    const patternTokens = pattern.split('.');
    const subjectTokens = subject.split('.');
    for (let index = 0; index < patternTokens.length; index += 1) {
        const token = patternTokens[index];
        if (token === '>') {
            return true;
        }
        const subjectToken = subjectTokens[index];
        if (!subjectToken) {
            return false;
        }
        if (token === '*') {
            continue;
        }
        if (token !== subjectToken) {
            return false;
        }
    }
    return patternTokens.length === subjectTokens.length;
}
class InMemoryEventBus {
    subscriptions = new Map();
    subscribe(topic, handler) {
        const existing = this.subscriptions.get(topic) ?? new Set();
        existing.add(handler);
        this.subscriptions.set(topic, existing);
        return () => {
            const current = this.subscriptions.get(topic);
            if (!current) {
                return;
            }
            current.delete(handler);
            if (current.size === 0) {
                this.subscriptions.delete(topic);
            }
        };
    }
    async publish(topic, event) {
        const matchingHandlers = [];
        this.subscriptions.forEach((handlers, pattern) => {
            if (!matchSubject(pattern, topic)) {
                return;
            }
            handlers.forEach((handler) => matchingHandlers.push(handler));
        });
        for (const handler of matchingHandlers) {
            await handler(event);
        }
    }
}
const sharedInMemoryBus = new InMemoryEventBus();
class LifeOSEventBus {
    codec = StringCodec();
    servers;
    name;
    timeoutMs;
    maxReconnectAttempts;
    logger;
    allowInMemoryFallback;
    connectFn;
    connectionPromise = null;
    connection = null;
    subscriptions = new Set();
    fallbackUnsubscribers = new Set();
    fallbackWarningShown = false;
    transport = 'unknown';
    connectionHealth = 'disconnected';
    constructor(options = {}) {
        this.servers = normalizeServers(options.servers, options.env);
        this.name = options.name ?? 'lifeos-event-bus';
        this.timeoutMs = options.timeoutMs ?? 2000;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? -1;
        this.logger = options.logger;
        this.allowInMemoryFallback = options.allowInMemoryFallback ?? true;
        this.connectFn = options.connectFn ?? connect;
    }
    setConnectionHealth(nextHealth) {
        this.connectionHealth = nextHealth;
    }
    monitorConnection(connection) {
        void (async () => {
            try {
                for await (const status of connection.status()) {
                    const statusType = status.type ?? 'unknown';
                    if (statusType === 'disconnect' || statusType === 'reconnecting') {
                        this.setConnectionHealth('degraded');
                        continue;
                    }
                    if (statusType === 'reconnect' || statusType === 'connect' || statusType === 'update') {
                        this.setConnectionHealth('connected');
                    }
                }
            }
            catch {
                if (this.transport === 'nats') {
                    this.setConnectionHealth('degraded');
                }
            }
        })();
    }
    logFallback(reason) {
        if (this.fallbackWarningShown) {
            return;
        }
        this.fallbackWarningShown = true;
        this.transport = 'in-memory';
        this.setConnectionHealth('degraded');
        this.logger?.(`[event-bus] NATS unavailable, using in-memory fallback (${toErrorMessage(reason)})`);
    }
    async getConnection() {
        if (this.connection) {
            return this.connection;
        }
        if (this.connectionPromise) {
            return this.connectionPromise;
        }
        this.connectionPromise = this.connectFn({
            servers: this.servers,
            name: this.name,
            timeout: this.timeoutMs,
            maxReconnectAttempts: this.maxReconnectAttempts,
        });
        try {
            const connection = await this.connectionPromise;
            this.connection = connection;
            this.transport = 'nats';
            this.setConnectionHealth('connected');
            this.monitorConnection(connection);
            this.logger?.(`[event-bus] connected to ${this.servers.join(', ')}`);
            return connection;
        }
        catch (error) {
            if (!this.allowInMemoryFallback) {
                this.connectionPromise = null;
                this.transport = 'unknown';
                this.setConnectionHealth('disconnected');
                throw new Error(`[event-bus] NATS unavailable and in-memory fallback is disabled (${toErrorMessage(error)})`);
            }
            this.logFallback(error);
            this.connectionPromise = null;
            return null;
        }
    }
    async publish(topic, event) {
        // Validate input
        try {
            validateTopic(topic);
            validateEvent(event);
        }
        catch (validationError) {
            this.logger?.(`[event-bus] validation error on publish: ${toErrorMessage(validationError)}`);
            throw validationError;
        }
        const connection = await this.getConnection();
        if (connection) {
            try {
                const encoded = this.codec.encode(JSON.stringify(event));
                connection.publish(topic, encoded);
            }
            catch (error) {
                this.setConnectionHealth('degraded');
                this.logger?.(`[event-bus] publish error: ${toErrorMessage(error)}`);
                throw error;
            }
            return;
        }
        // Fallback to in-memory bus
        if (!this.allowInMemoryFallback) {
            throw new Error('[event-bus] In-memory fallback disabled and no NATS connection available');
        }
        await sharedInMemoryBus.publish(topic, event);
        this.transport = 'in-memory';
        this.setConnectionHealth('degraded');
    }
    async subscribe(topic, handler) {
        // Validate topic
        try {
            validateTopic(topic);
        }
        catch (validationError) {
            this.logger?.(`[event-bus] validation error on subscribe: ${toErrorMessage(validationError)}`);
            throw validationError;
        }
        if (!handler || typeof handler !== 'function') {
            throw new Error('Event handler must be a function');
        }
        const connection = await this.getConnection();
        if (!connection) {
            if (!this.allowInMemoryFallback) {
                throw new Error('[event-bus] In-memory fallback disabled and no NATS connection available');
            }
            const unsubscribe = sharedInMemoryBus.subscribe(topic, async (event) => {
                try {
                    // Timeout protection for handlers
                    await Promise.race([
                        handler(event),
                        (async () => {
                            await delay(HANDLER_TIMEOUT_MS);
                            throw new Error(`Handler timeout on topic ${topic}`);
                        })(),
                    ]);
                }
                catch (error) {
                    this.logger?.(`[event-bus] handler error on topic ${topic}: ${toErrorMessage(error)}`);
                }
            });
            this.fallbackUnsubscribers.add(unsubscribe);
            this.transport = 'in-memory';
            this.setConnectionHealth('degraded');
            return;
        }
        const subscription = connection.subscribe(topic);
        this.subscriptions.add(subscription);
        void (async () => {
            try {
                for await (const message of subscription) {
                    try {
                        const decoded = this.codec.decode(message.data);
                        let event;
                        try {
                            event = validateEvent(JSON.parse(decoded));
                        }
                        catch (parseError) {
                            this.logger?.(`[event-bus] invalid event on ${topic}: ${toErrorMessage(parseError)}`);
                            continue;
                        }
                        // Timeout protection for event handlers
                        try {
                            await Promise.race([
                                handler(event),
                                (async () => {
                                    await delay(HANDLER_TIMEOUT_MS);
                                    throw new Error(`Handler timeout on topic ${topic}`);
                                })(),
                            ]);
                        }
                        catch (handlerError) {
                            this.logger?.(`[event-bus] failed to process message on topic ${topic}: ${toErrorMessage(handlerError)}`);
                        }
                    }
                    catch (error) {
                        this.logger?.(`[event-bus] message processing error: ${toErrorMessage(error)}`);
                    }
                }
            }
            catch (error) {
                this.logger?.(`[event-bus] subscription closed with error on topic ${topic}: ${toErrorMessage(error)}`);
            }
            finally {
                this.subscriptions.delete(subscription);
            }
        })();
    }
    async close() {
        this.fallbackUnsubscribers.forEach((unsubscribe) => unsubscribe());
        this.fallbackUnsubscribers.clear();
        this.subscriptions.forEach((subscription) => subscription.unsubscribe());
        this.subscriptions.clear();
        if (!this.connectionPromise || !this.connection) {
            this.setConnectionHealth('disconnected');
            return;
        }
        const connection = this.connection;
        try {
            await Promise.race([
                connection.drain(),
                (async () => {
                    await delay(1500);
                    throw new Error('drain timeout');
                })(),
            ]);
            await Promise.race([connection.closed(), delay(1000)]);
        }
        catch (error) {
            this.logger?.(`[event-bus] close degraded: ${toErrorMessage(error)}`);
            try {
                connection.close();
                await Promise.race([connection.closed(), delay(500)]);
            }
            catch (closeError) {
                this.logger?.(`[event-bus] force close failed: ${toErrorMessage(closeError)}`);
            }
        }
        finally {
            this.connection = null;
            this.connectionPromise = null;
            this.setConnectionHealth('disconnected');
            if (this.transport !== 'in-memory') {
                this.transport = 'unknown';
            }
        }
    }
    getTransport() {
        return this.transport;
    }
    getConnectionHealth() {
        return this.connectionHealth;
    }
}
export function createEventBusClient(options = {}) {
    return new LifeOSEventBus(options);
}
export async function bootstrapStreams(options = {}) {
    const servers = normalizeServers(options.servers, options.env);
    const connection = await connect({
        servers,
        name: options.name ?? 'lifeos-bootstrap-streams',
        timeout: options.timeoutMs ?? 2000,
        maxReconnectAttempts: options.maxReconnectAttempts ?? 0,
    });
    await connection.drain();
    await connection.closed();
}
