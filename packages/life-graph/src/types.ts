export interface Person {
  id: string;
  name: string;
  timezone?: string;
  roles?: string[];
}
export interface Goal {
  id: string;
  title: string;
  status: string;
  priority?: number;
}
export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  dueDate?: string;
  status: string;
}
export interface Plan {
  id: string;
  goalId: string;
  version: number;
  status: string;
}
export interface Task {
  id: string;
  planId?: string;
  title: string;
  status: string;
  dueDate?: string;
}
export interface Project {
  id: string;
  name: string;
  status: string;
}
export interface Event {
  id: string;
  type: string;
  timestamp: string;
  source?: string;
}
export interface Resource {
  id: string;
  name: string;
  category: string;
}
export interface Asset {
  id: string;
  name: string;
  type: string;
  value?: number;
}
export interface Location {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}
export interface Skill {
  id: string;
  name: string;
  level?: number;
}
export interface Community {
  id: string;
  name: string;
  domain?: string;
}
export interface Knowledge {
  id: string;
  title: string;
  topic?: string;
}
export interface Opportunity {
  id: string;
  title: string;
  score?: number;
  status?: string;
}

export interface EntityDefinition {
  entity: string;
  extends?: string;
  properties: Record<string, string>;
}

export interface RelationshipDefinition {
  type: string;
  from: string;
  to: string;
  properties?: Record<string, string>;
}

export interface PropertyExtension {
  target: string;
  property: string;
  type: string;
  required?: boolean;
}

export interface ReasoningRule {
  id: string;
  description: string;
  condition: string;
  effect: string;
}

export interface ModuleSchema {
  meta: {
    id: string;
    version: string;
    module: string;
  };
  entities: EntityDefinition[];
  relationships: RelationshipDefinition[];
  properties: PropertyExtension[];
  rules?: ReasoningRule[];
}

export interface LifeGraphClient {
  query<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T[]>;
  getNode<T = unknown>(id: string): Promise<T | null>;
  createNode<T extends Record<string, unknown>>(label: string, data: T): Promise<string>;
  createRelationship(
    fromId: string,
    toId: string,
    relationshipType: string,
    properties?: Record<string, unknown>,
  ): Promise<void>;
  loadGraph(): Promise<LifeGraphDocument>;
  saveGraph(graph: LifeGraphDocument): Promise<void>;
  appendNote(
    note: Omit<LifeGraphNote, 'id' | 'createdAt'> &
      Partial<Pick<LifeGraphNote, 'id' | 'createdAt'>>,
  ): Promise<LifeGraphNote>;
  appendResearchResult(
    result: Omit<LifeGraphResearchResult, 'id' | 'savedAt' | 'threadId'> &
      Partial<Pick<LifeGraphResearchResult, 'id' | 'savedAt' | 'threadId'>>,
  ): Promise<LifeGraphResearchResult>;
  saveResearchResult(
    result: Omit<LifeGraphResearchResult, 'id' | 'savedAt' | 'threadId'> &
      Partial<Pick<LifeGraphResearchResult, 'id' | 'savedAt' | 'threadId'>>,
  ): Promise<LifeGraphResearchResult>;
  getResearchThread(threadId: string): Promise<LifeGraphResearchResult | null>;
  appendWeatherSnapshot(
    snapshot: Omit<LifeGraphWeatherSnapshot, 'id' | 'timestamp'> &
      Partial<Pick<LifeGraphWeatherSnapshot, 'id' | 'timestamp'>>,
  ): Promise<LifeGraphWeatherSnapshot>;
  getLatestWeatherSnapshot(location?: string): Promise<LifeGraphWeatherSnapshot | null>;
  appendNewsDigest(
    digest: Omit<LifeGraphNewsDigest, 'id' | 'read'> &
      Partial<Pick<LifeGraphNewsDigest, 'id' | 'read'>>,
  ): Promise<LifeGraphNewsDigest>;
  getLatestNewsDigest(topic?: string): Promise<LifeGraphNewsDigest | null>;
  searchNotes(query: string, options?: LifeGraphNoteSearchOptions): Promise<LifeGraphNote[]>;
  appendMemoryEntry(
    entry: Omit<LifeGraphMemoryEntry, 'id' | 'timestamp' | 'embedding'> &
      Partial<Pick<LifeGraphMemoryEntry, 'id' | 'timestamp' | 'embedding'>>,
  ): Promise<LifeGraphMemoryEntry>;
  searchMemory(
    query: string,
    options?: LifeGraphMemorySearchOptions,
  ): Promise<LifeGraphMemorySearchResult[]>;
  applyUpdates(updates: LifeGraphUpdate[]): Promise<void>;
  registerModuleSchema(schema: ModuleSchema): Promise<void>;
  getSummary(): Promise<LifeGraphSummary>;
  generateReview(period?: LifeGraphReviewPeriod): Promise<LifeGraphReviewInsights>;
}

