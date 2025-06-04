/**
 * app.js
 * PWA logic for "Kosuge Villager Point Card" system.
 * Handles QR code scanning, offline data storage (IndexedDB),
 * and synchronization with Google Apps Script.
 */

// Import ZXing library (can be hosted locally or via CDN)
// For local hosting, download zxing-js/library from npm or GitHub and include via script tag.
// For simplicity in this example, we'll assume it's available.
// In a real deployment, you might use:
// import { BrowserQRCodeReader } from '@zxing/library';
// For this example, we'll use a simplified direct inclusion or rely on it being globally available
// if included via a <script> tag before this file.
// Or, for a simple CDN include:
// <script src="https://unpkg.com/@zxing/library@latest/umd/index.min.js"></script>
// We'll proceed assuming `ZXing.BrowserQRCodeReader` is available.

const videoElement = document.getElementById('qr-reader-video');
const qrOverlay = document.getElementById('qr-reader-overlay');
const startScanButton = document.getElementById('start-scan');
const stopScanButton = document.getElementById('stop-scan');
const syncDataButton = document.getElementById('sync-data');
const manualInputButton = document.getElementById('manual-input');
const resetButton = document.getElementById('reset-device');
const currentStatusSpan = document.getElementById('current-status');
const offlineQueueCountSpan = document.getElementById('offline-queue-count');
const lastSyncTimeSpan = document.getElementById('last-sync-time');

const appsScriptUrlInput = document.getElementById('apps-script-url');
const storeIdInput = document.getElementById('store-id');
const pointValueInput = document.getElementById('point-value');
const saveSettingsButton = document.getElementById('save-settings');

let qrCodeReader;
let mediaStream;
let isScanning = false;

const DB_NAME = 'PointCardDB';
const STORE_NAME = 'pointQueue';
const SETTINGS_KEY = 'pointCardSettings';
const LAST_SYNC_KEY = 'lastSyncTime';

let settings = {}; // { appsScriptUrl, storeId, pointValue }
let deviceId = crypto.randomUUID(); // Unique ID for this device

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

    if (!settings.appsScriptUrl || !settings.storeId || isNaN(settings.pointValue) || settings.pointValue <= 0) {
        alert('設定をすべて入力してください。');
        return;
    }

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    alert('設定を保存しました！');
}

// --- QR Code Scanning ---
async function startScan() {
    if (!settings.appsScriptUrl || !settings.storeId || !settings.pointValue) {
        alert('先にApps Script URL, 店舗ID, 付与ポイント数を設定して保存してください。');
        return;
    }

    if (isScanning) return;
    isScanning = true;
    startScanButton.disabled = true;
    stopScanButton.disabled = false;
    currentStatusSpan.textContent = 'スキャン中...';
    qrOverlay.textContent = 'QRコードを読み取り中...';

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); // Use 'environment' for back camera
        videoElement.srcObject = mediaStream;
        await videoElement.play();

        if (typeof ZXing === 'undefined' || !ZXing.BrowserQRCodeReader) {
            alert('ZXingライブラリがロードされていません。');
            console.error('ZXing library not found.');
            isScanning = false;
            stopScan();
            return;
        }

        qrCodeReader = new ZXing.BrowserQRCodeReader();
        qrCodeReader.decodeFromVideoElement(videoElement, (result, err) => {
            if (result) {
                console.log('QR Code detected:', result.getText());
                processQRCode(result.getText());
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error('QR code scan error:', err);
                qrOverlay.textContent = 'エラー: ' + err.message;
            }
        });
    } catch (err) {
        console.error('Failed to get camera access:', err);
        currentStatusSpan.textContent = `カメラアクセスエラー: ${err.message}`;
        alert('カメラアクセスを許可してください。\nエラー: ' + err.message);
        isScanning = false;
        stopScan();
    }
}

