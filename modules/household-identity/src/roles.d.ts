type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';
export declare function canPerform(role: HouseholdRole, action: string): boolean;
export {};
