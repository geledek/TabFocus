import {
  TabGroup,
  Tab,
  TabGroupColor,
  Message,
  MessageResponse,
  Settings,
  Session,
} from '../types';
import { storage } from '../lib/storage';
import { logger } from '../lib/logger';
import { generateId, debounce, normalizeUrl, getColorFromFaviconWithFallback } from '../lib/utils';

const log = logger.scope('ServiceWorker');

// State
let cachedGroups: TabGroup[] = [];
let activeGroupId: string | null = null;
let hiddenTabIds: Set<number> = new Set();
let tabLastActiveTime: Map<number, number> = new Map();
let suspendedTabs: Map<number, { originalUrl: string; title: string; favicon: string }> = new Map();

/**
 * Initialize the service worker
 */
async function initialize(): Promise<void> {
  log.info('Initializing service worker');

  // Load saved state
  const data = await storage.getAll();
  activeGroupId = data.activeGroupId;

  // Set up auto-save alarm
  const settings = await storage.getSettings();
  if (settings.autoSaveEnabled) {
    await setupAutoSaveAlarm(settings.autoSaveInterval);
  }

  // Set up idle check alarm for tab suspension (every 1 minute)
  if (settings.suspensionTimeout > 0) {
    await chrome.alarms.create('idle-check', { periodInMinutes: 1 });
  }

  // Update badge
  await updateBadge();

  log.info('Service worker initialized');
}

/**
 * Set up auto-save alarm
 */
async function setupAutoSaveAlarm(intervalSeconds: number): Promise<void> {
  await chrome.alarms.clear('auto-save');
  await chrome.alarms.create('auto-save', {
    periodInMinutes: intervalSeconds / 60,
  });
}

/**
 * Get all tab groups from Chrome
 */
async function getTabGroups(): Promise<TabGroup[]> {
  const [tabs, chromeGroups] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
  ]);

  const groups: TabGroup[] = [];
  const groupMap = new Map<number, Tab[]>();
  const ungroupedTabs: Tab[] = [];

  // Organize tabs by group
  for (const tab of tabs) {
    const tabData: Tab = {
      id: tab.id!,
      url: tab.url || '',
      title: tab.title || 'Untitled',
      favIconUrl: tab.favIconUrl || '',
      suspended: false,
      pinned: tab.pinned,
      active: tab.active,
    };

    if (tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      const existing = groupMap.get(tab.groupId) || [];
      existing.push(tabData);
      groupMap.set(tab.groupId, existing);
    } else {
      ungroupedTabs.push(tabData);
    }
  }

  // Create TabGroup objects for Chrome groups
  for (const chromeGroup of chromeGroups) {
    const groupTabs = groupMap.get(chromeGroup.id) || [];
    groups.push({
      id: `chrome-${chromeGroup.id}`,
      chromeGroupId: chromeGroup.id,
      name: chromeGroup.title || 'Unnamed Group',
      color: chromeGroup.color as TabGroupColor,
      tabs: groupTabs,
      collapsed: chromeGroup.collapsed,
      createdAt: Date.now(),
    });
  }

  // Add ungrouped tabs as a special group
  if (ungroupedTabs.length > 0) {
    groups.push({
      id: 'ungrouped',
      chromeGroupId: -1,
      name: 'Ungrouped',
      color: 'grey',
      tabs: ungroupedTabs,
      collapsed: false,
      createdAt: 0,
    });
  }

  cachedGroups = groups;
  return groups;
}

/**
 * Create a new tab group
 */
async function createGroup(
  name: string,
  color: TabGroupColor
): Promise<TabGroup> {
  // Get current active tab
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!activeTab?.id) {
    throw new Error('No active tab found');
  }

  // Create Chrome group with the active tab
  const groupId = await chrome.tabs.group({ tabIds: [activeTab.id] });

  // Update group properties
  await chrome.tabGroups.update(groupId, {
    title: name,
    color,
  });

  const newGroup: TabGroup = {
    id: `chrome-${groupId}`,
    chromeGroupId: groupId,
    name,
    color,
    tabs: [
      {
        id: activeTab.id,
        url: activeTab.url || '',
        title: activeTab.title || 'Untitled',
        favIconUrl: activeTab.favIconUrl || '',
        suspended: false,
      },
    ],
    collapsed: false,
    createdAt: Date.now(),
  };

  return newGroup;
}

/**
 * Hide all groups except the specified one
 */
