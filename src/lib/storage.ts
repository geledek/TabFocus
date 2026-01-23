import {
  StorageData,
  Settings,
  TabGroup,
  Session,
  DEFAULT_SETTINGS,
} from '../types';

/**
 * Default storage data
 */
const DEFAULT_STORAGE_DATA: StorageData = {
  groups: [],
  sessions: [],
  settings: DEFAULT_SETTINGS,
  activeGroupId: null,
  lastSaveTime: 0,
};

/**
 * Storage wrapper for chrome.storage.local
 */
export const storage = {
  /**
   * Get all storage data
   */
  async getAll(): Promise<StorageData> {
    const data = await chrome.storage.local.get(null);
    return {
      ...DEFAULT_STORAGE_DATA,
      ...data,
    };
  },

  /**
   * Get specific storage key
   */
  async get<K extends keyof StorageData>(key: K): Promise<StorageData[K]> {
    const data = await chrome.storage.local.get(key);
    return data[key] ?? DEFAULT_STORAGE_DATA[key];
  },

  /**
   * Set storage data
   */
  async set<K extends keyof StorageData>(
    key: K,
    value: StorageData[K]
  ): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },

  /**
   * Update multiple storage keys
   */
  async setMultiple(data: Partial<StorageData>): Promise<void> {
    await chrome.storage.local.set(data);
  },

  /**
   * Get settings
   */
  async getSettings(): Promise<Settings> {
    return this.get('settings');
  },

  /**
   * Update settings
   */
  async updateSettings(updates: Partial<Settings>): Promise<Settings> {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    await this.set('settings', updated);
    return updated;
  },

  /**
   * Get saved groups
   */
  async getGroups(): Promise<TabGroup[]> {
    return this.get('groups');
  },

  /**
   * Save groups
   */
  async saveGroups(groups: TabGroup[]): Promise<void> {
    await this.setMultiple({
      groups,
      lastSaveTime: Date.now(),
    });
  },

  /**
   * Get active group ID
   */
  async getActiveGroupId(): Promise<string | null> {
    return this.get('activeGroupId');
  },

  /**
   * Set active group ID
   */
  async setActiveGroupId(groupId: string | null): Promise<void> {
    await this.set('activeGroupId', groupId);
  },

  /**
   * Get sessions
   */
  async getSessions(): Promise<Session[]> {
    return this.get('sessions');
  },

  /**
   * Save session
   */
  async saveSession(session: Session): Promise<void> {
    const sessions = await this.getSessions();
    const settings = await this.getSettings();

    // Add to beginning of list
    sessions.unshift(session);

    // Trim to max sessions
    if (sessions.length > settings.maxSessions) {
      sessions.length = settings.maxSessions;
    }

    await this.set('sessions', sessions);
  },

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessions = await this.getSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    await this.set('sessions', filtered);
  },

  /**
   * Get storage usage info
   */
  async getStorageInfo(): Promise<{
    bytesUsed: number;
    quota: number;
    percentUsed: number;
  }> {
    const bytesUsed = await chrome.storage.local.getBytesInUse(null);
    const quota = chrome.storage.local.QUOTA_BYTES;
    return {
      bytesUsed,
      quota,
      percentUsed: (bytesUsed / quota) * 100,
    };
  },

  /**
   * Clear all storage data
   */
  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  },

  /**
   * Export all data as JSON
   */
  async exportData(): Promise<string> {
    const data = await this.getAll();
    return JSON.stringify(data, null, 2);
  },

  /**
   * Import data from JSON
   */
  async importData(jsonString: string): Promise<void> {
    const data = JSON.parse(jsonString) as Partial<StorageData>;
    await this.setMultiple(data);
  },
};
