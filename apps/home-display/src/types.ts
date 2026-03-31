export type DisplayMode = 'kitchen' | 'hallway';
export type SurfaceKind =
  | 'kitchen_display'
  | 'hallway_display'
  | 'living_room_display'
  | 'desk_display'
  | 'voice_endpoint'
  | 'mobile_app';

export interface DisplayConfig {
  homeNodeUrl: string;
  surfaceId: string;
  surfaceKind: SurfaceKind;
  householdId: string;
  surfaceToken: string;
  pollMs: number;
  mode: DisplayMode;
}