async function hideOtherGroups(groupId: string): Promise<void> {
  const groups = await getTabGroups();
  const targetGroup = groups.find((g) => g.id === groupId);

  if (!targetGroup) {
    throw new Error('Group not found');
  }

  const settings = await storage.getSettings();
  hiddenTabIds.clear();

  for (const group of groups) {
    if (group.id === groupId) continue;

    // Skip ungrouped tabs if setting says to show them
    if (group.id === 'ungrouped' && settings.showUngroupedTabs) continue;

    for (const tab of group.tabs) {
      if (!tab.pinned) {
        // Hide tab by moving it to a collapsed state
        await chrome.tabs.update(tab.id, { active: false });
        hiddenTabIds.add(tab.id);
      }
    }

    // Collapse other groups
    if (group.chromeGroupId > 0) {
      await chrome.tabGroups.update(group.chromeGroupId, { collapsed: true });
    }
  }

  // Expand and focus target group
  if (targetGroup.chromeGroupId > 0) {
    await chrome.tabGroups.update(targetGroup.chromeGroupId, {
      collapsed: false,
    });
  }

  // Activate first tab in target group
  if (targetGroup.tabs.length > 0) {
    await chrome.tabs.update(targetGroup.tabs[0].id, { active: true });
  }

  activeGroupId = groupId;
  await storage.setActiveGroupId(groupId);
  await updateBadge();
}

/**
 * Show all groups
 */
async function showAllGroups(): Promise<void> {
  const groups = await getTabGroups();

  for (const group of groups) {
    if (group.chromeGroupId > 0) {
      await chrome.tabGroups.update(group.chromeGroupId, { collapsed: false });
    }
  }

  hiddenTabIds.clear();
  activeGroupId = null;
  await storage.setActiveGroupId(null);
  await updateBadge();
}

/**
 * Close a tab
 */
async function closeTab(tabId: number): Promise<void> {
  await chrome.tabs.remove(tabId);
}

/**
 * Rename a group
 */
async function renameGroup(groupId: string, newName: string): Promise<void> {
  const groups = await getTabGroups();
  const group = groups.find((g) => g.id === groupId);

  if (!group || group.chromeGroupId <= 0) {
    throw new Error('Group not found or cannot be renamed');
  }

  await chrome.tabGroups.update(group.chromeGroupId, { title: newName });
}

/**
 * Delete a group (ungroup all tabs)
 */
async function deleteGroup(groupId: string): Promise<void> {
  const groups = await getTabGroups();
  const group = groups.find((g) => g.id === groupId);

  if (!group || group.chromeGroupId <= 0) {
    throw new Error('Group not found or cannot be deleted');
  }

  // Ungroup all tabs in the group
  const tabIds = group.tabs.map((t) => t.id);
  if (tabIds.length > 0) {
    await chrome.tabs.ungroup(tabIds);
  }
}

/**
 * Auto-group tabs by domain
 */
async function autoGroupByDomain(): Promise<number> {
  const tabs = await chrome.tabs.query({ currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
  const domainMap = new Map<string, { tabIds: number[]; favicon: string | undefined }>();

  // Group tabs by domain
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace(/^www\./, '');
      const existing = domainMap.get(domain) || { tabIds: [], favicon: undefined };
      existing.tabIds.push(tab.id);
      // Keep the first valid favicon
      if (!existing.favicon && tab.favIconUrl) {
        existing.favicon = tab.favIconUrl;
      }
      domainMap.set(domain, existing);
    } catch {
      // Invalid URL, skip
    }
  }

  let groupsCreated = 0;

  // Create groups for domains with multiple tabs
  for (const [domain, { tabIds, favicon }] of domainMap) {
    if (tabIds.length >= 2) {
      // Get color from favicon (with Google favicon service fallback)
      const color = await getColorFromFaviconWithFallback(favicon, domain);

      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: domain,
        color,
      });
      groupsCreated++;
    }
  }

  return groupsCreated;
}

/**
 * Group ungrouped tabs from a specific domain
 */
