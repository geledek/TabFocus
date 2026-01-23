/**
 * Chrome-supported tab group colors
 */
export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan';

/**
 * Represents a single browser tab
 */
export interface Tab {
  /** Chrome tab ID */
  id: number;
  /** Tab URL */
  url: string;
  /** Tab title */
  title: string;
  /** Favicon URL */
  favIconUrl: string;
  /** Whether the tab is suspended (memory saver) */
  suspended: boolean;
  /** Whether this tab is pinned */
  pinned?: boolean;
  /** Whether this tab is active */
  active?: boolean;
}

/**
 * Represents a tab group
 */
export interface TabGroup {
  /** Internal unique identifier */
  id: string;
  /** Chrome's tab group ID (-1 for ungrouped) */
  chromeGroupId: number;
  /** Group display name */
  name: string;
  /** Group color */
  color: TabGroupColor;
  /** Tabs in this group */
  tabs: Tab[];
  /** Whether the group is collapsed in Chrome */
  collapsed: boolean;
  /** When the group was created */
  createdAt: number;
}

/**
 * Represents a saved session
 */
export interface Session {
  /** Unique session identifier */
  id: string;
  /** User-defined session name */
  name: string;
  /** Tab groups in this session */
  groups: TabGroup[];
  /** When the session was created */
  createdAt: number;
  /** Total number of tabs in the session */
  tabCount: number;
}

/**
 * Extension settings
 */
export interface Settings {
  /** Enable "view one group at a time" feature */
  viewOneGroupAtATime: boolean;
  /** Enable automatic session saving */
  autoSaveEnabled: boolean;
  /** Auto-save interval in seconds */
  autoSaveInterval: number;
  /** Automatically group tabs by domain */
  autoGroupByDomain: boolean;
  /** Tab suspension timeout in minutes (0 = disabled) */
  suspensionTimeout: number;
  /** Domains that should never be suspended */
  suspensionWhitelist: string[];
  /** Show tab count on extension badge */
  showTabCountBadge: boolean;
  /** Maximum number of saved sessions */
  maxSessions: number;
  /** Handle ungrouped tabs when switching groups */
  showUngroupedTabs: boolean;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = {
  viewOneGroupAtATime: true,
  autoSaveEnabled: true,
  autoSaveInterval: 30,
  autoGroupByDomain: false,
  suspensionTimeout: 30,
  suspensionWhitelist: [],
  showTabCountBadge: true,
  maxSessions: 20,
  showUngroupedTabs: true,
};

/**
 * Storage schema for persisting extension data
 */
export interface StorageData {
  /** Saved tab groups */
  groups: TabGroup[];
  /** Saved sessions */
  sessions: Session[];
  /** Extension settings */
  settings: Settings;
  /** Currently active group ID (null = show all) */
  activeGroupId: string | null;
  /** Last save timestamp */
  lastSaveTime: number;
}

/**
 * Message types for communication between popup, background, and content scripts
 */
export type MessageType =
  | 'GET_GROUPS'
  | 'CREATE_GROUP'
  | 'DELETE_GROUP'
  | 'RENAME_GROUP'
  | 'SWITCH_GROUP'
  | 'SHOW_ALL_GROUPS'
  | 'HIDE_OTHER_GROUPS'
  | 'SAVE_SESSION'
  | 'RESTORE_SESSION'
  | 'DELETE_SESSION'
  | 'GET_SESSIONS'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'SEARCH_TABS'
  | 'CLOSE_TAB'
  | 'MOVE_TAB'
  | 'GET_DUPLICATES'
  | 'MERGE_DUPLICATES'
  | 'AUTO_GROUP_BY_DOMAIN'
  | 'SUSPEND_TAB'
  | 'UNSUSPEND_TAB'
  | 'GET_SUSPENDED_TABS';

/**
 * Base message structure
 */
export interface Message {
  type: MessageType;
  payload?: unknown;
}

/**
 * Response structure
 */
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Search result item
 */
export interface SearchResult {
  tab: Tab;
  groupId: string;
  groupName: string;
  groupColor: TabGroupColor;
  matchType: 'title' | 'url';
  matchScore: number;
}

/**
 * Duplicate tab info
 */
export interface DuplicateInfo {
  url: string;
  tabs: Array<{
    tab: Tab;
    groupId: string;
    groupName: string;
  }>;
}
