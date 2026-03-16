export var ModuleCategory;
(function (ModuleCategory) {
    ModuleCategory["health"] = "health";
    ModuleCategory["production"] = "production";
    ModuleCategory["economics"] = "economics";
    ModuleCategory["hobby"] = "hobby";
    ModuleCategory["automation"] = "automation";
    ModuleCategory["learning"] = "learning";
    ModuleCategory["community"] = "community";
})(ModuleCategory || (ModuleCategory = {}));
export var ModulePermission;
(function (ModulePermission) {
    ModulePermission["LifeGraphRead"] = "life_graph_read";
    ModulePermission["LifeGraphWrite"] = "life_graph_write";
    ModulePermission["CalendarRead"] = "calendar_read";
    ModulePermission["CalendarWrite"] = "calendar_write";
    ModulePermission["EventPublish"] = "event_publish";
    ModulePermission["EventSubscribe"] = "event_subscribe";
    ModulePermission["DeviceControl"] = "device_control";
    ModulePermission["LlmInvoke"] = "llm_invoke";
    ModulePermission["NotificationSend"] = "notification_send";
})(ModulePermission || (ModulePermission = {}));