async function groupTabsFromDomain(domain: string): Promise<boolean> {
  log.info(`[groupTabsFromDomain] Starting for domain: ${domain}`);

  const tabs = await chrome.tabs.query({ currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
  const tabIds: number[] = [];
  let favicon: string | undefined;

  // Find ungrouped tabs matching the domain
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    try {
      const url = new URL(tab.url);
      const tabDomain = url.hostname.replace(/^www\./, '');
      if (tabDomain === domain) {
        tabIds.push(tab.id);
        // Keep the first valid favicon
        if (!favicon && tab.favIconUrl) {
          favicon = tab.favIconUrl;
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  log.info(`[groupTabsFromDomain] Found ${tabIds.length} tabs, favicon: ${favicon?.substring(0, 50) || 'none'}`);

  if (tabIds.length < 2) {
    return false;
  }

  // Get color from favicon (with Google favicon service fallback)
  log.info(`[groupTabsFromDomain] Getting color for domain: ${domain}`);
  const color = await getColorFromFaviconWithFallback(favicon, domain);
  log.info(`[groupTabsFromDomain] Got color: ${color}`);

  // Create a new group with these tabs
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, {
    title: domain,
    color,
  });

  return true;
}

/**
 * Check and auto-group tabs by domain if threshold is reached
 * Called when a tab is created or navigates to a new URL
 */
async function checkAutoGroupByDomain(tabUrl?: string): Promise<void> {
  const settings = await storage.getSettings();

  // Skip if auto-group is disabled
  if (!settings.autoGroupByDomain) {
    return;
  }

  const threshold = settings.autoGroupThreshold || 3;

  // Get all ungrouped tabs
  const tabs = await chrome.tabs.query({ currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
  const domainMap = new Map<string, { tabIds: number[]; favicon: string | undefined }>();

  // Count tabs per domain
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    // Skip chrome:// and extension pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace(/^www\./, '');
      const existing = domainMap.get(domain) || { tabIds: [], favicon: undefined };
      existing.tabIds.push(tab.id);
      // Keep the first valid favicon
      if (!existing.favicon && tab.favIconUrl) {
        existing.favicon = tab.favIconUrl;
      }
      domainMap.set(domain, existing);
    } catch {
      // Invalid URL, skip
    }
  }

  // If a specific URL was provided, prioritize checking that domain
  let targetDomain: string | null = null;
  if (tabUrl) {
    try {
      const url = new URL(tabUrl);
      targetDomain = url.hostname.replace(/^www\./, '');
    } catch {
      // Invalid URL
    }
  }

  // Check if any domain has reached the threshold
  for (const [domain, { tabIds, favicon }] of domainMap) {
    // If we have a target domain, only check that one
    if (targetDomain && domain !== targetDomain) continue;

    if (tabIds.length >= threshold) {
      // Get color from favicon (with Google favicon service fallback)
      const color = await getColorFromFaviconWithFallback(favicon, domain);

      // Create a group for this domain
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, {
        title: domain,
        color,
      });

      log.info(`Auto-grouped ${tabIds.length} tabs from ${domain} with color ${color}`);

      // Only group one domain at a time to avoid overwhelming the user
      break;
    }
  }
}

/**
 * Suspend a tab to save memory
 */
async function suspendTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);

  // Don't suspend pinned, active, or already suspended tabs
  if (
    !tab ||
    tab.pinned ||
    tab.active ||
    !tab.url ||
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.includes('suspended/suspended.html')
  ) {
    return;
  }

  // Check whitelist
  const settings = await storage.getSettings();
  if (settings.suspensionWhitelist.length > 0) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace(/^www\./, '');
      if (settings.suspensionWhitelist.some((d) => domain.includes(d))) {
        return;
      }
    } catch {
      // Invalid URL
    }
  }

  // Store original tab info
  suspendedTabs.set(tabId, {
    originalUrl: tab.url,
    title: tab.title || 'Untitled',
    favicon: tab.favIconUrl || '',
  });

  // Create suspended URL
  const suspendedUrl = chrome.runtime.getURL(
    `suspended/suspended.html?url=${encodeURIComponent(tab.url)}&title=${encodeURIComponent(
      tab.title || 'Untitled'
    )}&favicon=${encodeURIComponent(tab.favIconUrl || '')}`
  );

  // Navigate to suspended page
  await chrome.tabs.update(tabId, { url: suspendedUrl });

  log.info('Suspended tab', tabId);
}

/**
 * Check and suspend idle tabs
 */
async function checkIdleTabs(): Promise<void> {
  const settings = await storage.getSettings();

  if (settings.suspensionTimeout <= 0) {
    return;
  }

  const timeoutMs = settings.suspensionTimeout * 60 * 1000;
  const now = Date.now();

  const tabs = await chrome.tabs.query({ currentWindow: true });

  for (const tab of tabs) {
    if (!tab.id) continue;

    const lastActive = tabLastActiveTime.get(tab.id);

    if (!lastActive) {
      // First time seeing this tab, set current time
      tabLastActiveTime.set(tab.id, now);
      continue;
    }

    if (now - lastActive > timeoutMs) {
      await suspendTab(tab.id);
    }
  }
}

