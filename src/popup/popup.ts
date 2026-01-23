import './popup.css';
import Fuse from 'fuse.js';
import { TabGroup, Tab, TabGroupColor, Session, Message, MessageResponse } from '../types';
import { TAB_GROUP_COLORS, getColorHex, truncate, formatRelativeTime } from '../lib/utils';
import { logger } from '../lib/logger';

const log = logger.scope('Popup');

// DOM Elements
const elements = {
  searchInput: document.getElementById('search-input') as HTMLInputElement,
  searchResults: document.getElementById('search-results') as HTMLDivElement,
  searchResultsList: document.getElementById('search-results-list') as HTMLUListElement,
  groupsContainer: document.getElementById('groups-container') as HTMLDivElement,
  groupsList: document.getElementById('groups-list') as HTMLDivElement,
  loading: document.getElementById('loading') as HTMLDivElement,
  activeGroupIndicator: document.getElementById('active-group-indicator') as HTMLDivElement,
  activeGroupName: document.getElementById('active-group-name') as HTMLSpanElement,
  showAllBtn: document.getElementById('show-all-btn') as HTMLButtonElement,
  exitFocusBtn: document.getElementById('exit-focus-btn') as HTMLButtonElement,
  settingsBtn: document.getElementById('settings-btn') as HTMLButtonElement,
  newGroupBtn: document.getElementById('new-group-btn') as HTMLButtonElement,
  saveSessionBtn: document.getElementById('save-session-btn') as HTMLButtonElement,
  sessionsBtn: document.getElementById('sessions-btn') as HTMLButtonElement,
  newGroupModal: document.getElementById('new-group-modal') as HTMLDivElement,
  groupNameInput: document.getElementById('group-name-input') as HTMLInputElement,
  colorPicker: document.getElementById('color-picker') as HTMLDivElement,
  cancelGroupBtn: document.getElementById('cancel-group-btn') as HTMLButtonElement,
  createGroupBtn: document.getElementById('create-group-btn') as HTMLButtonElement,
  // Session modals
  saveSessionModal: document.getElementById('save-session-modal') as HTMLDivElement,
  sessionNameInput: document.getElementById('session-name-input') as HTMLInputElement,
  cancelSaveSessionBtn: document.getElementById('cancel-save-session-btn') as HTMLButtonElement,
  confirmSaveSessionBtn: document.getElementById('confirm-save-session-btn') as HTMLButtonElement,
  sessionsModal: document.getElementById('sessions-modal') as HTMLDivElement,
  sessionsList: document.getElementById('sessions-list') as HTMLDivElement,
  sessionsLoading: document.getElementById('sessions-loading') as HTMLDivElement,
  closeSessionsBtn: document.getElementById('close-sessions-btn') as HTMLButtonElement,
  // Auto-group and duplicates
  autoGroupBtn: document.getElementById('auto-group-btn') as HTMLButtonElement,
  findDuplicatesBtn: document.getElementById('find-duplicates-btn') as HTMLButtonElement,
  duplicatesModal: document.getElementById('duplicates-modal') as HTMLDivElement,
  duplicatesList: document.getElementById('duplicates-list') as HTMLDivElement,
  duplicatesLoading: document.getElementById('duplicates-loading') as HTMLDivElement,
  closeAllDuplicatesBtn: document.getElementById('close-all-duplicates-btn') as HTMLButtonElement,
  closeDuplicatesModalBtn: document.getElementById('close-duplicates-modal-btn') as HTMLButtonElement,
};

// State
let groups: TabGroup[] = [];
let activeGroupId: string | null = null;
let selectedColor: TabGroupColor = 'blue';
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let selectedSearchIndex = -1;
let searchResults: Array<{ tab: Tab; groupName: string; groupColor: TabGroupColor }> = [];
let currentDuplicates: Record<string, Tab[]> = {};

