export interface PolicyRequest {
    subject: string;
    action: string;
    resource: string;
    context: Record<string, unknown>;
}
export interface PolicyResult {
    allowed: boolean;
    reason?: string;
    policy_id?: string;
}
export declare const PermissionScope: {
    readonly health_data: "health_data";
    readonly calendar_write: "calendar_write";
    readonly calendar_read: "calendar_read";
    readonly device_control: "device_control";
    readonly external_api: "external_api";
    readonly economics_read: "economics_read";
    readonly economics_write: "economics_write";
    readonly production_read: "production_read";
    readonly production_write: "production_write";
    readonly presence_read: "presence_read";
    readonly llm_access: "llm_access";
    readonly life_graph_read: "life_graph_read";
    readonly life_graph_write: "life_graph_write";
    readonly event_publish: "event_publish";
    readonly event_subscribe: "event_subscribe";
    readonly notification_send: "notification_send";
    readonly llm_invoke: "llm_invoke";
};
export interface PolicyClient {
    evaluatePolicy(request: PolicyRequest): Promise<PolicyResult>;
    checkPermission(scope: string, context: PolicyRequest): boolean;
    /** @deprecated Use evaluatePolicy instead. */
    evaluate(request: PolicyRequest): Promise<PolicyResult>;
}