/**
 * Update tab last active time
 */
function updateTabActivity(tabId: number): void {
  tabLastActiveTime.set(tabId, Date.now());
}

/**
 * Get suspended tabs info
 */
async function getSuspendedTabs(): Promise<Array<{ tabId: number; title: string; url: string }>> {
  const result: Array<{ tabId: number; title: string; url: string }> = [];

  for (const [tabId, info] of suspendedTabs) {
    try {
      await chrome.tabs.get(tabId);
      result.push({
        tabId,
        title: info.title,
        url: info.originalUrl,
      });
    } catch {
      // Tab no longer exists
      suspendedTabs.delete(tabId);
    }
  }

  return result;
}

/**
 * Unsuspend a tab
 */
async function unsuspendTab(tabId: number): Promise<void> {
  const info = suspendedTabs.get(tabId);
  if (info) {
    await chrome.tabs.update(tabId, { url: info.originalUrl });
    suspendedTabs.delete(tabId);
    log.info('Unsuspended tab', tabId);
  }
}

/**
 * Search tabs
 */
async function searchTabs(
  query: string
): Promise<Array<{ tab: Tab; groupName: string }>> {
  const groups = await getTabGroups();
  const results: Array<{ tab: Tab; groupName: string }> = [];
  const lowerQuery = query.toLowerCase();

  for (const group of groups) {
    for (const tab of group.tabs) {
      if (
        tab.title.toLowerCase().includes(lowerQuery) ||
        tab.url.toLowerCase().includes(lowerQuery)
      ) {
        results.push({ tab, groupName: group.name });
      }
    }
  }

  return results;
}

/**
 * Save current state as a session
 */
async function saveSession(name: string): Promise<Session> {
  const groups = await getTabGroups();
  const tabCount = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  const session: Session = {
    id: generateId(),
    name,
    groups,
    createdAt: Date.now(),
    tabCount,
  };

  await storage.saveSession(session);
  return session;
}

/**
 * Restore a session
 */
async function restoreSession(
  sessionId: string,
  append: boolean
): Promise<void> {
  const sessions = await storage.getSessions();
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    throw new Error('Session not found');
  }

  if (!append) {
    // Close all existing tabs except the current one
    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const allTabs = await chrome.tabs.query({ currentWindow: true });

    for (const tab of allTabs) {
      if (tab.id !== currentTab?.id) {
        await chrome.tabs.remove(tab.id!);
      }
    }
  }

  // Restore tabs from session
  for (const group of session.groups) {
    if (group.id === 'ungrouped') {
      // Create ungrouped tabs
      for (const tab of group.tabs) {
        await chrome.tabs.create({ url: tab.url });
      }
    } else {
      // Create grouped tabs
      const tabIds: number[] = [];
      for (const tab of group.tabs) {
        const newTab = await chrome.tabs.create({ url: tab.url });
        if (newTab.id) tabIds.push(newTab.id);
      }

      if (tabIds.length > 0) {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: group.name,
          color: group.color,
        });
      }
    }
  }
}

/**
 * Find duplicate tabs
 */
async function findDuplicates(
  ignoreQueryParams: boolean
): Promise<Map<string, Tab[]>> {
  const groups = await getTabGroups();
  const urlMap = new Map<string, Tab[]>();

  for (const group of groups) {
    for (const tab of group.tabs) {
      const normalizedUrl = normalizeUrl(tab.url, ignoreQueryParams);
      const existing = urlMap.get(normalizedUrl) || [];
      existing.push(tab);
      urlMap.set(normalizedUrl, existing);
    }
  }

  // Filter to only duplicates
  const duplicates = new Map<string, Tab[]>();
  for (const [url, tabs] of urlMap) {
    if (tabs.length > 1) {
      duplicates.set(url, tabs);
    }
  }

  return duplicates;
}

/**
 * Update extension badge
 */