// Fuse.js instance for fuzzy search
let fuse: Fuse<{ tab: Tab; groupName: string; groupColor: TabGroupColor }> | null = null;

// Type for Fuse.js result
interface FuseResult {
  item: { tab: Tab; groupName: string; groupColor: TabGroupColor };
  matches?: Array<{ key?: string; indices: readonly [number, number][] }>;
}

/**
 * Send message to background service worker
 */
async function sendMessage<T>(message: Message): Promise<MessageResponse<T>> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Load groups from background
 */
async function loadGroups(): Promise<void> {
  try {
    const response = await sendMessage<{ groups: TabGroup[]; activeGroupId: string | null }>({
      type: 'GET_GROUPS',
    });

    if (response.success && response.data) {
      groups = response.data.groups;
      activeGroupId = response.data.activeGroupId;
      renderGroups();
      updateActiveGroupIndicator();
      updateFuseIndex();
    }
  } catch (error) {
    log.error('Failed to load groups', error);
  } finally {
    elements.loading.classList.add('hidden');
  }
}

/**
 * Update Fuse.js index for fuzzy search
 */
function updateFuseIndex(): void {
  const searchableItems: Array<{ tab: Tab; groupName: string; groupColor: TabGroupColor }> = [];

  for (const group of groups) {
    for (const tab of group.tabs) {
      searchableItems.push({
        tab,
        groupName: group.name,
        groupColor: group.color,
      });
    }
  }

  fuse = new Fuse(searchableItems, {
    keys: ['tab.title', 'tab.url'],
    threshold: 0.4,
    includeMatches: true,
    minMatchCharLength: 2,
  });
}

/**
 * Render all groups
 */
function renderGroups(): void {
  elements.groupsList.innerHTML = '';

  if (groups.length === 0) {
    elements.groupsList.innerHTML = `
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <p class="mb-2">No tab groups found</p>
        <p class="text-sm">Create a new group to get started</p>
      </div>
    `;
    return;
  }

  groups.forEach((group) => {
    const card = createGroupCard(group);
    elements.groupsList.appendChild(card);
  });
}

/**
 * Create a group card element
 */
function createGroupCard(group: TabGroup): HTMLElement {
  const card = document.createElement('div');
  card.className = 'group-card';
  card.dataset.groupId = group.id;

  const isActive = group.id === activeGroupId;
  if (isActive) {
    card.classList.add('ring-2', 'ring-blue-500');
  }

  const isUngrouped = group.id === 'ungrouped';

  card.innerHTML = `
    <div class="group-card-header" data-action="toggle">
      <div class="flex items-center gap-2">
        <span class="group-color-indicator" style="background-color: ${getColorHex(group.color)}"></span>
        <span class="font-medium text-sm group-name-display">${truncate(group.name, 25)}</span>
        <span class="text-xs text-gray-500 dark:text-gray-400">(${group.tabs.length})</span>
      </div>
      <div class="flex items-center gap-1">
        ${!isUngrouped ? `
          <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" data-action="rename" title="Rename group">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500" data-action="delete" title="Delete group">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        ` : ''}
        <button class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400" data-action="focus" title="Focus on this group">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
        </button>
        <button class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500" data-action="expand" title="Expand/collapse">
          <svg class="w-5 h-5 transform transition-transform ${group.collapsed ? '' : 'rotate-180'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="group-tabs-list ${group.collapsed ? 'hidden' : ''}">
      ${group.tabs.map((tab) => createTabItemHTML(tab, group.id)).join('')}
    </div>
  `;

  // Add event listeners
  card.addEventListener('click', (e) => handleGroupCardClick(e, group));

  return card;
}

/**
 * Default favicon SVG as data URL
 */
const DEFAULT_FAVICON = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%239ca3af%22%3E%3Cpath d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z%22/%3E%3C/svg%3E';

/**
 * Create HTML for a tab item
 */
