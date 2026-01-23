import './options.css';
import { Settings, DEFAULT_SETTINGS, Message, MessageResponse } from '../types';
import { storage } from '../lib/storage';
import { logger } from '../lib/logger';

const log = logger.scope('Options');

// DOM Elements
const elements = {
  form: document.getElementById('settings-form') as HTMLFormElement,
  viewOneGroupAtATime: document.getElementById('viewOneGroupAtATime') as HTMLInputElement,
  showUngroupedTabs: document.getElementById('showUngroupedTabs') as HTMLInputElement,
  autoGroupByDomain: document.getElementById('autoGroupByDomain') as HTMLInputElement,
  autoGroupThreshold: document.getElementById('autoGroupThreshold') as HTMLInputElement,
  autoGroupThresholdContainer: document.getElementById('autoGroupThresholdContainer') as HTMLDivElement,
  autoSaveEnabled: document.getElementById('autoSaveEnabled') as HTMLInputElement,
  autoSaveInterval: document.getElementById('autoSaveInterval') as HTMLInputElement,
  maxSessions: document.getElementById('maxSessions') as HTMLInputElement,
  suspensionTimeout: document.getElementById('suspensionTimeout') as HTMLInputElement,
  suspensionWhitelist: document.getElementById('suspensionWhitelist') as HTMLTextAreaElement,
  showTabCountBadge: document.getElementById('showTabCountBadge') as HTMLInputElement,
  exportBtn: document.getElementById('export-btn') as HTMLButtonElement,
  importBtn: document.getElementById('import-btn') as HTMLButtonElement,
  importFile: document.getElementById('import-file') as HTMLInputElement,
  resetBtn: document.getElementById('reset-btn') as HTMLButtonElement,
  storageInfo: document.getElementById('storage-info') as HTMLDivElement,
};

/**
 * Send message to background service worker
 */
async function sendMessage<T>(message: Message): Promise<MessageResponse<T>> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Load settings and populate form
 */
async function loadSettings(): Promise<void> {
  try {
    const response = await sendMessage<Settings>({ type: 'GET_SETTINGS' });

    if (response.success && response.data) {
      const settings = response.data;
      populateForm(settings);
    }
  } catch (error) {
    log.error('Failed to load settings', error);
  }
}

/**
 * Populate form with settings
 */
function populateForm(settings: Settings): void {
  elements.viewOneGroupAtATime.checked = settings.viewOneGroupAtATime;
  elements.showUngroupedTabs.checked = settings.showUngroupedTabs;
  elements.autoGroupByDomain.checked = settings.autoGroupByDomain;
  elements.autoGroupThreshold.value = (settings.autoGroupThreshold || 3).toString();
  updateAutoGroupThresholdVisibility();
  elements.autoSaveEnabled.checked = settings.autoSaveEnabled;
  elements.autoSaveInterval.value = settings.autoSaveInterval.toString();
  elements.maxSessions.value = settings.maxSessions.toString();
  elements.suspensionTimeout.value = settings.suspensionTimeout.toString();
  elements.suspensionWhitelist.value = settings.suspensionWhitelist.join('\n');
  elements.showTabCountBadge.checked = settings.showTabCountBadge;
}

/**
 * Show/hide auto-group threshold based on checkbox state
 */
function updateAutoGroupThresholdVisibility(): void {
  if (elements.autoGroupByDomain.checked) {
    elements.autoGroupThresholdContainer.classList.remove('hidden');
  } else {
    elements.autoGroupThresholdContainer.classList.add('hidden');
  }
}

/**
 * Get settings from form
 */
function getFormSettings(): Settings {
  return {
    viewOneGroupAtATime: elements.viewOneGroupAtATime.checked,
    showUngroupedTabs: elements.showUngroupedTabs.checked,
    autoGroupByDomain: elements.autoGroupByDomain.checked,
    autoGroupThreshold: parseInt(elements.autoGroupThreshold.value, 10) || DEFAULT_SETTINGS.autoGroupThreshold,
    autoSaveEnabled: elements.autoSaveEnabled.checked,
    autoSaveInterval: parseInt(elements.autoSaveInterval.value, 10) || DEFAULT_SETTINGS.autoSaveInterval,
    maxSessions: parseInt(elements.maxSessions.value, 10) || DEFAULT_SETTINGS.maxSessions,
    suspensionTimeout: parseInt(elements.suspensionTimeout.value, 10) || 0,
    suspensionWhitelist: elements.suspensionWhitelist.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    showTabCountBadge: elements.showTabCountBadge.checked,
  };
}