async function updateBadge(): Promise<void> {
  const settings = await storage.getSettings();

  if (!settings.showTabCountBadge) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  // If in focus mode, show focus indicator
  if (activeGroupId) {
    const groups = await getTabGroups();
    const activeGroup = groups.find(g => g.id === activeGroupId);
    if (activeGroup) {
      await chrome.action.setBadgeText({ text: `${activeGroup.tabs.length}` });
      await chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' }); // blue for focus mode
      return;
    }
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const count = tabs.length;

  await chrome.action.setBadgeText({ text: count.toString() });

  // Color based on count
  let color = '#1e8e3e'; // green
  if (count >= 30) {
    color = '#d93025'; // red
  } else if (count >= 10) {
    color = '#f9ab00'; // yellow
  }

  await chrome.action.setBadgeBackgroundColor({ color });
}

/**
 * Set up context menus
 */
async function setupContextMenus(): Promise<void> {
  // Remove existing menus first
  await chrome.contextMenus.removeAll();

  // Create context menu for tabs
  chrome.contextMenus.create({
    id: 'tabfocus-new-group',
    title: 'Create New Group from Tab',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'tabfocus-separator',
    type: 'separator',
    contexts: ['page'],
  });

  // Get existing groups for "Add to Group" submenu
  const groups = await getTabGroups();
  const realGroups = groups.filter(g => g.id !== 'ungrouped' && g.chromeGroupId > 0);

  if (realGroups.length > 0) {
    chrome.contextMenus.create({
      id: 'tabfocus-add-to-group',
      title: 'Add to Group',
      contexts: ['page'],
    });

    for (const group of realGroups) {
      chrome.contextMenus.create({
        id: `tabfocus-add-to-group-${group.chromeGroupId}`,
        parentId: 'tabfocus-add-to-group',
        title: group.name,
        contexts: ['page'],
      });
    }
  }
}

/**
 * Handle context menu clicks
 */
async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  if (!tab?.id) return;

  const menuId = info.menuItemId.toString();

  if (menuId === 'tabfocus-new-group') {
    // Create a new group with this tab
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, {
      title: 'New Group',
      color: 'blue',
    });
    log.info('Created new group from context menu');
  } else if (menuId.startsWith('tabfocus-add-to-group-')) {
    // Add tab to existing group
    const chromeGroupId = parseInt(menuId.replace('tabfocus-add-to-group-', ''), 10);
    await chrome.tabs.group({ tabIds: [tab.id], groupId: chromeGroupId });
    log.info('Added tab to group from context menu');
  }

  // Refresh context menus
  await setupContextMenus();
}

/**
 * Handle messages from popup
 */