function stopScan() {
    if (!isScanning) return;
    isScanning = false;
    startScanButton.disabled = false;
    stopScanButton.disabled = true;
    currentStatusSpan.textContent = 'スキャン停止中';
    qrOverlay.textContent = 'スキャン停止';

    if (qrCodeReader) {
        qrCodeReader.reset();
        qrCodeReader = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
}

async function processQRCode(qrData) {
    // Assuming QR data is the 14-digit member ID
    const memberId = qrData.trim();
    if (memberId.length === 14 && /^\d+$/.test(memberId)) {
        await addEntry(memberId);
        updateQueueCount();
        currentStatusSpan.textContent = `ポイント追加: ${memberId} (オフラインキューに保存)`;
        qrOverlay.textContent = `✅ 読み取り成功！ ${memberId}`;
        // Briefly show success then reset overlay
        setTimeout(() => {
            qrOverlay.textContent = 'QRコードを読み取り中...';
        }, 2000);
    } else {
        currentStatusSpan.textContent = `無効なQRコード: ${qrData}`;
        qrOverlay.textContent = `❌ 無効なQRコード`;
        // Briefly show error then reset overlay
        setTimeout(() => {
            qrOverlay.textContent = 'QRコードを読み取り中...';
        }, 2000);
    }
}

// --- Manual Input ---
async function manualInput() {
    const memberId = prompt('会員番号を14桁で入力してください:');
    if (memberId) {
        const trimmedMemberId = memberId.trim();
        if (trimmedMemberId.length === 14 && /^\d+$/.test(trimmedMemberId)) {
            await addEntry(trimmedMemberId);
            updateQueueCount();
            currentStatusSpan.textContent = `ポイント追加 (手動): ${trimmedMemberId} (オフラインキューに保存)`;
        } else {
            alert('無効な会員番号です。14桁の数字を入力してください。');
        }
    }
}

// --- Data Synchronization ---
async function syncData() {
    currentStatusSpan.textContent = '同期中...';
    syncDataButton.disabled = true;
    const entries = await getAllEntries();

    if (entries.length === 0) {
        currentStatusSpan.textContent = '同期するデータがありません。';
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

            // Also inform Apps Script that this device just synced
            await fetch(settings.appsScriptUrl.replace('/exec', '/dev'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'updateLastSyncTime', deviceId: deviceId })
            });

        } else {
            currentStatusSpan.textContent = `同期失敗: ${result.message || '不明なエラー'}`;
        }
    } catch (error) {
        console.error('Sync error:', error);
        currentStatusSpan.textContent = `同期エラー: ${error.message}. (データは端末に保持されています)`;
    } finally {
        syncDataButton.disabled = false;
    }
}

// --- Device Reset ---
function resetDevice() {
    if (confirm('端末設定と未同期データをすべてリセットします。よろしいですか？')) {
        localStorage.clear(); // Clear all localStorage settings
        indexedDB.deleteDatabase(DB_NAME); // Delete IndexedDB
        deviceId = crypto.randomUUID(); // Generate new device ID
        settings = {}; // Clear in-memory settings
        appsScriptUrlInput.value = '';
        storeIdInput.value = '';
        pointValueInput.value = '';
        offlineQueueCountSpan.textContent = '0';
        lastSyncTimeSpan.textContent = '未同期';
        currentStatusSpan.textContent = '端末がリセットされました。';
        alert('端末が完全にリセットされました。再設定してください。');
        stopScan();
    }
}

// --- Service Worker Registration ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    }
}

// --- Event Listeners ---
saveSettingsButton.addEventListener('click', saveSettings);
startScanButton.addEventListener('click', startScan);
stopScanButton.addEventListener('click', stopScan);
syncDataButton.addEventListener('click', syncData);
manualInputButton.addEventListener('click', manualInput);
resetButton.addEventListener('click', resetDevice);

// --- Initialize PWA ---
window.addEventListener('load', () => {
    loadSettings();
    updateQueueCount();
    registerServiceWorker();

    // Periodically attempt to sync if online and queue is not empty
    setInterval(async () => {
        if (navigator.onLine && (await getAllEntries()).length > 0) {
            console.log('Online and queue not empty, attempting auto-sync...');
            syncData();
        }
    }, 60 * 1000); // Every 1 minute
});