function createTabItemHTML(tab: Tab, groupId: string): string {
  const favicon = tab.favIconUrl || DEFAULT_FAVICON;
  const safeTitle = escapeHtml(tab.title || 'Untitled');
  const truncatedTitle = escapeHtml(truncate(tab.title || 'Untitled', 40));

  return `
    <div class="tab-item group" data-tab-id="${tab.id}" data-group-id="${groupId}">
      <img src="${escapeHtml(favicon)}" class="tab-favicon" alt="" onerror="this.src='${DEFAULT_FAVICON}'">
      <span class="tab-title" title="${safeTitle}">${truncatedTitle}</span>
      <button class="tab-close-btn" data-action="close-tab" aria-label="Close tab">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;
}

/**
 * Handle clicks on group card
 */
async function handleGroupCardClick(e: Event, group: TabGroup): Promise<void> {
  const target = e.target as HTMLElement;
  const action = target.closest('[data-action]')?.getAttribute('data-action');

  switch (action) {
    case 'toggle':
    case 'expand':
      toggleGroupExpand(group.id);
      break;
    case 'focus':
      await focusOnGroup(group.id);
      break;
    case 'rename':
      showRenamePrompt(group);
      break;
    case 'delete':
      await deleteGroup(group.id);
      break;
    case 'close-tab':
      const tabId = target.closest('[data-tab-id]')?.getAttribute('data-tab-id');
      if (tabId) {
        await closeTab(parseInt(tabId, 10));
      }
      break;
    default:
      // Click on tab item - switch to that tab
      const tabElement = target.closest('[data-tab-id]');
      if (tabElement && !target.closest('[data-action]')) {
        const tabIdStr = tabElement.getAttribute('data-tab-id');
        if (tabIdStr) {
          await switchToTab(parseInt(tabIdStr, 10));
        }
      }
  }
}

/**
 * Show rename prompt for a group
 */
function showRenamePrompt(group: TabGroup): void {
  const newName = prompt('Enter new group name:', group.name);
  if (newName && newName.trim() && newName !== group.name) {
    renameGroup(group.id, newName.trim());
  }
}

/**
 * Rename a group
 */
async function renameGroup(groupId: string, newName: string): Promise<void> {
  try {
    const response = await sendMessage({
      type: 'RENAME_GROUP',
      payload: { groupId, name: newName },
    });

    if (response.success) {
      await loadGroups();
    }
  } catch (error) {
    log.error('Failed to rename group', error);
  }
}

/**
 * Delete a group
 */
async function deleteGroup(groupId: string): Promise<void> {
  if (!confirm('Delete this group? Tabs will be ungrouped.')) return;

  try {
    const response = await sendMessage({
      type: 'DELETE_GROUP',
      payload: { groupId },
    });

    if (response.success) {
      await loadGroups();
    }
  } catch (error) {
    log.error('Failed to delete group', error);
  }
}

/**
 * Toggle group expansion
 */
function toggleGroupExpand(groupId: string): void {
  const group = groups.find((g) => g.id === groupId);
  if (group) {
    group.collapsed = !group.collapsed;
    renderGroups();
  }
}

/**
 * Focus on a specific group (hide others)
 */
async function focusOnGroup(groupId: string): Promise<void> {
  try {
    const response = await sendMessage({ type: 'HIDE_OTHER_GROUPS', payload: { groupId } });
    if (response.success) {
      activeGroupId = groupId;
      updateActiveGroupIndicator();
      renderGroups();
    }
  } catch (error) {
    log.error('Failed to focus on group', error);
  }
}

/**
 * Show all groups
 */
async function showAllGroups(): Promise<void> {
  try {
    const response = await sendMessage({ type: 'SHOW_ALL_GROUPS' });
    if (response.success) {
      activeGroupId = null;
      updateActiveGroupIndicator();
      renderGroups();
    }
  } catch (error) {
    log.error('Failed to show all groups', error);
  }
}

/**
 * Update active group indicator
 */
function updateActiveGroupIndicator(): void {
  if (activeGroupId) {
    const group = groups.find((g) => g.id === activeGroupId);
    if (group) {
      elements.activeGroupName.textContent = group.name;
      elements.activeGroupIndicator.classList.remove('hidden');
    }
  } else {
    elements.activeGroupIndicator.classList.add('hidden');
  }
}

/**
 * Switch to a specific tab
 */
async function switchToTab(tabId: number): Promise<void> {
  try {
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    window.close();
  } catch (error) {
    log.error('Failed to switch to tab', error);
  }
}

/**
 * Close a tab
 */
async function closeTab(tabId: number): Promise<void> {
  try {
    await sendMessage({ type: 'CLOSE_TAB', payload: { tabId } });
    await loadGroups();
  } catch (error) {
    log.error('Failed to close tab', error);
  }
}

/**
 * Handle search input with fuzzy matching
 */
function handleSearchInput(): void {
  const query = elements.searchInput.value.trim();

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (!query) {
    elements.searchResults.classList.add('hidden');
    elements.groupsContainer.classList.remove('hidden');
    searchResults = [];
    selectedSearchIndex = -1;
    return;
  }

  searchTimeout = setTimeout(() => {
    if (fuse) {
      const results = fuse.search(query, { limit: 20 }) as FuseResult[];
      searchResults = results.map((r) => r.item);
      selectedSearchIndex = searchResults.length > 0 ? 0 : -1;
      renderSearchResults(searchResults, results);
    }
  }, 100);
}

/**
 * Highlight matching text in search results
 */
function highlightMatches(text: string, indices: readonly [number, number][]): string {
  if (!indices || indices.length === 0) return escapeHtml(text);

  let result = '';
  let lastIndex = 0;

  // Sort indices by start position
  const sortedIndices = [...indices].sort((a, b) => a[0] - b[0]);

  for (const [start, end] of sortedIndices) {
    result += escapeHtml(text.slice(lastIndex, start));
    result += `<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">${escapeHtml(text.slice(start, end + 1))}</mark>`;
    lastIndex = end + 1;
  }

  result += escapeHtml(text.slice(lastIndex));
  return result;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render search results with highlighting
 */