function handleMessage(
  message: Message,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
): boolean {
  log.debug('Received message', message);

  // Handle async operations
  (async () => {
    try {
      let response: MessageResponse;

      switch (message.type) {
        case 'GET_GROUPS': {
          const groups = await getTabGroups();
          response = {
            success: true,
            data: { groups, activeGroupId },
          };
          break;
        }

      case 'CREATE_GROUP': {
        const { name, color } = message.payload as {
          name: string;
          color: TabGroupColor;
        };
        const group = await createGroup(name, color);
        response = { success: true, data: group };
        break;
      }

      case 'HIDE_OTHER_GROUPS': {
        const { groupId } = message.payload as { groupId: string };
        await hideOtherGroups(groupId);
        response = { success: true };
        break;
      }

      case 'SHOW_ALL_GROUPS': {
        await showAllGroups();
        response = { success: true };
        break;
      }

      case 'CLOSE_TAB': {
        const { tabId } = message.payload as { tabId: number };
        await closeTab(tabId);
        response = { success: true };
        break;
      }

      case 'SEARCH_TABS': {
        const { query } = message.payload as { query: string };
        const results = await searchTabs(query);
        response = { success: true, data: { results } };
        break;
      }

      case 'SAVE_SESSION': {
        const { name } = message.payload as { name: string };
        const session = await saveSession(name);
        response = { success: true, data: session };
        break;
      }

      case 'GET_SESSIONS': {
        const sessions = await storage.getSessions();
        response = { success: true, data: sessions };
        break;
      }

      case 'RESTORE_SESSION': {
        const { sessionId, append } = message.payload as {
          sessionId: string;
          append: boolean;
        };
        await restoreSession(sessionId, append);
        response = { success: true };
        break;
      }

      case 'DELETE_SESSION': {
        const { sessionId } = message.payload as { sessionId: string };
        await storage.deleteSession(sessionId);
        response = { success: true };
        break;
      }

      case 'GET_SETTINGS': {
        const settings = await storage.getSettings();
        response = { success: true, data: settings };
        break;
      }

      case 'UPDATE_SETTINGS': {
        const updates = message.payload as Partial<Settings>;
        const settings = await storage.updateSettings(updates);

        // Update auto-save alarm if interval changed
        if (updates.autoSaveInterval || updates.autoSaveEnabled !== undefined) {
          if (settings.autoSaveEnabled) {
            await setupAutoSaveAlarm(settings.autoSaveInterval);
          } else {
            await chrome.alarms.clear('auto-save');
          }
        }

        // Update idle-check alarm if suspension timeout changed
        if (updates.suspensionTimeout !== undefined) {
          if (settings.suspensionTimeout > 0) {
            await chrome.alarms.create('idle-check', { periodInMinutes: 1 });
          } else {
            await chrome.alarms.clear('idle-check');
          }
        }

        // Update badge if setting changed
        if (updates.showTabCountBadge !== undefined) {
          await updateBadge();
        }

        response = { success: true, data: settings };
        break;
      }

      case 'RENAME_GROUP': {
        const { groupId, name } = message.payload as { groupId: string; name: string };
        await renameGroup(groupId, name);
        response = { success: true };
        break;
      }

      case 'DELETE_GROUP': {
        const { groupId } = message.payload as { groupId: string };
        await deleteGroup(groupId);
        response = { success: true };
        break;
      }

      case 'AUTO_GROUP_BY_DOMAIN': {
        const groupsCreated = await autoGroupByDomain();
        response = { success: true, data: { groupsCreated } };
        break;
      }

      case 'GROUP_TABS_BY_DOMAIN': {
        const { domain } = message.payload as { domain: string };
        const groupCreated = await groupTabsFromDomain(domain);
        response = { success: true, data: { groupCreated } };
        break;
      }

      case 'GET_DUPLICATES': {
        const { ignoreQueryParams } = (message.payload as {
          ignoreQueryParams?: boolean;
        }) || { ignoreQueryParams: false };
        const duplicates = await findDuplicates(ignoreQueryParams ?? false);
        response = {
          success: true,
          data: Object.fromEntries(duplicates),
        };
        break;
      }

      case 'SUSPEND_TAB': {
        const { tabId } = message.payload as { tabId: number };
        await suspendTab(tabId);
        response = { success: true };
        break;
      }

      case 'UNSUSPEND_TAB': {
        const { tabId } = message.payload as { tabId: number };
        await unsuspendTab(tabId);
        response = { success: true };
        break;
      }

      case 'GET_SUSPENDED_TABS': {
        const suspended = await getSuspendedTabs();
        response = { success: true, data: suspended };
        break;
      }

        default:
          response = { success: false, error: 'Unknown message type' };
      }

      sendResponse(response);
    } catch (error) {
      log.error('Error handling message', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  })();

  return true; // Keep message channel open for async response
}

// Debounced save function
const debouncedSave = debounce(async () => {
  const groups = await getTabGroups();
  await storage.saveGroups(groups);
  log.debug('Auto-saved groups');
}, 2000);

// Event listeners
chrome.runtime.onMessage.addListener(handleMessage);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

chrome.tabs.onCreated.addListener(async () => {
  await updateBadge();
  debouncedSave();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await updateBadge();
  debouncedSave();
  // Clean up suspended tab tracking
  suspendedTabs.delete(tabId);
  tabLastActiveTime.delete(tabId);
});

// Track tab activity for suspension
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateTabActivity(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.groupId !== undefined) {
    debouncedSave();
  }

  // Check auto-group when a tab finishes loading (has a URL now)
  if (changeInfo.status === 'complete' && tab.url && tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
    await checkAutoGroupByDomain(tab.url);
  }
});

chrome.tabGroups.onCreated.addListener(() => {
  debouncedSave();
});

chrome.tabGroups.onUpdated.addListener(() => {
  debouncedSave();
});

chrome.tabGroups.onRemoved.addListener(() => {
  debouncedSave();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'auto-save') {
    const groups = await getTabGroups();
    await storage.saveGroups(groups);
    log.info('Auto-save triggered');
  } else if (alarm.name === 'idle-check') {
    await checkIdleTabs();
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  log.debug('Command received', command);

  if (command === 'show-all-groups') {
    await showAllGroups();
  } else if (command.startsWith('switch-group-')) {
    const groupIndex = parseInt(command.replace('switch-group-', ''), 10) - 1;
    const groups = await getTabGroups();
    if (groupIndex >= 0 && groupIndex < groups.length) {
      await hideOtherGroups(groups[groupIndex].id);
    }
  } else if (command === 'new-group') {
    // This will open the popup with a signal to show new group dialog
    // For now, just create a group with default name
    await createGroup('New Group', 'blue');
  }
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  log.info('Extension installed/updated', details);
  await initialize();
  await setupContextMenus();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  log.info('Browser started');
  await initialize();
});

// Initialize immediately
initialize();
