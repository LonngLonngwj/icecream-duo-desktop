const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain, dialog, shell } = require('electron');

const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const SCALES = [0.85, 1, 1.25, 1.5];
const DEFAULTS = { scale: 1.25, alwaysOnTop: true, paused: false, position: null };
const APP_ID = 'com.icecreamduo.desktop';

let petWindow = null;
let tray = null;
let preferences = { ...DEFAULTS };
let dragging = null;
let pointerOpaque = true;
let exiting = false;

app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      petWindow.showInactive();
      petWindow.moveTop();
    }
  });

  app.whenReady().then(start);
}

function preferencesPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPreferences() {
  try {
    const stored = JSON.parse(fs.readFileSync(preferencesPath(), 'utf8'));
    return {
      scale: SCALES.includes(stored.scale) ? stored.scale : DEFAULTS.scale,
      alwaysOnTop: typeof stored.alwaysOnTop === 'boolean' ? stored.alwaysOnTop : DEFAULTS.alwaysOnTop,
      paused: typeof stored.paused === 'boolean' ? stored.paused : DEFAULTS.paused,
      position: Number.isInteger(stored.position?.x) && Number.isInteger(stored.position?.y) ? stored.position : null
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function savePreferences() {
  const target = preferencesPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(preferences, null, 2), 'utf8');
  fs.renameSync(temporary, target);
}

function clampPosition(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({ x, y });
  const area = display.workArea;
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height))
  };
}

function defaultPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - width - 20, y: area.y + area.height - height - 20 };
}

function createPetWindow() {
  const width = Math.round(CELL_WIDTH * preferences.scale);
  const height = Math.round(CELL_HEIGHT * preferences.scale);
  const saved = preferences.position || defaultPosition(width, height);
  const position = clampPosition(saved.x, saved.y, width, height);
  petWindow = new BrowserWindow({
    x: position.x,
    y: position.y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: preferences.alwaysOnTop,
    hasShadow: false,
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  petWindow.setMenuBarVisibility(false);
  petWindow.loadFile(path.join(__dirname, 'index.html'));
  petWindow.webContents.once('did-finish-load', () => petWindow?.showInactive());
  petWindow.on('closed', () => { petWindow = null; });
}

function sendPreferences() {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:preferences', preferences);
  }
}

function play(state) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:action', state);
  }
}

function setScale(scale) {
  if (!SCALES.includes(scale) || !petWindow) return;
  preferences.scale = scale;
  const bounds = petWindow.getBounds();
  const width = Math.round(CELL_WIDTH * scale);
  const height = Math.round(CELL_HEIGHT * scale);
  const position = clampPosition(bounds.x, bounds.y + bounds.height - height, width, height);
  petWindow.setBounds({ ...position, width, height });
  preferences.position = position;
  savePreferences();
  sendPreferences();
  updateTrayMenu();
}

function moveToCorner() {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  const position = defaultPosition(bounds.width, bounds.height);
  petWindow.setPosition(position.x, position.y);
  preferences.position = position;
  savePreferences();
}

function menuTemplate() {
  return [
    { label: '打个招呼', click: () => play('waving') },
    { label: '一起跳一下', click: () => play('jumping') },
    { label: '休息', click: () => play('idle') },
    { label: '陪我工作', click: () => play('running') },
    { type: 'separator' },
    {
      label: '大小',
      submenu: SCALES.map((scale) => ({
        label: `${Math.round(scale * 100)}%`,
        type: 'radio',
        checked: preferences.scale === scale,
        click: () => setScale(scale)
      }))
    },
    {
      label: '始终置顶', type: 'checkbox', checked: preferences.alwaysOnTop,
      click: () => {
        preferences.alwaysOnTop = !preferences.alwaysOnTop;
        petWindow?.setAlwaysOnTop(preferences.alwaysOnTop);
        savePreferences();
        updateTrayMenu();
      }
    },
    {
      label: '暂停动画', type: 'checkbox', checked: preferences.paused,
      click: () => {
        preferences.paused = !preferences.paused;
        savePreferences();
        sendPreferences();
        updateTrayMenu();
      }
    },
    { label: '移到屏幕右下角', click: moveToCorner },
    { type: 'separator' },
    { label: '打开安装目录', click: () => shell.showItemInFolder(process.execPath) },
    { label: '关于甜筒双狗', click: () => dialog.showMessageBox(petWindow, {
      type: 'info', title: '甜筒双狗', message: '甜筒双狗 1.0.0',
      detail: '单击打招呼，拖动小狗移动。右键小狗或使用任务栏托盘菜单控制。'
    }) },
    { type: 'separator' },
    { label: '退出', click: () => { exiting = true; app.quit(); } }
  ];
}

function updateTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('甜筒双狗');
  updateTrayMenu();
  tray.on('double-click', () => {
    petWindow?.showInactive();
    petWindow?.moveTop();
  });
}

function start() {
  preferences = loadPreferences();
  createPetWindow();
  createTray();
}

ipcMain.handle('pet:get-preferences', () => preferences);
ipcMain.on('pet:show-menu', () => {
  if (petWindow) Menu.buildFromTemplate(menuTemplate()).popup({ window: petWindow });
});
ipcMain.on('pet:greet', () => play('waving'));
ipcMain.on('pet:pointer-opaque', (_event, opaque) => {
  if (!petWindow || dragging) return;
  if (opaque !== pointerOpaque) {
    pointerOpaque = opaque;
    petWindow.setIgnoreMouseEvents(!opaque, { forward: true });
  }
});
ipcMain.on('pet:drag-start', () => {
  if (!petWindow) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  dragging = { cursor, x: bounds.x, y: bounds.y };
  petWindow.setIgnoreMouseEvents(false);
});
ipcMain.on('pet:drag-move', () => {
  if (!petWindow || !dragging) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  const position = clampPosition(
    dragging.x + cursor.x - dragging.cursor.x,
    dragging.y + cursor.y - dragging.cursor.y,
    bounds.width,
    bounds.height
  );
  petWindow.setPosition(position.x, position.y);
});
ipcMain.on('pet:drag-end', () => {
  if (!petWindow || !dragging) return;
  dragging = null;
  const { x, y } = petWindow.getBounds();
  preferences.position = { x, y };
  savePreferences();
});

app.on('window-all-closed', () => {
  if (exiting) app.quit();
});
