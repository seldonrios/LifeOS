import { z } from 'zod';
import type { GoalPlan, LifeGraphDocument, LifeGraphTask } from './types';
export declare const LIFE_GRAPH_VERSION: "0.1.0";
export declare const IsoDateTimeSchema: z.ZodString;
export declare const DateOnlySchema: z.ZodString;
export declare const LifeGraphTaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        todo: "todo";
        "in-progress": "in-progress";
        done: "done";
    }>>;
    priority: z.ZodDefault<z.ZodNumber>;
    dueDate: z.ZodOptional<z.ZodString>;
    voiceTriggered: z.ZodOptional<z.ZodBoolean>;
    suggestedReschedule: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const EnhancedTaskSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        todo: "todo";
        "in-progress": "in-progress";
        done: "done";
    }>>;
    priority: z.ZodDefault<z.ZodNumber>;
    dueDate: z.ZodOptional<z.ZodString>;
    voiceTriggered: z.ZodOptional<z.ZodBoolean>;
    suggestedReschedule: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const CalendarEventSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    start: z.ZodString;
    end: z.ZodString;
    attendees: z.ZodOptional<z.ZodArray<z.ZodString>>;
    location: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<{
        confirmed: "confirmed";
        tentative: "tentative";
        cancelled: "cancelled";
    }>>;
}, z.core.$strict>;
export declare const NoteSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    content: z.ZodString;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    voiceTriggered: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodString;
}, z.core.$strict>;
export declare const ResearchResultSchema: z.ZodObject<{
    id: z.ZodString;
    threadId: z.ZodDefault<z.ZodString>;
    query: z.ZodString;
    summary: z.ZodString;
    conversationContext: z.ZodDefault<z.ZodArray<z.ZodString>>;
    sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
    savedAt: z.ZodString;
}, z.core.$strict>;
export declare const WeatherSnapshotSchema: z.ZodObject<{
    id: z.ZodString;
    location: z.ZodString;
    forecast: z.ZodString;
    timestamp: z.ZodString;
}, z.core.$strict>;
export declare const NewsDigestSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    summary: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
    read: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const EmailDigestSchema: z.ZodObject<{
    id: z.ZodString;
    subject: z.ZodString;
    from: z.ZodString;
    summary: z.ZodString;
    messageId: z.ZodString;
    receivedAt: z.ZodString;
    read: z.ZodDefault<z.ZodBoolean>;
    accountLabel: z.ZodString;
}, z.core.$strict>;
export declare const HealthMetricEntrySchema: z.ZodObject<{
    id: z.ZodString;
    metric: z.ZodString;
    value: z.ZodNumber;
    unit: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    loggedAt: z.ZodString;
}, z.core.$strict>;
export declare const HealthDailyStreakSchema: z.ZodObject<{
    id: z.ZodString;
    metric: z.ZodString;
    currentStreak: z.ZodNumber;
    longestStreak: z.ZodNumber;
    lastLoggedDate: z.ZodString;
}, z.core.$strict>;
export declare const MemoryEntrySchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        note: "note";
        conversation: "conversation";
        research: "research";
        insight: "insight";
        preference: "preference";
    }>;
    content: z.ZodString;
    embedding: z.ZodArray<z.ZodNumber>;
    timestamp: z.ZodString;
    relatedTo: z.ZodDefault<z.ZodArray<z.ZodString>>;
    threadId: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<{
        system: "system";
        assistant: "assistant";
        user: "user";
    }>>;
    key: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodString>;
    summaryOfThreadId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const GoalPlanSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    deadline: z.ZodDefault<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        status: z.ZodDefault<z.ZodEnum<{
            todo: "todo";
            "in-progress": "in-progress";
            done: "done";
        }>>;
        priority: z.ZodDefault<z.ZodNumber>;
        dueDate: z.ZodOptional<z.ZodString>;
        voiceTriggered: z.ZodOptional<z.ZodBoolean>;
        suggestedReschedule: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    createdAt: z.ZodString;
}, z.core.$strict>;
export declare const LifeGraphDocumentSchema: z.ZodObject<{
    version: z.ZodLiteral<"0.1.0">;
    updatedAt: z.ZodString;
    plans: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        deadline: z.ZodDefault<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
        tasks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            status: z.ZodDefault<z.ZodEnum<{
                todo: "todo";
                "in-progress": "in-progress";
                done: "done";
            }>>;
            priority: z.ZodDefault<z.ZodNumber>;
            dueDate: z.ZodOptional<z.ZodString>;
            voiceTriggered: z.ZodOptional<z.ZodBoolean>;
            suggestedReschedule: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    calendarEvents: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        start: z.ZodString;
        end: z.ZodString;
        attendees: z.ZodOptional<z.ZodArray<z.ZodString>>;
        location: z.ZodOptional<z.ZodString>;
        status: z.ZodDefault<z.ZodEnum<{
            confirmed: "confirmed";
            tentative: "tentative";
            cancelled: "cancelled";
        }>>;
    }, z.core.$strict>>>;
    notes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        content: z.ZodString;
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        voiceTriggered: z.ZodDefault<z.ZodBoolean>;
        createdAt: z.ZodString;
    }, z.core.$strict>>>;
    researchResults: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        threadId: z.ZodDefault<z.ZodString>;
        query: z.ZodString;
        summary: z.ZodString;
        conversationContext: z.ZodDefault<z.ZodArray<z.ZodString>>;
        sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
        savedAt: z.ZodString;
    }, z.core.$strict>>>;
    weatherSnapshots: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        location: z.ZodString;
        forecast: z.ZodString;
        timestamp: z.ZodString;
    }, z.core.$strict>>>;
    newsDigests: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        summary: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        read: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>>;
    emailDigests: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        subject: z.ZodString;
        from: z.ZodString;
        summary: z.ZodString;
        messageId: z.ZodString;
        receivedAt: z.ZodString;
        read: z.ZodDefault<z.ZodBoolean>;
        accountLabel: z.ZodString;
    }, z.core.$strict>>>;
    healthMetricEntries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        metric: z.ZodString;
        value: z.ZodNumber;
        unit: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
        loggedAt: z.ZodString;
    }, z.core.$strict>>>;
    healthDailyStreaks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        metric: z.ZodString;
        currentStreak: z.ZodNumber;
        longestStreak: z.ZodNumber;
        lastLoggedDate: z.ZodString;
    }, z.core.$strict>>>;
    memory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            note: "note";
            conversation: "conversation";
            research: "research";
            insight: "insight";
            preference: "preference";
        }>;
        content: z.ZodString;
        embedding: z.ZodArray<z.ZodNumber>;
        timestamp: z.ZodString;
        relatedTo: z.ZodDefault<z.ZodArray<z.ZodString>>;
        threadId: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodEnum<{
            system: "system";
            assistant: "assistant";
            user: "user";
        }>>;
        key: z.ZodOptional<z.ZodString>;
        value: z.ZodOptional<z.ZodString>;
        summaryOfThreadId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    captureEntries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        type: z.ZodEnum<{
            text: "text";
            voice: "voice";
        }>;
        capturedAt: z.ZodString;
        source: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            pending: "pending";
            triaged: "triaged";
        }>;
        metadata: z.ZodOptional<z.ZodObject<{
            scope: z.ZodOptional<z.ZodLiteral<"household">>;
            householdId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodEnum<{
                ha_bridge: "ha_bridge";
                mobile: "mobile";
                ha_satellite: "ha_satellite";
            }>>;
            sourceDeviceId: z.ZodOptional<z.ZodString>;
            targetHint: z.ZodOptional<z.ZodEnum<{
                shopping: "shopping";
                chore: "chore";
                reminder: "reminder";
                note: "note";
                unknown: "unknown";
            }>>;
        }, z.core.$strip>>;
    }, z.core.$strict>>>;
    plannedActions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        dueDate: z.ZodOptional<z.ZodString>;
        reminderAt: z.ZodOptional<z.ZodString>;
        completedAt: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            todo: "todo";
            done: "done";
            deferred: "deferred";
        }>;
        goalId: z.ZodOptional<z.ZodString>;
        sourceCapture: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    reminderEvents: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        actionId: z.ZodString;
        scheduledFor: z.ZodString;
        firedAt: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            scheduled: "scheduled";
            fired: "fired";
            acknowledged: "acknowledged";
        }>;
    }, z.core.$strict>>>;
    system: z.ZodDefault<z.ZodObject<{
        meta: z.ZodDefault<z.ZodObject<{
            riskRadar: z.ZodOptional<z.ZodObject<{
                overallHealth: z.ZodEnum<{
                    green: "green";
                    yellow: "yellow";
                    red: "red";
                }>;
                lastUpdated: z.ZodString;
                risks: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    name: z.ZodString;
                    status: z.ZodEnum<{
                        green: "green";
                        yellow: "yellow";
                        red: "red";
                    }>;
                    lastChecked: z.ZodString;
                    details: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                recommendations: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>>;
            schemaVersion: z.ZodOptional<z.ZodString>;
            migrationHistory: z.ZodDefault<z.ZodArray<z.ZodObject<{
                fromVersion: z.ZodString;
                toVersion: z.ZodString;
                appliedAt: z.ZodString;
                description: z.ZodString;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const LifeGraphSchema: z.ZodObject<{
    version: z.ZodLiteral<"0.1.0">;
    updatedAt: z.ZodString;
    plans: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        deadline: z.ZodDefault<z.ZodUnion<readonly [z.ZodString, z.ZodNull]>>;
        tasks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            status: z.ZodDefault<z.ZodEnum<{
                todo: "todo";
                "in-progress": "in-progress";
                done: "done";
            }>>;
            priority: z.ZodDefault<z.ZodNumber>;
            dueDate: z.ZodOptional<z.ZodString>;
            voiceTriggered: z.ZodOptional<z.ZodBoolean>;
            suggestedReschedule: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        createdAt: z.ZodString;
    }, z.core.$strict>>;
    calendarEvents: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        start: z.ZodString;
        end: z.ZodString;
        attendees: z.ZodOptional<z.ZodArray<z.ZodString>>;
        location: z.ZodOptional<z.ZodString>;
        status: z.ZodDefault<z.ZodEnum<{
            confirmed: "confirmed";
            tentative: "tentative";
            cancelled: "cancelled";
        }>>;
    }, z.core.$strict>>>;
    notes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        content: z.ZodString;
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        voiceTriggered: z.ZodDefault<z.ZodBoolean>;
        createdAt: z.ZodString;
    }, z.core.$strict>>>;
    researchResults: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        threadId: z.ZodDefault<z.ZodString>;
        query: z.ZodString;
        summary: z.ZodString;
        conversationContext: z.ZodDefault<z.ZodArray<z.ZodString>>;
        sources: z.ZodOptional<z.ZodArray<z.ZodString>>;
        savedAt: z.ZodString;
    }, z.core.$strict>>>;
    weatherSnapshots: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        location: z.ZodString;
        forecast: z.ZodString;
        timestamp: z.ZodString;
    }, z.core.$strict>>>;
    newsDigests: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        summary: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        read: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>>;
    emailDigests: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        subject: z.ZodString;
        from: z.ZodString;
        summary: z.ZodString;
        messageId: z.ZodString;
        receivedAt: z.ZodString;
        read: z.ZodDefault<z.ZodBoolean>;
        accountLabel: z.ZodString;
    }, z.core.$strict>>>;
    healthMetricEntries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        metric: z.ZodString;
        value: z.ZodNumber;
        unit: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
        loggedAt: z.ZodString;
    }, z.core.$strict>>>;
    healthDailyStreaks: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        metric: z.ZodString;
        currentStreak: z.ZodNumber;
        longestStreak: z.ZodNumber;
        lastLoggedDate: z.ZodString;
    }, z.core.$strict>>>;
    memory: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            note: "note";
            conversation: "conversation";
            research: "research";
            insight: "insight";
            preference: "preference";
        }>;
        content: z.ZodString;
        embedding: z.ZodArray<z.ZodNumber>;
        timestamp: z.ZodString;
        relatedTo: z.ZodDefault<z.ZodArray<z.ZodString>>;
        threadId: z.ZodOptional<z.ZodString>;
        role: z.ZodOptional<z.ZodEnum<{
            system: "system";
            assistant: "assistant";
            user: "user";
        }>>;
        key: z.ZodOptional<z.ZodString>;
        value: z.ZodOptional<z.ZodString>;
        summaryOfThreadId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    captureEntries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodString;
        type: z.ZodEnum<{
            text: "text";
            voice: "voice";
        }>;
        capturedAt: z.ZodString;
        source: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            pending: "pending";
            triaged: "triaged";
        }>;
        metadata: z.ZodOptional<z.ZodObject<{
            scope: z.ZodOptional<z.ZodLiteral<"household">>;
            householdId: z.ZodOptional<z.ZodString>;
            source: z.ZodOptional<z.ZodEnum<{
                ha_bridge: "ha_bridge";
                mobile: "mobile";
                ha_satellite: "ha_satellite";
            }>>;
            sourceDeviceId: z.ZodOptional<z.ZodString>;
            targetHint: z.ZodOptional<z.ZodEnum<{
                shopping: "shopping";
                chore: "chore";
                reminder: "reminder";
                note: "note";
                unknown: "unknown";
            }>>;
        }, z.core.$strip>>;
    }, z.core.$strict>>>;
    plannedActions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        dueDate: z.ZodOptional<z.ZodString>;
        reminderAt: z.ZodOptional<z.ZodString>;
        completedAt: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            todo: "todo";
            done: "done";
            deferred: "deferred";
        }>;
        goalId: z.ZodOptional<z.ZodString>;
        sourceCapture: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>>;
    reminderEvents: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        actionId: z.ZodString;
        scheduledFor: z.ZodString;
        firedAt: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            cancelled: "cancelled";
            scheduled: "scheduled";
            fired: "fired";
            acknowledged: "acknowledged";
        }>;
    }, z.core.$strict>>>;
    system: z.ZodDefault<z.ZodObject<{
        meta: z.ZodDefault<z.ZodObject<{
            riskRadar: z.ZodOptional<z.ZodObject<{
                overallHealth: z.ZodEnum<{
                    green: "green";
                    yellow: "yellow";
                    red: "red";
                }>;
                lastUpdated: z.ZodString;
                risks: z.ZodArray<z.ZodObject<{
                    id: z.ZodNumber;
                    name: z.ZodString;
                    status: z.ZodEnum<{
                        green: "green";
                        yellow: "yellow";
                        red: "red";
                    }>;
                    lastChecked: z.ZodString;
                    details: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>;
                recommendations: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>>;
            schemaVersion: z.ZodOptional<z.ZodString>;
            migrationHistory: z.ZodDefault<z.ZodArray<z.ZodObject<{
                fromVersion: z.ZodString;
                toVersion: z.ZodString;
                appliedAt: z.ZodString;
                description: z.ZodString;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const LegacyGoalPlanRecordSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodString;
    input: z.ZodString;
    plan: z.ZodUnknown;
}, z.core.$strict>;
export declare const LegacyVersionedLifeGraphDocumentSchema: z.ZodObject<{
    version: z.ZodLiteral<"0.1.0">;
    updatedAt: z.ZodString;
    goals: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodString;
        input: z.ZodString;
        plan: z.ZodUnknown;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const LegacyLocalLifeGraphSchema: z.ZodObject<{
    goals: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        createdAt: z.ZodString;
        input: z.ZodString;
        plan: z.ZodUnknown;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type ParsedGoalPlan = z.infer<typeof GoalPlanSchema>;
export type ParsedLifeGraphTask = z.infer<typeof LifeGraphTaskSchema>;
export declare function parseVersionedLifeGraphDocument(value: unknown): LifeGraphDocument;
export declare function parseGoalPlan(value: unknown): GoalPlan;
export declare function parseTask(value: unknown): LifeGraphTask;
export declare function isDateOnly(value: unknown): value is string;