function renderSearchResults(
  results: Array<{ tab: Tab; groupName: string; groupColor: TabGroupColor }>,
  fuseResults: FuseResult[]
): void {
  elements.groupsContainer.classList.add('hidden');
  elements.searchResults.classList.remove('hidden');

  if (results.length === 0) {
    elements.searchResultsList.innerHTML = '<li class="text-sm text-gray-500 py-4 text-center">No results found</li>';
    return;
  }

  elements.searchResultsList.innerHTML = fuseResults
    .map(({ item, matches }, index) => {
      const titleMatch = matches?.find((m: { key?: string }) => m.key === 'tab.title');
      const urlMatch = matches?.find((m: { key?: string }) => m.key === 'tab.url');

      const highlightedTitle = titleMatch
        ? highlightMatches(item.tab.title, titleMatch.indices)
        : escapeHtml(item.tab.title);

      const isSelected = index === selectedSearchIndex;

      return `
        <li class="search-result-item ${isSelected ? 'selected bg-blue-50 dark:bg-blue-900/30' : ''}" data-tab-id="${item.tab.id}" data-index="${index}">
          <img src="${item.tab.favIconUrl || ''}" class="w-4 h-4 flex-shrink-0" alt="" onerror="this.style.display='none'">
          <div class="flex-1 min-w-0">
            <div class="text-sm truncate">${highlightedTitle}</div>
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span class="inline-flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" style="background-color: ${getColorHex(item.groupColor)}"></span>
                ${escapeHtml(item.groupName)}
              </span>
              ${urlMatch ? `<span class="truncate">${highlightMatches(truncate(item.tab.url, 40), urlMatch.indices)}</span>` : ''}
            </div>
          </div>
        </li>
      `;
    })
    .join('');

  // Add click handlers
  elements.searchResultsList.querySelectorAll('[data-tab-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const tabId = el.getAttribute('data-tab-id');
      if (tabId) {
        switchToTab(parseInt(tabId, 10));
      }
    });
  });
}

