/**
 * app.js
 * PWA logic for "Kosuge Villager Point Card" system.
 * Handles QR code scanner input (as keyboard input), offline data storage (IndexedDB),
 * and synchronization with Google Apps Script.
 */

const scanInput = document.getElementById('scan-input');
const scanResultDiv = document.getElementById('scan-result');
const scanResultMessage = scanResultDiv.querySelector('.message');
const scanResultMemberId = scanResultDiv.querySelector('.member-id');

const syncDataButton = document.getElementById('sync-data');
const resetButton = document.getElementById('reset-device');
const currentStatusSpan = document.getElementById('current-status');
const offlineQueueCountSpan = document.getElementById('offline-queue-count');
const lastSyncTimeSpan = document.getElementById('last-sync-time');

const appsScriptUrlInput = document.getElementById('apps-script-url');
const storeIdInput = document.getElementById('store-id');
const pointValueInput = document.getElementById('point-value');
const saveSettingsButton = document.getElementById('save-settings');

const DB_NAME = 'PointCardDB';
const STORE_NAME = 'pointQueue';
const SETTINGS_KEY = 'pointCardSettings';
const LAST_SYNC_KEY = 'lastSyncTime';
const DEVICE_ID_KEY = 'deviceId'; // Key for storing unique device ID

let settings = {}; // { appsScriptUrl, storeId, pointValue }
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || crypto.randomUUID(); // Get existing or generate new device ID

// Store device ID in localStorage
localStorage.setItem(DEVICE_ID_KEY, deviceId);

// --- IndexedDB Helper Functions ---
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject('IndexedDB error');
        };
    });
}

async function addEntry(memberId) {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const entry = { memberId: memberId, timestamp: new Date().toISOString(), deviceId: deviceId };
    return new Promise((resolve, reject) => {
        const request = store.add(entry);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

async function getAllEntries() {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function clearEntries() {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

async function updateQueueCount() {
    const entries = await getAllEntries();
    offlineQueueCountSpan.textContent = entries.length;
}

// --- Settings Management ---
function loadSettings() {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
        appsScriptUrlInput.value = settings.appsScriptUrl || '';
        storeIdInput.value = settings.storeId || '';
        pointValueInput.value = settings.pointValue || '';
    }

    const savedLastSync = localStorage.getItem(LAST_SYNC_KEY);
    if (savedLastSync) {
        lastSyncTimeSpan.textContent = new Date(parseInt(savedLastSync)).toLocaleString();
    }
}

function saveSettings() {
    settings.appsScriptUrl = appsScriptUrlInput.value.trim();
    settings.storeId = storeIdInput.value.trim();
    settings.pointValue = parseInt(pointValueInput.value.trim(), 10);

    if (!settings.appsScriptUrl || !settings.appsScriptUrl.endsWith('/exec') || !settings.storeId || isNaN(settings.pointValue) || settings.pointValue <= 0) {
        alert('Apps Script URLは「/exec」で終わり、店舗ID、付与ポイント数を正しく入力してください。');
        return;
    }

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert('設定を保存しました！');
    scanInput.focus(); // 設定保存後、読み取りフィールドにフォーカス
}

// --- QR Code Reader Input Handling ---
scanInput.addEventListener('keypress', async (event) => {
    // Check if the Enter key was pressed (key code 13)
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent default form submission or new line in input
        const memberId = scanInput.value.trim();
        scanInput.value = ''; // Clear the input field immediately

        if (!settings.appsScriptUrl || !settings.storeId || !settings.pointValue) {
            alert('先にApps Script URL, 店舗ID, 付与ポイント数を設定して保存してください。');
            currentStatusSpan.textContent = '設定未完了';
            currentStatusSpan.className = 'error';
            return;
        }

        if (memberId.length === 14 && /^\d+$/.test(memberId)) {
            await addEntry(memberId);
            updateQueueCount();
            currentStatusSpan.textContent = `ポイント追加: ${memberId} (オフラインキューに保存)`;
            currentStatusSpan.className = 'success';
            displayScanResult('読み取りました！', memberId);
        } else {
            currentStatusSpan.textContent = `無効な会員番号: ${memberId}`;
            currentStatusSpan.className = 'error';
            displayScanResult('読み取り失敗', '無効な会員番号');
            setTimeout(() => clearScanResult(), 3000); // Clear after 3 seconds
        }
        scanInput.focus(); // Re-focus the input for the next scan
    }
});

// For iOS, the virtual keyboard often pops up when an input field is focused.
// To keep the virtual keyboard hidden and still allow scanner input,
// make the input field read-only and listen for keydown/keypress on the document.
// However, if using an external scanner that sends keyboard inputs,
// simply focusing the input field and letting the scanner type into it is usually enough.
// The current setup should work if the scanner sends an Enter key at the end.

function displayScanResult(message, memberId) {
    scanResultMessage.textContent = message;
    scanResultMemberId.textContent = memberId;
    // Set a timeout to clear the message after a few seconds
    setTimeout(() => {
        clearScanResult();
    }, 3000); // Message disappears after 3 seconds
}

function clearScanResult() {
    scanResultMessage.textContent = '';
    scanResultMemberId.textContent = '';
}

// --- Data Synchronization ---
async function syncData() {
    currentStatusSpan.textContent = '同期中...';
    currentStatusSpan.className = 'info';
    syncDataButton.disabled = true;
    const entries = await getAllEntries();

    if (entries.length === 0) {
        currentStatusSpan.textContent = '同期するデータがありません。';
        currentStatusSpan.className = 'info';
        syncDataButton.disabled = false;
        return;
    }

    try {
        const payload = {
            storeId: settings.storeId,
            pointValue: settings.pointValue,
            data: entries.map(entry => ({ memberId: entry.memberId, timestamp: entry.timestamp })),
            deviceId: deviceId // Send device ID for last sync time tracking
        };

        const response = await fetch(settings.appsScriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.status === 200) {
            await clearEntries(); // Clear queue on successful sync
            updateQueueCount();
            const now = new Date().getTime();
            localStorage.setItem(LAST_SYNC_KEY, now.toString());
            lastSyncTimeSpan.textContent = new Date(now).toLocaleString();
            currentStatusSpan.textContent = `同期成功: ${result.message}`;
            currentStatusSpan.className = 'success';

            // Also inform Apps Script that this device just synced
            const updateSyncPayload = {
                action: 'updateLastSyncTime',
                deviceId: deviceId
            };
            try {
                await fetch(settings.appsScriptUrl, { // Send to the same URL
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateSyncPayload)
                });
                console.log('Last sync time updated on Apps Script.');
            } catch (syncTimeError) {
                console.warn('Failed to update last sync time on Apps Script:', syncTimeError);
            }

        } else {
            currentStatusSpan.textContent = `同期失敗: ${result.message || '不明なエラー'}`;
            currentStatusSpan.className = 'error';
        }
    } catch (error) {
        console.error('Sync error:', error);
        currentStatusSpan.textContent = `同期エラー: ${error.message}. (データは端末に保持されています)`;
        currentStatusSpan.className = 'error';
    } finally {
        syncDataButton.disabled = false;
        scanInput.focus(); // Re-focus input after sync attempt
    }
}

// --- Device Reset ---
function resetDevice() {
    if (confirm('端末設定と未同期データをすべてリセットします。よろしいですか？')) {
        localStorage.clear(); // Clear all localStorage settings
        indexedDB.deleteDatabase(DB_NAME); // Delete IndexedDB
        deviceId = crypto.randomUUID(); //