export interface GoalPlanRecord<TPlan = Record<string, unknown>> {
  id: string;
  createdAt: string;
  input: string;
  plan: TPlan;
}

export interface LocalLifeGraph<TPlan = Record<string, unknown>> {
  goals: Array<GoalPlanRecord<TPlan>>;
}

export interface LifeGraphTask {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: number;
  dueDate?: string;
  voiceTriggered?: boolean;
  suggestedReschedule?: string;
}

export interface LifeGraphCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
  location?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface LifeGraphNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  voiceTriggered: boolean;
  createdAt: string;
}

export interface LifeGraphResearchResult {
  id: string;
  threadId: string;
  query: string;
  summary: string;
  conversationContext?: string[];
  sources?: string[];
  savedAt: string;
}

export interface LifeGraphWeatherSnapshot {
  id: string;
  location: string;
  forecast: string;
  timestamp: string;
}

export interface LifeGraphNewsDigest {
  id: string;
  title: string;
  summary: string;
  sources: string[];
  read: boolean;
}

export interface LifeGraphNoteSearchOptions {
  sinceDays?: number;
  limit?: number;
}

export type LifeGraphMemoryType = 'conversation' | 'research' | 'note' | 'insight';

export interface LifeGraphMemoryEntry {
  id: string;
  type: LifeGraphMemoryType;
  content: string;
  embedding: number[];
  timestamp: string;
  relatedTo: string[];
}

export interface LifeGraphMemorySearchOptions {
  type?: LifeGraphMemoryType;
  limit?: number;
  minScore?: number;
}

export interface LifeGraphMemorySearchResult extends LifeGraphMemoryEntry {
  score: number;
}

export type LifeGraphUpdate = {
  op: 'append_memory';
  entry: Omit<LifeGraphMemoryEntry, 'id' | 'timestamp' | 'embedding'> &
    Partial<Pick<LifeGraphMemoryEntry, 'id' | 'timestamp' | 'embedding'>>;
};

export interface GoalPlan {
  id: string;
  title: string;
  description: string;
  deadline: string | null;
  tasks: LifeGraphTask[];
  createdAt: string;
}

export interface GoalPlanSource {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  deadline?: unknown;
  tasks?: unknown;
  subtasks?: unknown;
  createdAt?: unknown;
}

export interface LifeGraphDocument {
  version: '0.1.0';
  updatedAt: string;
  plans: GoalPlan[];
  calendarEvents?: LifeGraphCalendarEvent[];
  notes?: LifeGraphNote[];
  researchResults?: LifeGraphResearchResult[];
  weatherSnapshots?: LifeGraphWeatherSnapshot[];
  newsDigests?: LifeGraphNewsDigest[];
  memory?: LifeGraphMemoryEntry[];
}

export interface LifeGraphSummary {
  version: '0.1.0';
  totalPlans: number;
  totalGoals: number;
  updatedAt: string;
  latestPlanCreatedAt: string | null;
  latestGoalCreatedAt: string | null;
  recentPlanTitles: string[];
  recentGoalTitles: string[];
  activeGoals: LifeGraphActiveGoalSummary[];
}

export interface LifeGraphActiveGoalSummary {
  id: string;
  title: string;
  totalTasks: number;
  completedTasks: number;
  priority: number;
  deadline: string | null;
}

export type LifeGraphReviewPeriod = 'daily' | 'weekly';

export interface LifeGraphReviewInsights {
  period: LifeGraphReviewPeriod;
  wins: string[];
  nextActions: string[];
  generatedAt: string;
  source: 'llm' | 'heuristic';
}