/**
 * Handle keyboard navigation in search results
 */
function handleSearchKeydown(e: KeyboardEvent): void {
  if (elements.searchResults.classList.contains('hidden')) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      if (selectedSearchIndex < searchResults.length - 1) {
        selectedSearchIndex++;
        updateSearchSelection();
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (selectedSearchIndex > 0) {
        selectedSearchIndex--;
        updateSearchSelection();
      }
      break;
    case 'Enter':
      e.preventDefault();
      if (selectedSearchIndex >= 0 && selectedSearchIndex < searchResults.length) {
        switchToTab(searchResults[selectedSearchIndex].tab.id);
      }
      break;
  }
}

/**
 * Update visual selection in search results
 */
function updateSearchSelection(): void {
  elements.searchResultsList.querySelectorAll('.search-result-item').forEach((el, index) => {
    if (index === selectedSearchIndex) {
      el.classList.add('selected', 'bg-blue-50', 'dark:bg-blue-900/30');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected', 'bg-blue-50', 'dark:bg-blue-900/30');
    }
  });
}

/**
 * Show new group modal
 */
function showNewGroupModal(): void {
  elements.newGroupModal.classList.remove('hidden');
  elements.groupNameInput.value = '';
  elements.groupNameInput.focus();
  renderColorPicker();
}

/**
 * Hide new group modal
 */
function hideNewGroupModal(): void {
  elements.newGroupModal.classList.add('hidden');
}

/**
 * Render color picker
 */
function renderColorPicker(): void {
  elements.colorPicker.innerHTML = TAB_GROUP_COLORS.map(
    (color) => `
      <button
        class="color-option ${color === selectedColor ? 'selected' : ''}"
        style="background-color: ${getColorHex(color)}"
        data-color="${color}"
        title="${color}"
      ></button>
    `
  ).join('');

  elements.colorPicker.querySelectorAll('[data-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedColor = btn.getAttribute('data-color') as TabGroupColor;
      renderColorPicker();
    });
  });
}

/**
 * Create new group
 */
async function createNewGroup(): Promise<void> {
  const name = elements.groupNameInput.value.trim();
  if (!name) {
    elements.groupNameInput.focus();
    return;
  }

  try {
    const response = await sendMessage({
      type: 'CREATE_GROUP',
      payload: { name, color: selectedColor },
    });

    if (response.success) {
      hideNewGroupModal();
      await loadGroups();
    }
  } catch (error) {
    log.error('Failed to create group', error);
  }
}

/**
 * Open settings page
 */
function openSettings(): void {
  chrome.runtime.openOptionsPage();
}

// ==================== Session Management ====================

/**
 * Show save session modal
 */
function showSaveSessionModal(): void {
  elements.saveSessionModal.classList.remove('hidden');
  elements.sessionNameInput.value = `Session ${new Date().toLocaleDateString()}`;
  elements.sessionNameInput.focus();
  elements.sessionNameInput.select();
}

/**
 * Hide save session modal
 */
function hideSaveSessionModal(): void {
  elements.saveSessionModal.classList.add('hidden');
}

/**
 * Save current session
 */
async function saveSession(): Promise<void> {
  const name = elements.sessionNameInput.value.trim();
  if (!name) {
    elements.sessionNameInput.focus();
    return;
  }

  try {
    const response = await sendMessage({
      type: 'SAVE_SESSION',
      payload: { name },
    });

    if (response.success) {
      hideSaveSessionModal();
      log.info('Session saved successfully');
    }
  } catch (error) {
    log.error('Failed to save session', error);
  }
}

/**
 * Show sessions list modal
 */