/**
 * Save settings
 */
async function saveSettings(): Promise<void> {
  try {
    const settings = getFormSettings();
    await sendMessage({ type: 'UPDATE_SETTINGS', payload: settings });
    log.info('Settings saved');
  } catch (error) {
    log.error('Failed to save settings', error);
  }
}

/**
 * Load and display storage info
 */
async function loadStorageInfo(): Promise<void> {
  try {
    const info = await storage.getStorageInfo();
    const usedMB = (info.bytesUsed / 1024 / 1024).toFixed(2);
    const quotaMB = (info.quota / 1024 / 1024).toFixed(0);
    const percent = info.percentUsed.toFixed(1);

    let barClass = '';
    if (info.percentUsed >= 90) {
      barClass = 'danger';
    } else if (info.percentUsed >= 80) {
      barClass = 'warning';
    }

    elements.storageInfo.innerHTML = `
      <div class="flex justify-between mb-2">
        <span>Used: ${usedMB} MB of ${quotaMB} MB</span>
        <span>${percent}%</span>
      </div>
      <div class="storage-bar">
        <div class="storage-bar-fill ${barClass}" style="width: ${percent}%"></div>
      </div>
      ${info.percentUsed >= 80 ? '<p class="mt-2 text-yellow-600 dark:text-yellow-400">Storage is getting full. Consider deleting old sessions.</p>' : ''}
    `;
  } catch (error) {
    log.error('Failed to load storage info', error);
    elements.storageInfo.textContent = 'Unable to load storage information';
  }
}

/**
 * Export all data
 */
async function exportData(): Promise<void> {
  try {
    const data = await storage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tabfocus-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    log.info('Data exported');
  } catch (error) {
    log.error('Failed to export data', error);
    alert('Failed to export data. Please try again.');
  }
}

/**
 * Import data from file
 */
async function importData(file: File): Promise<void> {
  try {
    const text = await file.text();
    await storage.importData(text);

    await loadSettings();
    await loadStorageInfo();

    log.info('Data imported');
    alert('Data imported successfully!');
  } catch (error) {
    log.error('Failed to import data', error);
    alert('Failed to import data. Please make sure the file is valid.');
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings(): Promise<void> {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }

  try {
    await sendMessage({ type: 'UPDATE_SETTINGS', payload: DEFAULT_SETTINGS });
    populateForm(DEFAULT_SETTINGS);
    log.info('Settings reset to defaults');
  } catch (error) {
    log.error('Failed to reset settings', error);
    alert('Failed to reset settings. Please try again.');
  }
}

/**
 * Initialize options page
 */
function init(): void {
  log.info('Initializing options page');

  // Load initial data
  loadSettings();
  loadStorageInfo();

  // Auto-save on form changes
  elements.form.addEventListener('change', () => {
    saveSettings();
  });

  // Toggle threshold visibility when auto-group checkbox changes
  elements.autoGroupByDomain.addEventListener('change', updateAutoGroupThresholdVisibility);

  // Debounce number inputs
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const numberInputs = [elements.autoSaveInterval, elements.maxSessions, elements.suspensionTimeout, elements.autoGroupThreshold];

  numberInputs.forEach((input) => {
    input.addEventListener('input', () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveSettings, 500);
    });
  });

  // Debounce whitelist textarea
  elements.suspensionWhitelist.addEventListener('input', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveSettings, 1000);
  });

  // Export button
  elements.exportBtn.addEventListener('click', exportData);

  // Import button
  elements.importBtn.addEventListener('click', () => {
    elements.importFile.click();
  });

  elements.importFile.addEventListener('change', () => {
    const file = elements.importFile.files?.[0];
    if (file) {
      importData(file);
      elements.importFile.value = '';
    }
  });

  // Reset button
  elements.resetBtn.addEventListener('click', resetSettings);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
