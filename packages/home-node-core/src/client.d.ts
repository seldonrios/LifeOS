import { type HomeMode, type HomeNodeHome, type HomeNodeSurface, type HomeNodeSurfaceRegistered, type HomeNodeZone, type HomeStateSnapshot, type SurfaceCapability, type SurfaceKind, type SurfaceTrustLevel } from '@lifeos/contracts';
export interface HomeStateSnapshotRow {
    id: string;
    household_id: string;
    home_mode: HomeMode;
    occupancy_summary_json: string;
    active_routines_json: string;
    adapter_health_json: string;
    snapshot_at: string;
    updated_at: string;
}
export interface HomeNodeHomeRow {
    home_id: string;
    household_id: string;
    name: string;
    timezone: string;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    routine_profile: string | null;
}
export interface HomeNodeZoneRow {
    zone_id: string;
    home_id: string;
    name: string;
    type: HomeNodeZone['type'];
}
export interface HomeNodeSurfaceRow {
    surface_id: string;
    zone_id: string;
    home_id: string;
    kind: SurfaceKind;
    trust_level: SurfaceTrustLevel;
    capabilities_json: string;
    active: number;
    registered_at: string;
    last_seen_at: string | null;
}
export interface HomeNodeHomeWrite {
    homeId: string;
    householdId: string;
    name: string;
    timezone: string;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    routineProfile?: string;
    createdAt?: string;
}
export interface HomeNodeZoneWrite {
    zoneId: string;
    homeId: string;
    name: string;
    type: HomeNodeZone['type'];
    createdAt?: string;
}
export interface SurfaceRegistrationWrite {
    surfaceId: string;
    zoneId: string;
    homeId: string;
    kind: SurfaceKind;
    trustLevel: SurfaceTrustLevel;
    capabilities: SurfaceCapability[];
    registeredAt?: string;
    lastSeenAt?: string;
}
export interface SurfaceListFilter {
    householdId?: string;
    homeId?: string;
    zoneId?: string;
    active?: boolean;
}
export interface AmbientActionWrite {
    householdId: string;
    triggerType: string;
    triggerRef?: string;
    decisionSource: string;
    affectedUserIds?: string[];
    outputSurfaceId?: string;
    result: string;
    auditRef?: string;
    createdAt?: string;
}
export interface HomeStateSnapshotWrite {
    householdId: string;
    homeMode: HomeMode;
    occupancySummary: string;
    activeRoutines: string[];
    adapterHealth: 'healthy' | 'degraded' | 'unavailable';
    snapshotAt?: string;
}
export interface HouseholdHomeStateChangedLike {
    householdId: string;
    stateKey: string;
    newValue: unknown;
    consentVerified: boolean;
}
export declare function toBooleanHomeState(value: unknown): boolean;
export declare function resolveHomeModeTransition(event: HouseholdHomeStateChangedLike, currentMode: HomeMode): HomeMode;
export declare function buildNextSnapshot(current: HomeStateSnapshot, event: HouseholdHomeStateChangedLike, now: string): HomeStateSnapshot;
export declare class HomeNodeGraphClient {
    private readonly db;
    constructor(dbPath?: string);
    initializeSchema(): void;
    private ensureFeatureSchema;
    private ensureColumn;
    upsertHome(input: HomeNodeHomeWrite): HomeNodeHome;
    getHomeById(homeId: string): HomeNodeHome | null;
    getHomeByHouseholdId(householdId: string): HomeNodeHome | null;
    upsertZone(input: HomeNodeZoneWrite): HomeNodeZone;
    getZoneById(zoneId: string): HomeNodeZone | null;
    listZonesInHome(homeId: string): HomeNodeZone[];
    registerSurface(input: SurfaceRegistrationWrite): HomeNodeSurfaceRegistered;
    deregisterSurface(surfaceId: string): HomeNodeSurfaceRegistered | null;
    getSurface(surfaceId: string): HomeNodeSurface | null;
    getRegisteredSurface(surfaceId: string): HomeNodeSurfaceRegistered | null;
    listSurfaces(filter?: SurfaceListFilter): HomeNodeSurface[];
    recordSurfaceHeartbeat(surfaceId: string, seenAt?: string): HomeNodeSurface | null;
    listStaleActiveSurfaces(cutoff: string): HomeNodeSurfaceRegistered[];
    markSurfaceInactive(surfaceId: string): boolean;
    private getSurfaceRowWithHousehold;
    upsertHomeStateSnapshot(input: HomeStateSnapshotWrite): HomeStateSnapshot;
    getHomeStateSnapshot(householdId: string): HomeStateSnapshot | null;
    appendAmbientAction(input: AmbientActionWrite): string;
    getSnapshotRowCount(householdId: string): number;
    isHealthy(): boolean;
    close(): void;
}