async function showSessionsModal(): Promise<void> {
  elements.sessionsModal.classList.remove('hidden');
  elements.sessionsLoading.classList.remove('hidden');
  elements.sessionsList.innerHTML = '';
  elements.sessionsList.appendChild(elements.sessionsLoading);

  try {
    const response = await sendMessage<Session[]>({ type: 'GET_SESSIONS' });

    if (response.success && response.data) {
      renderSessionsList(response.data);
    }
  } catch (error) {
    log.error('Failed to load sessions', error);
    elements.sessionsList.innerHTML = '<div class="text-center py-4 text-gray-500">Failed to load sessions</div>';
  }
}

/**
 * Hide sessions modal
 */
function hideSessionsModal(): void {
  elements.sessionsModal.classList.add('hidden');
}

/**
 * Render sessions list
 */
function renderSessionsList(sessions: Session[]): void {
  elements.sessionsLoading.classList.add('hidden');

  if (sessions.length === 0) {
    elements.sessionsList.innerHTML = `
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <p class="mb-2">No saved sessions</p>
        <p class="text-sm">Save your current tabs as a session</p>
      </div>
    `;
    return;
  }

  elements.sessionsList.innerHTML = sessions
    .map(
      (session) => `
      <div class="session-item p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800" data-session-id="${session.id}">
        <div class="flex items-center justify-between mb-1">
          <span class="font-medium text-sm">${truncate(session.name, 30)}</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">${session.tabCount} tabs</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400 dark:text-gray-500">${formatRelativeTime(session.createdAt)}</span>
          <div class="flex items-center gap-1">
            <button class="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded" data-action="restore" title="Restore session">
              Restore
            </button>
            <button class="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" data-action="restore-append" title="Append to current tabs">
              Append
            </button>
            <button class="px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" data-action="delete" title="Delete session">
              Delete
            </button>
          </div>
        </div>
      </div>
    `
    )
    .join('');

  // Add event listeners
  elements.sessionsList.querySelectorAll('[data-session-id]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      const sessionId = el.getAttribute('data-session-id');

      if (!sessionId) return;

      switch (action) {
        case 'restore':
          await restoreSession(sessionId, false);
          break;
        case 'restore-append':
          await restoreSession(sessionId, true);
          break;
        case 'delete':
          await deleteSession(sessionId);
          break;
      }
    });
  });
}

/**
 * Restore a session
 */
async function restoreSession(sessionId: string, append: boolean): Promise<void> {
  const confirmMessage = append
    ? 'Add these tabs to your current window?'
    : 'Replace current tabs with this session?';

  if (!confirm(confirmMessage)) return;

  try {
    const response = await sendMessage({
      type: 'RESTORE_SESSION',
      payload: { sessionId, append },
    });

    if (response.success) {
      hideSessionsModal();
      await loadGroups();
      log.info('Session restored successfully');
    }
  } catch (error) {
    log.error('Failed to restore session', error);
  }
}

/**
 * Delete a session
 */
async function deleteSession(sessionId: string): Promise<void> {
  if (!confirm('Delete this session?')) return;

  try {
    const response = await sendMessage({
      type: 'DELETE_SESSION',
      payload: { sessionId },
    });

    if (response.success) {
      // Refresh the sessions list
      await showSessionsModal();
      log.info('Session deleted successfully');
    }
  } catch (error) {
    log.error('Failed to delete session', error);
  }
}

// ==================== Auto-Group & Duplicates ====================

/**
 * Auto-group ungrouped tabs by domain
 */
async function autoGroupByDomain(): Promise<void> {
  try {
    const response = await sendMessage<{ groupsCreated: number }>({
      type: 'AUTO_GROUP_BY_DOMAIN',
    });

    if (response.success && response.data) {
      const count = response.data.groupsCreated;
      if (count > 0) {
        alert(`Created ${count} new group${count > 1 ? 's' : ''} from tabs with the same domain.`);
        await loadGroups();
      } else {
        alert('No tabs could be auto-grouped. Make sure you have ungrouped tabs from the same domain.');
      }
    }
  } catch (error) {
    log.error('Failed to auto-group by domain', error);
  }
}

/**
 * Show duplicates modal
 */
async function showDuplicatesModal(): Promise<void> {
  elements.duplicatesModal.classList.remove('hidden');
  elements.duplicatesLoading.classList.remove('hidden');
  elements.duplicatesList.innerHTML = '';
  elements.duplicatesList.appendChild(elements.duplicatesLoading);

  try {
    const response = await sendMessage<Record<string, Tab[]>>({
      type: 'GET_DUPLICATES',
      payload: { ignoreQueryParams: false },
    });

    if (response.success && response.data) {
      currentDuplicates = response.data;
      renderDuplicatesList(response.data);
    }
  } catch (error) {
    log.error('Failed to load duplicates', error);
    elements.duplicatesList.innerHTML = '<div class="text-center py-4 text-gray-500">Failed to load duplicates</div>';
  }
}

/**
 * Hide duplicates modal
 */
function hideDuplicatesModal(): void {
  elements.duplicatesModal.classList.add('hidden');
}

/**
 * Render duplicates list
 */
function renderDuplicatesList(duplicates: Record<string, Tab[]>): void {
  elements.duplicatesLoading.classList.add('hidden');

  const entries = Object.entries(duplicates);

  if (entries.length === 0) {
    elements.duplicatesList.innerHTML = `
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <p class="mb-2">No duplicate tabs found</p>
        <p class="text-sm">All your tabs have unique URLs</p>
      </div>
    `;
    elements.closeAllDuplicatesBtn.classList.add('hidden');
    return;
  }

  elements.closeAllDuplicatesBtn.classList.remove('hidden');

  elements.duplicatesList.innerHTML = entries
    .map(([url, tabs]) => {
      const domain = new URL(url).hostname;
      const title = tabs[0]?.title || 'Untitled';

      return `
        <div class="duplicate-group p-3 rounded-lg border border-gray-200 dark:border-gray-700" data-url="${escapeHtml(url)}">
          <div class="flex items-start justify-between gap-2 mb-2">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate" title="${escapeHtml(title)}">${escapeHtml(truncate(title, 35))}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate">${escapeHtml(domain)}</div>
            </div>
            <span class="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded-full">
              ${tabs.length} tabs
            </span>
          </div>
          <div class="flex items-center gap-2">
            ${tabs.map((tab) => `
              <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" data-action="switch-to" data-tab-id="${tab.id}" title="Switch to this tab">
                <img src="${tab.favIconUrl || ''}" class="w-4 h-4" alt="" onerror="this.style.display='none'">
              </button>
            `).join('')}
            <button class="ml-auto px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" data-action="close-duplicates" data-url="${escapeHtml(url)}">
              Keep one, close ${tabs.length - 1}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // Add event listeners
  elements.duplicatesList.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.getAttribute('data-action');

      if (action === 'switch-to') {
        const tabId = el.getAttribute('data-tab-id');
        if (tabId) {
          await switchToTab(parseInt(tabId, 10));
        }
      } else if (action === 'close-duplicates') {
        const url = el.getAttribute('data-url');
        if (url) {
          await closeDuplicatesForUrl(url);
        }
      }
    });
  });
}

/**
 * Close duplicate tabs for a specific URL (keep the first one)
 */
async function closeDuplicatesForUrl(url: string): Promise<void> {
  const tabs = currentDuplicates[url];
  if (!tabs || tabs.length <= 1) return;

  // Close all but the first tab
  const tabsToClose = tabs.slice(1);

  for (const tab of tabsToClose) {
    await sendMessage({ type: 'CLOSE_TAB', payload: { tabId: tab.id } });
  }

  // Refresh the modal
  await showDuplicatesModal();
  await loadGroups();
}

/**
 * Close all duplicate tabs
 */
async function closeAllDuplicates(): Promise<void> {
  const entries = Object.entries(currentDuplicates);
  if (entries.length === 0) return;

  const totalDuplicates = entries.reduce((sum, [, tabs]) => sum + tabs.length - 1, 0);
  if (!confirm(`Close ${totalDuplicates} duplicate tab${totalDuplicates > 1 ? 's' : ''}?`)) return;

  for (const [, tabs] of entries) {
    // Close all but the first tab
    const tabsToClose = tabs.slice(1);
    for (const tab of tabsToClose) {
      await sendMessage({ type: 'CLOSE_TAB', payload: { tabId: tab.id } });
    }
  }

  hideDuplicatesModal();
  await loadGroups();
}

/**
 * Initialize popup
 */
function init(): void {
  log.info('Initializing popup');

  // Load initial data
  loadGroups();

  // Event listeners
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.searchInput.addEventListener('keydown', handleSearchKeydown);
  elements.showAllBtn.addEventListener('click', showAllGroups);
  elements.exitFocusBtn.addEventListener('click', showAllGroups);
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.newGroupBtn.addEventListener('click', showNewGroupModal);
  elements.cancelGroupBtn.addEventListener('click', hideNewGroupModal);
  elements.createGroupBtn.addEventListener('click', createNewGroup);

  // Session event listeners
  elements.saveSessionBtn.addEventListener('click', showSaveSessionModal);
  elements.cancelSaveSessionBtn.addEventListener('click', hideSaveSessionModal);
  elements.confirmSaveSessionBtn.addEventListener('click', saveSession);
  elements.sessionsBtn.addEventListener('click', showSessionsModal);
  elements.closeSessionsBtn.addEventListener('click', hideSessionsModal);

  // Auto-group and duplicates event listeners
  elements.autoGroupBtn.addEventListener('click', autoGroupByDomain);
  elements.findDuplicatesBtn.addEventListener('click', showDuplicatesModal);
  elements.closeDuplicatesModalBtn.addEventListener('click', hideDuplicatesModal);
  elements.closeAllDuplicatesBtn.addEventListener('click', closeAllDuplicates);

  // Close modals on backdrop click
  elements.newGroupModal.addEventListener('click', (e) => {
    if (e.target === elements.newGroupModal) {
      hideNewGroupModal();
    }
  });
  elements.saveSessionModal.addEventListener('click', (e) => {
    if (e.target === elements.saveSessionModal) {
      hideSaveSessionModal();
    }
  });
  elements.sessionsModal.addEventListener('click', (e) => {
    if (e.target === elements.sessionsModal) {
      hideSessionsModal();
    }
  });
  elements.duplicatesModal.addEventListener('click', (e) => {
    if (e.target === elements.duplicatesModal) {
      hideDuplicatesModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!elements.newGroupModal.classList.contains('hidden')) {
        hideNewGroupModal();
      } else if (!elements.saveSessionModal.classList.contains('hidden')) {
        hideSaveSessionModal();
      } else if (!elements.sessionsModal.classList.contains('hidden')) {
        hideSessionsModal();
      } else if (!elements.duplicatesModal.classList.contains('hidden')) {
        hideDuplicatesModal();
      } else if (!elements.searchResults.classList.contains('hidden')) {
        elements.searchInput.value = '';
        elements.searchResults.classList.add('hidden');
        elements.groupsContainer.classList.remove('hidden');
        searchResults = [];
        selectedSearchIndex = -1;
      }
    }

    if (e.key === 'Enter') {
      if (!elements.newGroupModal.classList.contains('hidden')) {
        createNewGroup();
      } else if (!elements.saveSessionModal.classList.contains('hidden')) {
        saveSession();
      }
    }
  });

  // Focus search on Ctrl+F
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      elements.searchInput.focus();
    }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
