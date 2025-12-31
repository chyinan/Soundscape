// ES 模块导入
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open as dialogOpen, ask } from '@tauri-apps/plugin-dialog';
// Import shell.open from plugin-shell to launch default system browser
import { open as openInBrowser } from '@tauri-apps/plugin-shell';
// 引入语言识别库
import { franc } from 'franc';

import { SilkBackground } from './silk-background.js';
import { InkBackground } from './ink-background.js';
import { CausticsBackground } from './caustics-background.js';
import { AuroraBackground } from './aurora-background.js';
import { getDominantColors } from './color-utils.js';

// ===== DOM ELEMENTS =====

// Main Layout Elements
const container = document.querySelector('.container');
const fileSelectContainer = document.querySelector('.file-select-container');
const playerWrapper = document.getElementById('player-wrapper');
const distortedBg = document.getElementById('player-ui-distorted-bg');
const playerUIGlass = document.getElementById('player-ui-glass');
const visualContainer = document.getElementById('visual-container');
const loadingOverlay = document.getElementById('loadingOverlay');

// Background Elements
const backgroundBlur = document.getElementById('background-blur');
const backgroundVideo = document.getElementById('background-video');
const backgroundSilkCanvas = document.getElementById('background-silk');
const backgroundInkCanvas = document.getElementById('background-ink');
const backgroundCausticsCanvas = document.getElementById('background-caustics');
const backgroundAuroraCanvas = document.getElementById('background-aurora');
const bgModeSelect = document.getElementById('bg-mode-select'); // NEW
const bgModeContainer = document.getElementById('bg-mode-container'); // NEW
const silkBg = new SilkBackground('background-silk'); // Initialize Silk BG
const inkBg = new InkBackground('background-ink'); // Initialize Ink BG
const causticsBg = new CausticsBackground('background-caustics'); // Initialize Caustics BG
const auroraBg = new AuroraBackground('background-aurora'); // Initialize Aurora BG

// Audio Player Elements
const audioPlayer = document.getElementById('audioPlayer');
const loadBtn = document.getElementById('loadBtn');
const albumArt = document.getElementById('albumArt');
const artistNameEl = document.getElementById('artistName');
const songTitleEl = document.getElementById('songTitle');
const progressBarContainer = document.getElementById('progress-bar-container');
const progressBarFill = document.getElementById('progress-bar-fill');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

// Lyrics Elements
const lyricsContainer = document.getElementById('lyrics-container');
const lyricsLinesContainer = document.getElementById('lyrics-lines');
const noLyricsMessage = document.getElementById('no-lyrics-message');
const coverModeLyricsContainer = document.getElementById('cover-mode-lyrics-container');
const coverModeLyrics = document.getElementById('cover-mode-lyrics');

// Settings Panel Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const githubLink = document.getElementById('githubLink');

// Playlist Elements
const playlistBtn = document.getElementById('playlistBtn');
const playlistPanel = document.getElementById('playlistPanel');
const playlistContent = document.querySelector('.playlist-content');
const playlistItems = document.getElementById('playlist-items');
const importFolderBtn = document.getElementById('importFolderBtn');
const clearPlaylistBtn = document.getElementById('clearPlaylistBtn'); // New
const playModeBtn = document.getElementById('playModeBtn');
const playlistEmptyState = document.getElementById('playlist-empty-state');
const importFolderBtnEmpty = document.getElementById('importFolderBtnEmpty');

// Font Selection Elements
const fontChineseSelect = document.getElementById('font-chinese-select');
const fontJapaneseSelect = document.getElementById('font-japanese-select');
const fontEnglishSelect = document.getElementById('font-english-select');
const fontInterfaceSelect = document.getElementById('font-interface-select');

// Style Control Elements
const boldOriginalToggle = document.getElementById('bold-original-toggle');
const boldTranslationToggle = document.getElementById('bold-translation-toggle');
const italicOriginalToggle = document.getElementById('italic-original-toggle');
const italicTranslationToggle = document.getElementById('italic-translation-toggle');
const opacityRange = document.getElementById('lyrics-opacity-range');
const lyricsTextShadowToggle = document.getElementById('lyrics-text-shadow-toggle');
const textShadowToggle = document.getElementById('text-shadow-toggle');

// Color Control Elements
const adaptiveColorToggle = document.getElementById('adaptive-color-toggle');
const customColorPicker = document.getElementById('custom-color-picker');
const customColorContainer = document.getElementById('custom-color-container');
const textOpacityRange = document.getElementById('text-opacity-range');

// Background Control Elements
const customBgBtn = document.getElementById('custom-bg-btn');
const customBgVideoBtn = document.getElementById('custom-bg-video-btn');
const clearCustomBgBtn = document.getElementById('clear-custom-bg-btn');
const customBgContainer = document.getElementById('custom-bg-container');
const albumArtBgContainer = document.getElementById('album-art-bg-container');
const albumArtBgToggle = document.getElementById('album-art-bg-toggle');
const playerCardBgToggle = document.getElementById('player-card-bg-toggle');
const panelAdaptiveColorToggle = document.getElementById('panel-adaptive-color-toggle');
const panelCustomColorPicker = document.getElementById('panel-custom-color-picker');
const panelAdaptiveColorContainer = document.getElementById('panel-adaptive-color-container');
const panelCustomColorContainer = document.getElementById('panel-custom-color-container');
const bgBlurRange = document.getElementById('bg-blur-range');
const bgBlurSetting = document.getElementById('bg-blur-setting');
const playerCardBgBlurRange = document.getElementById('player-card-bg-blur-range');
const playerCardBgBlurContainer = document.getElementById('player-card-bg-blur-container');

/**
 * Wrap ASCII/latin sequences with span.latin so他们使用英文字体
 * @param {string} text raw text line
 * @returns {string} html string with spans
 */
function wrapEnglish(text) {
    // Simple escaping for < & >
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text.split(/([A-Za-z0-9]+)/).map(seg => {
        if (/^[A-Za-z0-9]+$/.test(seg)) {
            return `<span class="latin">${esc(seg)}</span>`;
        }
        return esc(seg);
    }).join('');
}

// 修复：确保加载动画在启动时是隐藏的
loadingOverlay.classList.add('ui-hidden');

// State
    let isSeeking = false;
    let artworkUrl = null;
// 当前正在播放的临时缓存文件路径，用于后续删除
let currentAudioCachePath = null;
let parsedLyrics = [];
let currentLyricIndex = -1;
// State for lyrics display mode
// 0: off, 1: translation only, 2: bilingual (orig/trans), 3: bilingual-reversed (trans/orig), 4: original only, 5: text only, 6: text only (reversed)
let lyricsDisplayMode = 0;
let currentDominantColorRGB = null; // Store dominant color for player card background
let currentBgMode = 'static'; // 'static' or 'silk'

// Playlist State
let playlist = [];
let currentPlaylistIndex = -1;
let playMode = 'loop-list'; // 'loop-list', 'loop-one', 'play-list'
// Removed duplicate declaration of playlistBtnHideTimer

// === Persistence Logic ===

function savePlaylistState() {
    try {
        localStorage.setItem('savedPlaylist', JSON.stringify(playlist));
        localStorage.setItem('savedPlaylistIndex', currentPlaylistIndex.toString());
        // Optionally save playMode
        localStorage.setItem('savedPlayMode', playMode);
    } catch (e) {
        console.error("Failed to save playlist state:", e);
    }
}

function loadPlaylistState() {
    try {
        const savedPlaylist = localStorage.getItem('savedPlaylist');
        const savedIndex = localStorage.getItem('savedPlaylistIndex');
        const savedMode = localStorage.getItem('savedPlayMode');

        if (savedPlaylist) {
            playlist = JSON.parse(savedPlaylist);
            renderPlaylist();
        }

        if (savedIndex !== null) {
            const idx = parseInt(savedIndex, 10);
            if (!isNaN(idx) && idx >= 0 && idx < playlist.length) {
                currentPlaylistIndex = idx;
                // Highlight initial track without playing
                const items = playlistItems.querySelectorAll('.playlist-item');
                items.forEach((item, i) => {
                    if (i === currentPlaylistIndex) item.classList.add('active');
                });
            }
        }
        
        if (savedMode) {
            playMode = savedMode;
            updatePlayModeUI();
        }
        
        if (playlist.length > 0) {
             // If we have a playlist, ensure empty state is hidden
             playlistItems.style.display = 'block';
             playlistEmptyState.style.display = 'none';
        }

    } catch (e) {
        console.error("Failed to load playlist state:", e);
    }
}

function updatePlayModeUI() {
    const icons = {
        'loop-list': 'fa-repeat',
        'loop-one': 'fa-1', 
        'play-list': 'fa-arrow-right'
    };
    const titles = {
        'loop-list': '列表循环',
        'loop-one': '单曲循环',
        'play-list': '列表播放'
    };
    
    const iconClass = icons[playMode];
    if (playMode === 'loop-one') {
         playModeBtn.innerHTML = `<span class="fa-stack" style="font-size: 0.6em;"><i class="fas fa-repeat fa-stack-2x"></i><strong class="fa-stack-1x" style="font-size: 0.7em; margin-top: 1px;">1</strong></span>`;
    } else {
        playModeBtn.innerHTML = `<i class="fas ${iconClass}"></i>`;
    }
    playModeBtn.title = `播放模式: ${titles[playMode]}`;
}

// === Button Auto-Hide Logic ===

function startPlaylistBtnTimer() {
    clearTimeout(playlistBtnHideTimer);
    
    // Only hide if playlist panel is NOT open
    if (!playlistPanel.classList.contains('hidden')) {
        playlistBtn.classList.remove('faded');
        return;
    }

    playlistBtnHideTimer = setTimeout(() => {
        playlistBtn.classList.add('faded');
    }, 5000);
}

function handleButtonInteraction() {
    clearTimeout(playlistBtnHideTimer);
    playlistBtn.classList.remove('faded');
}

let playlistBtnHideTimer = null; // Timer for auto-hiding playlist button

// === NEW: Settings and Font Management (Refactored) ===

/**
 * Injects a <style> tag with a @font-face rule for the given font data.
 * @param {string} fontDataB64 - The base64 encoded font data.
 * @param {string} fontFamilyName - The unique name to assign to this font-face.
 */
function injectFontFace(fontDataB64, fontFamilyName) {
    // 移除旧的同名style标签，避免重复注入
    const oldStyle = document.getElementById(`dynamic-font-style-${fontFamilyName}`);
    if (oldStyle) {
        oldStyle.remove();
    }

    const style = document.createElement('style');
    style.id = `dynamic-font-style-${fontFamilyName}`;
    style.textContent = `
        @font-face {
            font-family: '${fontFamilyName}';
            src: url(data:font/truetype;base64,${fontDataB64});
        }
    `;
    document.head.appendChild(style);
}

/**
 * Applies the selected fonts by fetching their data and injecting them.
 */
async function applySelectedFonts() {
    const fontSelectors = {
        zh: fontChineseSelect,
        ja: fontJapaneseSelect,
        en: fontEnglishSelect,
        interface: fontInterfaceSelect,
    };

    for (const [type, selectElement] of Object.entries(fontSelectors)) {
        const selectedFont = selectElement.value;
        const dynamicFontName = `dynamic-font-${type}`;

        if (selectedFont) {
            try {
                // 调用后端获取字体文件数据
                const fontDataB64 = await invoke('get_font_data', { fontName: selectedFont });
                // 动态注入 @font-face
                injectFontFace(fontDataB64, dynamicFontName);
                // 应用动态字体
                document.documentElement.style.setProperty(`--font-${type}`, `'${dynamicFontName}'`);
            } catch (error) {
                console.error(`Failed to load font ${selectedFont}:`, error);
                // 加载失败则回退到无衬线字体
                document.documentElement.style.setProperty(`--font-${type}`, 'sans-serif');
            }
        } else {
            // 如果选择“默认”，则回退
            document.documentElement.style.setProperty(`--font-${type}`, type === 'interface' ? "'Inter', sans-serif" : 'sans-serif');
        }
    }
}

/**
 * Applies font weight based on bold toggle
 * @param {boolean} isBold
 */
function applyLyricsBold(originalBold, translationBold) {
    document.documentElement.style.setProperty('--lyrics-font-weight-original', originalBold ? '700' : '400');
    document.documentElement.style.setProperty('--lyrics-font-weight-translation', translationBold ? '700' : '400');
}

/**
 * Applies font style (italic) based on italic toggle
 * @param {boolean} originalItalic
 * @param {boolean} translationItalic
 */
function applyLyricsItalic(originalItalic, translationItalic) {
    document.documentElement.style.setProperty('--lyrics-font-style-original', originalItalic ? 'italic' : 'normal');
    document.documentElement.style.setProperty('--lyrics-font-style-translation', translationItalic ? 'italic' : 'normal');
}

/**
 * Applies opacity based on the range value.
 * @param {number} value - The value from the range input (0-100).
 */
function applyLyricsOpacity(value) {
    const alpha = Math.max(0, Math.min(100, value)) / 100;
    document.documentElement.style.setProperty('--lyrics-global-alpha', alpha.toString());
}

/**
 * Applies text shadow to lyrics based on the toggle's state.
 * @param {boolean} isEnabled - Whether the shadow should be enabled.
 */
function applyLyricsTextShadow(isEnabled) {
    // 使用较重的阴影以确保在各种背景下的可读性
    const shadowStyle = isEnabled 
        ? '0 2px 4px rgba(0, 0, 0, 0.8)' 
        : 'none';
    document.documentElement.style.setProperty('--lyrics-text-shadow', shadowStyle);

    // NEW: Also set filter shadow for word-by-word lyrics (which use background-clip)
    const filterStyle = isEnabled
        ? 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
        : 'none';
    document.documentElement.style.setProperty('--lyrics-filter-shadow', filterStyle);
}

/**
 * Applies text shadow based on the toggle's state.
 * @param {boolean} isEnabled - Whether the shadow should be enabled.
 */
function applyTextShadow(isEnabled) {
    const shadowStyle = isEnabled 
        ? '0 2px 4px rgba(0, 0, 0, 0.8)' 
        : 'none';
    document.documentElement.style.setProperty('--adaptive-text-shadow', shadowStyle);
}

/**
 * Applies text opacity based on the range value.
 * @param {number} value - The value from the range input (0-100).
 */
function applyTextOpacity(value) {
    const alpha = Math.max(0, Math.min(100, value)) / 100;
    document.documentElement.style.setProperty('--info-text-opacity', alpha.toString());
}

/**
 * Applies background blur radius based on the range value.
 * @param {number} value - The value from the range input (e.g., 20-100).
 */
function applyBgBlur(value) {
    const radius = Math.max(0, Math.min(100, value));
    document.documentElement.style.setProperty('--bg-blur-radius', `${radius}px`);
}

/**
 * Applies blur to the player card background (distortedBg).
 * @param {number} value - The blur radius in pixels (0-100).
 */
function applyPlayerCardBgBlur(value) {
    const radius = Math.max(0, Math.min(100, value));
    // Apply filter directly to the distortedBg element
    distortedBg.style.filter = `blur(${radius}px)`;
}


function populateFontSelectors(categorizedFonts) {
    const { zhFonts, jaFonts, enFonts, otherFonts } = categorizedFonts;

    const groups = [
        { label: '中文', list: zhFonts, lang: 'zh-CN' },
        { label: '日文', list: jaFonts, lang: 'ja' },
        { label: '英文字体', list: enFonts, lang: 'en' },
        { label: '其他', list: otherFonts, lang: 'en' },
    ];

    const populateWithGroups = (select) => {
        select.innerHTML = '<option value="">默认</option>';
        groups.forEach(group => {
            if (!group.list || group.list.length === 0) return;

            // Sort the list alphabetically based on the localized name
            const sortedList = [...group.list].sort((a, b) => {
                const nameA = getLocalizedFontName(a);
                const nameB = getLocalizedFontName(b);
                return nameA.localeCompare(nameB, group.lang, { sensitivity: 'base' });
            });

            const optgroup = document.createElement('optgroup');
            optgroup.label = group.label;
            
            sortedList.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                // Use localized display name when available
                option.textContent = getLocalizedFontName(name);
                // Render each option using its own font family for live preview
                option.style.fontFamily = `'${name}', sans-serif`;
                // Slightly larger font size for better visibility
                option.style.fontSize = '16px';
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        });
    };

    populateWithGroups(fontChineseSelect);
    populateWithGroups(fontJapaneseSelect);
    populateWithGroups(fontEnglishSelect);
    populateWithGroups(fontInterfaceSelect);
}

async function loadAndPopulateFonts() {
    try {
        const categorizedFonts = await invoke('get_system_fonts');
        populateFontSelectors(categorizedFonts);
        
        // Restore saved font preferences after populating
        const fontRestoreMap = {
            zh: { selector: fontChineseSelect, storage: 'font-zh' },
            ja: { selector: fontJapaneseSelect, storage: 'font-ja' },
            en: { selector: fontEnglishSelect, storage: 'font-en' },
            interface: { selector: fontInterfaceSelect, storage: 'font-interface' }
        };

        for (const [type, config] of Object.entries(fontRestoreMap)) {
            const savedFont = localStorage.getItem(config.storage);
            if (savedFont) {
                config.selector.value = savedFont;
                await applyFontType(type, savedFont);
            }
        }

        // NEW: Setup custom select UI after everything is populated and restored
        [fontChineseSelect, fontJapaneseSelect, fontEnglishSelect, fontInterfaceSelect].forEach(sel => {
            setupCustomSelect(sel);
        });

    } catch (error) {
        console.error("Failed to load system fonts:", error);
    }
}

/**
 * Apply font for a specific type (zh, ja, en, interface)
 * Unified function that handles font application and storage
 */
async function applyFontType(type, fontName) {
    const storageKey = `font-${type}`;
    
    if (fontName) {
        try {
            // Store the preference
            localStorage.setItem(storageKey, fontName);
            
            // Get font data and inject it
            const fontDataB64 = await invoke('get_font_data', { fontName });
            const dynamicFontName = `dynamic-font-${type}`;
            injectFontFace(fontDataB64, dynamicFontName);
            
            // Apply the dynamic font
            document.documentElement.style.setProperty(`--font-${type}`, `'${dynamicFontName}'`);
        } catch (error) {
            console.error(`Failed to load font ${fontName}:`, error);
            // Fallback to sans-serif
            document.documentElement.style.setProperty(`--font-${type}`, 'sans-serif');
        }
    } else {
        // Remove stored preference and revert to default
        localStorage.removeItem(storageKey);
        const defaultFont = type === 'interface' ? "'Inter', sans-serif" : 'sans-serif';
        document.documentElement.style.setProperty(`--font-${type}`, defaultFont);
    }
}

// Unified event listeners for font selection
const fontSelectorMap = {
    'zh': fontChineseSelect,
    'ja': fontJapaneseSelect, 
    'en': fontEnglishSelect,
    'interface': fontInterfaceSelect
};

Object.entries(fontSelectorMap).forEach(([type, selector]) => {
    selector.addEventListener('change', async (e) => {
        await applyFontType(type, e.target.value);
    });
});

/**
 * Sets up all event listeners and initial state for the settings panel.
 */
function setupSettings() {
    // 切换面板显示
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Note: Font selection event listeners are now handled globally above in fontSelectorMap

    // Bold toggle listeners
    const onBoldChange = () => {
        localStorage.setItem('lyricsBoldOriginal', boldOriginalToggle.checked ? '1' : '0');
        localStorage.setItem('lyricsBoldTranslation', boldTranslationToggle.checked ? '1' : '0');
        applyLyricsBold(boldOriginalToggle.checked, boldTranslationToggle.checked);
    };
    boldOriginalToggle.addEventListener('change', onBoldChange);
    boldTranslationToggle.addEventListener('change', onBoldChange);

    // Italic toggle listeners
    const onItalicChange = () => {
        localStorage.setItem('lyricsItalicOriginal', italicOriginalToggle.checked ? '1' : '0');
        localStorage.setItem('lyricsItalicTranslation', italicTranslationToggle.checked ? '1' : '0');
        applyLyricsItalic(italicOriginalToggle.checked, italicTranslationToggle.checked);
    };
    italicOriginalToggle.addEventListener('change', onItalicChange);
    italicTranslationToggle.addEventListener('change', onItalicChange);

    // Opacity range listener
    opacityRange.addEventListener('input', () => {
        const val = parseInt(opacityRange.value, 10);
        localStorage.setItem('lyricsOpacity', val.toString());
        applyLyricsOpacity(val);
    });

    // NEW: Lyrics text shadow listener
    lyricsTextShadowToggle.addEventListener('change', () => {
        const isEnabled = lyricsTextShadowToggle.checked;
        localStorage.setItem('lyricsTextShadowEnabled', isEnabled ? '1' : '0');
        applyLyricsTextShadow(isEnabled);
    });

    // NEW: Text shadow listener
    textShadowToggle.addEventListener('change', () => {
        const isEnabled = textShadowToggle.checked;
        localStorage.setItem('textShadowEnabled', isEnabled ? '1' : '0');
        applyTextShadow(isEnabled);
    });

    // NEW: Adaptive color and custom color listeners
    adaptiveColorToggle.addEventListener('change', () => {
        const isEnabled = adaptiveColorToggle.checked;
        localStorage.setItem('adaptiveColorEnabled', isEnabled ? '1' : '0');
        // Disable/enable custom color picker
        customColorContainer.classList.toggle('disabled', isEnabled);
        // Re-apply colors based on the new state
        updateAdaptiveColors();
    });

    customColorPicker.addEventListener('input', () => {
        const color = customColorPicker.value;
        localStorage.setItem('customColor', color);
        // Only apply if adaptive colors are off
        if (!adaptiveColorToggle.checked) {
            updateAdaptiveColors();
        }
    });

    // NEW: Text opacity listener
    textOpacityRange.addEventListener('input', () => {
        const value = parseInt(textOpacityRange.value, 10);
        localStorage.setItem('textOpacity', value.toString());
        applyTextOpacity(value);
    });

    bgBlurRange.addEventListener('input', () => {
        const value = parseInt(bgBlurRange.value, 10);
        localStorage.setItem('bgBlur', value.toString());
        applyBgBlur(value);
    });

    albumArtBgToggle.addEventListener('change', () => {
        const isEnabled = albumArtBgToggle.checked;
        localStorage.setItem('albumArtBgEnabled', isEnabled ? '1' : '0');
        updateBackgrounds();
    });

    // Background Mode Select Listener
    if (bgModeSelect) {
        bgModeSelect.addEventListener('change', (e) => {
            currentBgMode = e.target.value;
            localStorage.setItem('bgMode', currentBgMode);
            updateBackgroundModeSettingsVisibility();
            updateBackgrounds();
        });
        
        // Restore saved mode
        const savedBgMode = localStorage.getItem('bgMode');
        if (savedBgMode) {
            currentBgMode = savedBgMode;
            bgModeSelect.value = savedBgMode;
        }
        
        // Init custom select for it if needed
        setupCustomSelect(bgModeSelect);
        
        // Update visibility on initialization
        updateBackgroundModeSettingsVisibility();
    }

    playerCardBgToggle.addEventListener('change', () => {
        const isEnabled = playerCardBgToggle.checked;
        localStorage.setItem('playerCardBgEnabled', isEnabled ? '1' : '0');
        updatePanelSettingsVisibility(); // Update visibility of dependent settings
        updateBackgrounds();
    });

    playerCardBgBlurRange.addEventListener('input', () => {
        const value = parseInt(playerCardBgBlurRange.value, 10);
        localStorage.setItem('playerCardBgBlur', value);
        applyPlayerCardBgBlur(value);
    });

    panelAdaptiveColorToggle.addEventListener('change', () => {
        const isEnabled = panelAdaptiveColorToggle.checked;
        localStorage.setItem('panelAdaptiveColorEnabled', isEnabled ? '1' : '0');
        updatePanelSettingsVisibility();
        updateBackgrounds();
    });

    panelCustomColorPicker.addEventListener('input', () => {
        localStorage.setItem('panelCustomColor', panelCustomColorPicker.value);
        updateBackgrounds();
    });


    loadAndPopulateFonts();

    // === Restore Bold / Italic / Opacity settings ===
    const savedBoldOriginal = localStorage.getItem('lyricsBoldOriginal') === '1';
    const savedBoldTranslation = localStorage.getItem('lyricsBoldTranslation') === '1';
    boldOriginalToggle.checked = savedBoldOriginal;
    boldTranslationToggle.checked = savedBoldTranslation;
    applyLyricsBold(savedBoldOriginal, savedBoldTranslation);

    const savedItalicOriginal = localStorage.getItem('lyricsItalicOriginal') === '1';
    const savedItalicTranslation = localStorage.getItem('lyricsItalicTranslation') === '1';
    italicOriginalToggle.checked = savedItalicOriginal;
    italicTranslationToggle.checked = savedItalicTranslation;
    applyLyricsItalic(savedItalicOriginal, savedItalicTranslation);

    const savedOpacity = parseInt(localStorage.getItem('lyricsOpacity'), 10);
    if (!isNaN(savedOpacity)) {
        opacityRange.value = savedOpacity;
        applyLyricsOpacity(savedOpacity);
    }
    
    // NEW: Restore lyrics text shadow setting
    const savedLyricsTextShadow = localStorage.getItem('lyricsTextShadowEnabled') === '1';
    lyricsTextShadowToggle.checked = savedLyricsTextShadow;
    applyLyricsTextShadow(savedLyricsTextShadow);

    // NEW: Restore text shadow setting
    const savedTextShadow = localStorage.getItem('textShadowEnabled') === '1';
    textShadowToggle.checked = savedTextShadow;
    applyTextShadow(savedTextShadow);
    
    // NEW: Restore adaptive color, custom color, and text opacity
    const savedAdaptiveEnabled = localStorage.getItem('adaptiveColorEnabled') !== '0'; // Default to true
    adaptiveColorToggle.checked = savedAdaptiveEnabled;
    customColorContainer.classList.toggle('disabled', savedAdaptiveEnabled);

    const savedCustomColor = localStorage.getItem('customColor') || '#ffffff';
    customColorPicker.value = savedCustomColor;
    
    const savedTextOpacity = parseInt(localStorage.getItem('textOpacity'), 10);
    if (!isNaN(savedTextOpacity)) {
        textOpacityRange.value = savedTextOpacity;
        applyTextOpacity(savedTextOpacity);
    } else {
        applyTextOpacity(100); // Default
    }

    const savedBgBlur = parseInt(localStorage.getItem('bgBlur'), 10);
    if (!isNaN(savedBgBlur)) {
        bgBlurRange.value = savedBgBlur;
        applyBgBlur(savedBgBlur);
    } else {
        applyBgBlur(50); // Default
    }

    // Restore album art background toggle state
    const savedAlbumArtBgEnabled = localStorage.getItem('albumArtBgEnabled') !== '0'; // Default to true
    albumArtBgToggle.checked = savedAlbumArtBgEnabled;

    const savedPlayerCardBgEnabled = localStorage.getItem('playerCardBgEnabled') !== '0'; // Default to true
    playerCardBgToggle.checked = savedPlayerCardBgEnabled;

    const savedPlayerCardBgBlur = parseInt(localStorage.getItem('playerCardBgBlur'), 10);
    if (!isNaN(savedPlayerCardBgBlur)) {
        playerCardBgBlurRange.value = savedPlayerCardBgBlur;
        applyPlayerCardBgBlur(savedPlayerCardBgBlur);
    } else {
        playerCardBgBlurRange.value = 0; // Default no blur
        applyPlayerCardBgBlur(0);
    }

    // Restore panel color settings
    const savedPanelAdaptiveColorEnabled = localStorage.getItem('panelAdaptiveColorEnabled') !== '0'; // Default true
    panelAdaptiveColorToggle.checked = savedPanelAdaptiveColorEnabled;

    const savedPanelCustomColor = localStorage.getItem('panelCustomColor') || '#ffffff';
    panelCustomColorPicker.value = savedPanelCustomColor;

    // Restore custom background (path only)
    const savedBgPath = localStorage.getItem('customBgPath');
    if (savedBgPath) {
        // Just ensure the path is known, updateBackgrounds will handle the rest.
    }
    
    // Initial UI update for background controls
    updatePanelSettingsVisibility();
    updateBackgroundModeSettingsVisibility();
    updateBackgrounds();
    // 根据当前自适应/自定义选项立即应用文本颜色
    updateAdaptiveColors();
}

/**
 * CORE BACKGROUND LOGIC: Updates all background layers based on current settings.
 * This is the single source of truth for background changes.
 */
function updatePanelSettingsVisibility() {
    const isPanelBgEnabled = playerCardBgToggle.checked;
    const isAdaptiveEnabled = panelAdaptiveColorToggle.checked;

    // Show panel settings only if panel background is disabled
    if (isPanelBgEnabled) {
        panelAdaptiveColorContainer.classList.add('hidden');
        panelCustomColorContainer.classList.add('hidden');
        // Show blur settings when panel background is ENABLED
        if (playerCardBgBlurContainer) playerCardBgBlurContainer.classList.remove('hidden');
    } else {
        panelAdaptiveColorContainer.classList.remove('hidden');
        // Show custom color picker only if adaptive color is disabled
        if (isAdaptiveEnabled) {
            panelCustomColorContainer.classList.add('hidden');
        } else {
            panelCustomColorContainer.classList.remove('hidden');
        }
        // Hide blur settings when panel background is DISABLED
        if (playerCardBgBlurContainer) playerCardBgBlurContainer.classList.add('hidden');
    }
}

/**
 * Updates the visibility of background-related settings based on the current background mode.
 * In non-static modes, album art background and custom background settings should be hidden.
 */
function updateBackgroundModeSettingsVisibility() {
    const shouldHideSettings = currentBgMode !== 'static';
    
    if (shouldHideSettings) {
        // Hide and disable album art background setting
        if (albumArtBgContainer) {
            albumArtBgContainer.classList.add('hidden');
        }
        if (albumArtBgToggle) {
            albumArtBgToggle.disabled = true;
        }
        
        // Hide and disable custom background setting
        if (customBgContainer) {
            customBgContainer.classList.add('hidden');
        }
        if (customBgBtn) {
            customBgBtn.disabled = true;
        }
        if (customBgVideoBtn) {
            customBgVideoBtn.disabled = true;
        }
        if (clearCustomBgBtn) {
            clearCustomBgBtn.disabled = true;
        }
    } else {
        // Show and enable album art background setting
        if (albumArtBgContainer) {
            albumArtBgContainer.classList.remove('hidden');
        }
        if (albumArtBgToggle) {
            albumArtBgToggle.disabled = false;
        }
        
        // Show and enable custom background setting
        if (customBgContainer) {
            customBgContainer.classList.remove('hidden');
        }
        if (customBgBtn) {
            customBgBtn.disabled = false;
        }
        if (customBgVideoBtn) {
            customBgVideoBtn.disabled = false;
        }
        if (clearCustomBgBtn) {
            clearCustomBgBtn.disabled = false;
        }
    }
}

function getPanelColorRGB() {
    if (panelAdaptiveColorToggle.checked) {
        return currentDominantColorRGB || { r: 100, g: 100, b: 100 };
    } else {
        const hexColor = panelCustomColorPicker.value;
        let r = 255, g = 255, b = 255;
        if (hexColor.startsWith('#')) {
            const hex = hexColor.substring(1);
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
        }
        return { r, g, b };
    }
}

function updateBackgrounds() {
    const useAlbumArtBg = albumArtBgToggle.checked;
    const customBgPath = localStorage.getItem('customBgPath');
    const customBgVideoPath = localStorage.getItem('customBgVideoPath'); // NEW: Get video path

    // Rule 1: Control the custom background selector UI
    // Only apply this rule if in static mode
    if (currentBgMode === 'static') {
        customBgContainer.classList.toggle('disabled', useAlbumArtBg);
    }

    // Rule 2: Determine player's distorted background
    if (artworkUrl) {
        if (playerCardBgToggle.checked) {
            distortedBg.style.backgroundImage = `url(${artworkUrl})`;
            distortedBg.style.backgroundColor = '';
            // Apply blur setting
            const blurVal = parseInt(playerCardBgBlurRange.value, 10) || 0;
            distortedBg.style.filter = `blur(${blurVal}px)`;
        } else {
            distortedBg.style.backgroundImage = 'none';
            distortedBg.style.filter = 'none'; // Ensure no blur in color mode
            
            const { r, g, b } = getPanelColorRGB();
            distortedBg.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
        }
    } else {
        distortedBg.style.backgroundImage = 'none';
        distortedBg.style.backgroundColor = '';
        distortedBg.style.filter = 'none';
    }

    // Rule 3: Determine the main, bottom-layer background
    let finalBgUrl = null;
    let finalVideoUrl = null;

    // Handle Silk Mode
    if (currentBgMode === 'silk') {
        backgroundSilkCanvas.classList.add('active');
        backgroundInkCanvas.classList.remove('active'); // Hide Ink
        backgroundCausticsCanvas.classList.remove('active'); // Hide Caustics
        backgroundAuroraCanvas.classList.remove('active'); // Hide Aurora
        inkBg.stop(); // Stop Ink
        causticsBg.stop(); // Stop Caustics
        auroraBg.stop(); // Stop Aurora

        backgroundBlur.classList.add('hidden-by-mode');
        backgroundVideo.classList.add('hidden-by-mode');
        silkBg.start();
        
        // Extract colors if we have an image
        if (albumArt.src && albumArt.src !== window.location.href) {
            getDominantColors(albumArt).then(colors => {
                silkBg.updateColors(colors, getPanelColorRGB());
            });
        }
        
        return; 
    } 
    // Handle Ink Mode
    else if (currentBgMode === 'ink') {
        backgroundInkCanvas.classList.add('active');
        backgroundSilkCanvas.classList.remove('active'); // Hide Silk
        backgroundCausticsCanvas.classList.remove('active'); // Hide Caustics
        backgroundAuroraCanvas.classList.remove('active'); // Hide Aurora
        silkBg.stop(); // Stop Silk
        causticsBg.stop(); // Stop Caustics
        auroraBg.stop(); // Stop Aurora

        backgroundBlur.classList.add('hidden-by-mode');
        backgroundVideo.classList.add('hidden-by-mode');
        inkBg.start();
        
        // Extract colors if we have an image
        if (albumArt.src && albumArt.src !== window.location.href) {
            getDominantColors(albumArt).then(colors => {
                inkBg.updateColors(colors, getPanelColorRGB());
            });
        }
        
        return;
    }
    // Handle Caustics Mode
    else if (currentBgMode === 'caustics') {
        backgroundCausticsCanvas.classList.add('active');
        backgroundSilkCanvas.classList.remove('active'); // Hide Silk
        backgroundInkCanvas.classList.remove('active'); // Hide Ink
        backgroundAuroraCanvas.classList.remove('active'); // Hide Aurora
        silkBg.stop(); // Stop Silk
        inkBg.stop(); // Stop Ink
        auroraBg.stop(); // Stop Aurora

        backgroundBlur.classList.add('hidden-by-mode');
        backgroundVideo.classList.add('hidden-by-mode');
        causticsBg.start();
        
        // Extract colors if we have an image
        if (albumArt.src && albumArt.src !== window.location.href) {
            getDominantColors(albumArt).then(colors => {
                causticsBg.updateColors(colors, getPanelColorRGB());
            });
        }
        
        return;
    }
    // Handle Aurora Mode
    else if (currentBgMode === 'aurora') {
        backgroundAuroraCanvas.classList.add('active');
        backgroundSilkCanvas.classList.remove('active');
        backgroundInkCanvas.classList.remove('active');
        backgroundCausticsCanvas.classList.remove('active');
        silkBg.stop();
        inkBg.stop();
        causticsBg.stop();

        backgroundBlur.classList.add('hidden-by-mode');
        backgroundVideo.classList.add('hidden-by-mode');
        auroraBg.start();
        
        if (albumArt.src && albumArt.src !== window.location.href) {
            getDominantColors(albumArt).then(colors => {
                auroraBg.updateColors(colors, getPanelColorRGB());
            });
        }
        
        return;
    }
    else {
        backgroundSilkCanvas.classList.remove('active');
        backgroundInkCanvas.classList.remove('active');
        backgroundCausticsCanvas.classList.remove('active');
        backgroundAuroraCanvas.classList.remove('active');
        silkBg.stop();
        inkBg.stop();
        causticsBg.stop();
        auroraBg.stop();
        
        backgroundBlur.classList.remove('hidden-by-mode');
        backgroundVideo.classList.remove('hidden-by-mode');
    }

    if (useAlbumArtBg) {
        finalBgUrl = artworkUrl; // Use album art if toggle is on
    } else if (customBgVideoPath) {
        finalVideoUrl = convertFileSrc(customBgVideoPath); // Prioritize video
    } else if (customBgPath) {
        finalBgUrl = convertFileSrc(customBgPath); // Fallback to custom image BG
    }

    // Apply image background
    if (finalBgUrl) {
        backgroundBlur.style.backgroundImage = `url(${finalBgUrl})`;
        backgroundBlur.classList.add('active');
    } else {
        backgroundBlur.style.backgroundImage = 'none';
        backgroundBlur.classList.remove('active');
    }

    // Apply video background
    if (finalVideoUrl) {
        backgroundVideo.src = finalVideoUrl;
        backgroundVideo.classList.add('active');
        backgroundVideo.play();
    } else {
        backgroundVideo.src = '';
        backgroundVideo.classList.remove('active');
    }
}

/**
 * Removes all custom backgrounds (both image and video) and updates the display.
 * This function now uses the centralized updateBackgrounds() logic.
 */
function clearCustomBackground() {
    localStorage.removeItem('customBgPath');
    localStorage.removeItem('customBgVideoPath');
    updateBackgrounds(); // Use centralized logic instead of manual updates
}


// === 颜色工具函数和自适应主题 ===
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s; const l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h *= 60;
        }
        return { h, s, l };
    }

    function hslToRgb(h, s, l) {
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r1, g1, b1;
        if (h < 60) { r1 = c; g1 = x; b1 = 0; }
        else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
        else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
        else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
        else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x; }
        return {
            r: Math.round((r1 + m) * 255),
            g: Math.round((g1 + m) * 255),
            b: Math.round((b1 + m) * 255)
        };
    }

    function applyAdaptiveColors({ text, bgAlpha = 0.2 }) {
        const root = document.documentElement.style;
        root.setProperty('--adaptive-text-color', text);
        root.setProperty('--adaptive-progress-fill', text);

        let r = 255, g = 255, b = 255; // Default to white components

        const rgbMatch = text.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
        } else if (text.startsWith('#')) {
            const hex = text.substring(1);
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
        }
        
        root.setProperty('--adaptive-progress-bg', `rgba(${r},${g},${b},${bgAlpha})`);
    }

    // Use white text for better contrast on dark backgrounds

    function updateAdaptiveColors() {
        if (adaptiveColorToggle.checked) {
            // If there's album art, re-run analysis. Otherwise, reset to default.
            if (artworkUrl) {
                analyzeImageAndApplyColors(artworkUrl);
            } else {
                applyAdaptiveColors({ text: '#ffffff' });
            }
        } else {
            // Use the custom color from the picker.
            applyAdaptiveColors({ text: customColorPicker.value });
        }
    }

    function analyzeImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const { naturalWidth: w, naturalHeight: h } = img;
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                const sample = 1200;
                let rSum = 0, gSum = 0, bSum = 0;

                // Sample from a central rectangle in the bottom half of the image for better accuracy
                const sampleXStart = w * 0.25; // Start 25% from the left
                const sampleWidth = w * 0.5;   // Sample a 50% horizontal slice
                const sampleYStart = h * 0.55; // Start from 55% down
                const sampleHeight = h * 0.35; // Sample a 35% vertical slice

                for (let i = 0; i < sample; i++) {
                    const x = (sampleXStart + (Math.random() * sampleWidth)) | 0;
                    const y = (sampleYStart + (Math.random() * sampleHeight)) | 0;
                    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
                    rSum += r; gSum += g; bSum += b;
                }
                const r = rSum / sample;
                const g = gSum / sample;
                const b = bSum / sample;
                // Use perceptive luminance for better accuracy
                const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
                resolve({ r, g, b, luminance });
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    function analyzeImageAndApplyColors(imageUrl) {
        return analyzeImage(imageUrl).then((info) => {
            if (!info) {
                currentDominantColorRGB = null;
                updateBackgrounds();
                // Fallback to white if analysis fails AND adaptive color is enabled
                if (adaptiveColorToggle.checked) {
                    applyAdaptiveColors({ text: '#ffffff' });
                }
                return;
            }
            
            const { r, g, b, luminance } = info;
            currentDominantColorRGB = { r, g, b };
            updateBackgrounds(); // Apply color to player card if needed
    
            // Only apply text color if adaptive toggle is checked
            if (adaptiveColorToggle.checked) {
                // If the bottom half is dark (luminance < 140), use white text.
                // The threshold was increased from 128 to 140 to be more sensitive
                // to darker backgrounds, ensuring white text is used more appropriately.
                if (luminance < 140) {
                    applyAdaptiveColors({ text: '#ffffff' }); // Uses white text
                } else {
                    // If the bottom half is light, find a contrasting dark color.
                    const { h, s, l } = rgbToHsl(r, g, b);
                    if (s < 0.2) {
                        // For low saturation colors (grays), just use a dark gray.
                        applyAdaptiveColors({ text: '#222222' });
                    } else {
                        // For saturated colors, make it much darker.
                        const newL = Math.max(0, l - 0.45);
                        const { r: dr, g: dg, b: db } = hslToRgb(h, s, newL);
                        const textColor = `rgb(${dr},${dg},${db})`;
                        applyAdaptiveColors({ text: textColor });
                    }
                }
            }
        });
    }

// 获取当前窗口实例
const appWindow = WebviewWindow.getCurrent();

let activeLoadToken = 0;

async function handleFile(filePath, autoPlay = true) {
    if (!filePath) {
        // This case handles when the user cancels the dialog
        console.log("File selection was cancelled.");
        return;
    }
    
    // Increment token to invalidate any previous pending load/play operations
    const currentToken = ++activeLoadToken;
    
    showLoading('Processing Audio...');

    try {
        // 在真正准备就绪前保持文件选择页，仅显示 Loading 遮罩
        // Reset UI from previous track
        resetPlayerUI();

        console.log('选择的文件:', filePath);

        // 如果之前有缓存文件，先让后端尝试删除
        if (currentAudioCachePath) {
            invoke('cleanup_cached_file', { path: currentAudioCachePath }).catch(() => {});
            currentAudioCachePath = null;
        }

        const result = await invoke('prepare_audio_file', { path: encodeURIComponent(filePath) });

        // 将返回的临时文件路径转换为可以在 WebView 中访问的 asset URL
        const audioUrl = convertFileSrc(result.cachePath);
        currentAudioCachePath = result.cachePath;

        console.log('处理结果:', result);

        if (result.lyrics) {
            const lyricText = result.lyrics;
            parsedLyrics = parseLRC(lyricText);
            console.log(`Parsed ${parsedLyrics.length} lines of lyrics.`);
            noLyricsMessage.classList.toggle('hidden', parsedLyrics.length > 0);
            renderAllLyricsOnce();
        } else {
            console.log('No embedded lyrics found from backend.');
            parsedLyrics = [];
            renderAllLyricsOnce();
            noLyricsMessage.classList.remove('hidden');
        }
        updateLyrics(0);

        artistNameEl.textContent = result.metadata.artist || 'Unknown Artist';
        songTitleEl.textContent = result.metadata.title || 'Unknown Title';

        // Manually trigger check after new text is set.
        // A small timeout helps ensure scrollWidth is updated.
        setTimeout(() => {
            // applyMarquee(songTitleEl);
            // applyMarquee(artistNameEl);
        }, 100);

        if (result.albumArtBase64) {
            const mimeType = result.metadata.mimeType || 'image/jpeg';
            artworkUrl = `data:${mimeType};base64,${result.albumArtBase64}`;
            albumArt.src = artworkUrl;
            albumArt.style.display = 'block';
            
            // Always analyze image to get dominant color for background
            analyzeImageAndApplyColors(artworkUrl);

            // If adaptive color is disabled, ensure custom color is applied
            if (!adaptiveColorToggle.checked) {
                updateAdaptiveColors();
            }
        } else {
            // No artwork found.
            artworkUrl = '';
            albumArt.src = '';
            albumArt.style.display = 'none';
            applyAdaptiveColors({ text: '#ffffff' });
        }

        // After updating artworkUrl, refresh all backgrounds
        updateBackgrounds();

        // 设置音频并等待 metadata，确保进度条和时长已就绪
        const finalizeTransition = () => {
            fileSelectContainer.classList.add('hidden');
            githubLink.classList.add('hidden');
            settingsBtn.classList.add('hidden'); // Hide settings icon
            playerWrapper.classList.remove('hidden');
            hideLoading();
        };

        audioPlayer.src = audioUrl;

        const readyHandler = () => {
            // If another file load started, ignore this one
            if (currentToken !== activeLoadToken) return;

            finalizeTransition();
            audioPlayer.removeEventListener('loadedmetadata', readyHandler);
            if (autoPlay) {
                audioPlayer.play()
                    .then(() => {
                        // Force start timer on successful play
                        startPlaylistBtnTimer();
                    })
                    .catch(e => console.error('Audio playback failed:', e));
            }
        };

        // 如果 metadata 已经可用，就直接执行，否则等待事件
        if (audioPlayer.readyState >= 1) {
            readyHandler();
        } else {
            audioPlayer.addEventListener('loadedmetadata', readyHandler);
            audioPlayer.load();
        }

        // 其余过渡均在 finalizeTransition 中处理

    } catch (error) {
        console.error('处理音频时出错:', error);
        alert(`Error: ${error}`);
        hideLoading();
    } finally {
        // hideLoading 会在 finalizeTransition 中处理
    }
}

// === Playlist Logic ===

async function importFolder() {
    try {
        const selected = await dialogOpen({
            directory: true,
            multiple: false,
        });
        
        if (selected) {
            showLoading('Scanning Folder...');
            // Call backend to scan folder
            const files = await invoke('scan_music_folder', { path: selected });
            
            if (files && files.length > 0) {
                // Append or Replace? Let's Replace for now as it's cleaner
                playlist = files;
                currentPlaylistIndex = 0;
                renderPlaylist();
                // savePlaylistState(); // Save state
                if (typeof savePlaylistState === 'function') savePlaylistState();
                
                // Automatically play the first track
                if (playlist.length > 0) {
                    // playTrackAtIndex(0); // Removed to prevent auto-play
                    currentPlaylistIndex = 0;
                    const track = playlist[0];
                    
                    // Highlight UI but don't play
                    const items = playlistItems.querySelectorAll('.playlist-item');
                    items.forEach((item, idx) => {
                        if (idx === 0) item.classList.add('active');
                        else item.classList.remove('active');
                    });
                    
                    // Load file but pause
                    await handleFile(track.path, false);
                }
            } else {
                alert('No supported audio files found in this folder.');
            }
            hideLoading();
        }
    } catch (e) {
        console.error("Error importing folder:", e);
        hideLoading();
        alert('Failed to import folder.');
    }
}

async function clearPlaylist() {
    const confirmed = await ask('确定要清空播放列表吗？', { title: '聆境（Soundscape）', kind: 'warning' });
    if (confirmed) {
        playlist = [];
        currentPlaylistIndex = -1;
        renderPlaylist();
        
        // Clear saved state
        if (typeof savePlaylistState === 'function') savePlaylistState();
        
        // Don't reset player UI so the current song keeps playing
        // resetPlayerUI();
    }
}

function deleteTrackAtIndex(index, event) {
    if (event) event.stopPropagation();
    
    // 从播放列表中删除该歌曲
    playlist.splice(index, 1);

    // 如果删除的是当前正在播放的歌曲
    if (index === currentPlaylistIndex) {
        // 调整 currentPlaylistIndex，使其指向删除后列表中的正确位置（即原来的上一首）
        // 这样可以保证当前播放不受影响，且当当前歌曲播放结束时，
        // playNext() 计算出的下一首（(current + 1)）会是原本的下一首（现在的 index 位置）。
        
        if (playlist.length === 0) {
            // 如果列表空了
            currentPlaylistIndex = -1;
            // 此时不需要立即停止播放，让当前歌播完。
            // 播完后 playNext 会处理空列表的情况。
        } else {
            // 指向上一首。如果删的是第一首(index=0)，变成 -1，也是合理的。
            currentPlaylistIndex = index - 1;
        }
        
        // 注意：不调用 playTrackAtIndex，也不暂停，保持当前播放。
        // UI 上，高亮可能会跳到上一首，或者如果没有上一首就不高亮，这是符合逻辑的副作用。
        
    } else if (index < currentPlaylistIndex) {
        // 如果删除的歌曲在当前播放歌曲之前，当前索引需要减1以保持指向同一首歌
        currentPlaylistIndex--;
    }
    // 如果删除的在后面，currentPlaylistIndex 不变

    if (typeof savePlaylistState === 'function') savePlaylistState();
    renderPlaylist();
}

// 拖拽相关变量
let dragSrcEl = null;
let dragSrcIndex = -1;
let lastDragOverState = null; // 记录上一次的拖拽悬停状态
let lastMouseY = null; // 记录上一次鼠标Y坐标
let dragOverThrottleTimer = null; // 节流定时器

function renderPlaylist() {
    playlistItems.innerHTML = '';
    
    // 在整个播放列表面板设置拖放处理，确保任何位置都允许拖放
    // 这样即使鼠标移动到面板任何区域，都不会显示禁止符号
    const setupDragOverHandler = (element) => {
        if (!element) return;
        element.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        element.ondragenter = (e) => {
            e.preventDefault();
        };
        element.ondrop = (e) => {
            e.preventDefault();
        };
    };
    
    setupDragOverHandler(playlistPanel);
    setupDragOverHandler(playlistContent);
    // 使用 addEventListener 替代 ondragover 以避免覆盖，增加鲁棒性
    if (playlistItems) {
        playlistItems.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        playlistItems.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
    }
    
    if (playlist.length === 0) {
        playlistItems.style.display = 'none';
        playlistEmptyState.style.display = 'flex';
    } else {
        playlistItems.style.display = 'block';
        playlistEmptyState.style.display = 'none';
        
        playlist.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            li.draggable = true; // 启用拖拽
            
            if (index === currentPlaylistIndex) {
                li.classList.add('active');
            }
            
            // 歌曲名称容器
            const nameSpan = document.createElement('span');
            nameSpan.textContent = track.name;
            nameSpan.style.flexGrow = '1';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            li.appendChild(nameSpan);
            
            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
            deleteBtn.title = '从列表中删除';
            deleteBtn.onclick = (e) => deleteTrackAtIndex(index, e);
            // 防止在删除按钮上触发拖拽
            deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            li.appendChild(deleteBtn);
            
            // 点击播放
            li.onclick = (e) => {
                // 避免触发删除按钮的点击
                if (e.target.closest('.delete-btn')) return;
                playTrackAtIndex(index);
            };

            // === 拖拽事件监听 ===
            li.addEventListener('dragstart', (e) => {
                console.log('Drag Start:', index);
                dragSrcEl = li;
                dragSrcIndex = index;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index.toString());
                
                // 重置状态变量
                lastDragOverState = null;
                lastMouseY = null;
                if (dragOverThrottleTimer) {
                    clearTimeout(dragOverThrottleTimer);
                    dragOverThrottleTimer = null;
                }
                
                // 延迟添加 dragging 类，让浏览器先捕获拖拽预览图
                setTimeout(() => {
                    li.classList.add('dragging');
                    // 给容器添加标记，用于 CSS 选择器
                    playlistItems.classList.add('is-dragging');
                }, 10);
            });

            li.addEventListener('dragend', () => {
                console.log('Drag End');
                li.classList.remove('dragging');
                playlistItems.classList.remove('is-dragging');
                
                // 清除所有定时器和状态
                if (dragOverThrottleTimer) {
                    clearTimeout(dragOverThrottleTimer);
                    dragOverThrottleTimer = null;
                }
                lastDragOverState = null;
                lastMouseY = null;
                
                // 清除所有悬停状态
                const items = playlistItems.querySelectorAll('.playlist-item');
                items.forEach(item => {
                    item.classList.remove('drag-over-top');
                    item.classList.remove('drag-over-bottom');
                });
            });

            li.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                // 跳过拖拽源本身
                if (li === dragSrcEl) return;

                // 如果当前项目已经有状态了（由 dragenter 设置），且鼠标移动不大，就不更新
                const hasState = li.classList.contains('drag-over-top') || li.classList.contains('drag-over-bottom');
                const mouseY = e.clientY;
                
                // 只有在鼠标明显移动（超过10px）且当前没有状态，或者需要切换状态时才处理
                if (hasState) {
                    // 已经有状态了，检查是否需要切换
                    if (lastMouseY !== null && Math.abs(mouseY - lastMouseY) < 15) {
                        return; // 鼠标移动不大，保持当前状态
                    }
                }

                lastMouseY = mouseY;

                // 使用节流减少处理频率
                if (dragOverThrottleTimer) {
                    return;
                }
                dragOverThrottleTimer = setTimeout(() => {
                    dragOverThrottleTimer = null;
                }, 150); // 增加到150ms，进一步减少频率

                const rect = li.getBoundingClientRect();
                const itemHeight = rect.height;
                const midY = rect.top + itemHeight / 2;
                const distanceFromMid = Math.abs(mouseY - midY);
                const deadZone = itemHeight * 0.35; // 35% 死区

                // 只有在死区外且状态需要改变时才更新
                if (distanceFromMid > deadZone) {
                    const newState = mouseY < midY ? 'top' : 'bottom';
                    const stateKey = `${index}-${newState}`;
                    
                    // 只有状态真正改变时才更新
                    if (lastDragOverState !== stateKey) {
                        lastDragOverState = stateKey;
                        
                        if (newState === 'top') {
                            li.classList.add('drag-over-top');
                            li.classList.remove('drag-over-bottom');
                        } else {
                            li.classList.add('drag-over-bottom');
                            li.classList.remove('drag-over-top');
                        }
                    }
                } else if (hasState) {
                    // 在死区内，清除状态（但只在已有状态时才清除，避免频繁操作）
                    if (lastDragOverState && lastDragOverState.startsWith(`${index}-`)) {
                        lastDragOverState = null;
                        li.classList.remove('drag-over-top');
                        li.classList.remove('drag-over-bottom');
                    }
                }
            });

            li.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // 跳过拖拽源本身
                if (li === dragSrcEl) return;
                
                // 在 dragenter 时根据鼠标位置设置初始状态
                const rect = li.getBoundingClientRect();
                const itemHeight = rect.height;
                const midY = rect.top + itemHeight / 2;
                const mouseY = e.clientY;
                const distanceFromMid = Math.abs(mouseY - midY);
                const deadZone = itemHeight * 0.4;
                
                // 清除其他项目的状态
                const items = playlistItems.querySelectorAll('.playlist-item');
                items.forEach(item => {
                    if (item !== li) {
                        item.classList.remove('drag-over-top');
                        item.classList.remove('drag-over-bottom');
                    }
                });
                
                // 只有在死区外才设置状态
                if (distanceFromMid > deadZone) {
                    if (mouseY < midY) {
                        li.classList.add('drag-over-top');
                        li.classList.remove('drag-over-bottom');
                        lastDragOverState = `${index}-top`;
                    } else {
                        li.classList.add('drag-over-bottom');
                        li.classList.remove('drag-over-top');
                        lastDragOverState = `${index}-bottom`;
                    }
                    lastMouseY = mouseY;
                }
            });

            li.addEventListener('dragleave', (e) => {
                // 只有真正离开元素时才移除类（避免子元素触发）
                if (!li.contains(e.relatedTarget)) {
                    // 清除该项目的状态记录
                    if (lastDragOverState && lastDragOverState.startsWith(`${index}-`)) {
                        lastDragOverState = null;
                    }
                    li.classList.remove('drag-over-top');
                    li.classList.remove('drag-over-bottom');
                }
            });

            li.addEventListener('drop', (e) => {
                console.log('Drop on:', index);
                e.preventDefault();
                e.stopPropagation();
                
                if (dragSrcEl && dragSrcEl !== li) {
                    // 计算目标索引
                    let targetIndex = index;
                    
                    // 再次判断鼠标位置，确认是放在上面还是下面
                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    
                    // 如果放在上半部分，targetIndex 就是当前 index（插入到当前之前）
                    // 如果放在下半部分，targetIndex 就是 index + 1（插入到当前之后）
                    // 注意：数组操作时，先移除原元素，索引会变，需小心处理
                    
                    // 简化逻辑：我们只交换数据，或者移动数据
                    // 移动数据逻辑：
                    // 1. 取出源数据
                    // 2. 插入到目标位置
                    
                    const itemToMove = playlist[dragSrcIndex];
                    
                    // 从原位置删除
                    playlist.splice(dragSrcIndex, 1);
                    
                    // 因为删除元素后，如果原位置在目标位置之前，目标索引需要减1
                    // 但如果我们在删除之前计算好了插入位置，就比较简单
                    // 这里我们采用更健壮的方式：
                    // 如果 dragSrcIndex < index (从上往下拖)，且放在下半部分(insertAfter)，实际插入 index
                    // 如果 dragSrcIndex < index (从上往下拖)，且放在上半部分(insertBefore)，实际插入 index - 1
                    
                    // 重新调整策略：根据视觉反馈
                    let insertAtIndex = index;
                    if (e.clientY > midY) {
                         insertAtIndex = index + 1;
                    }
                    
                    // 修正：如果源在目标之前，删除源后，目标索引减1
                    if (dragSrcIndex < insertAtIndex) {
                        insertAtIndex--;
                    }

                    playlist.splice(insertAtIndex, 0, itemToMove);
                    
                    // 更新 currentPlaylistIndex
                    // 如果移动的是当前播放的歌曲
                    if (currentPlaylistIndex === dragSrcIndex) {
                        currentPlaylistIndex = insertAtIndex;
                    } else {
                        // 如果移动的不是当前歌曲，但跨越了当前歌曲
                        // 情况A: 当前歌曲在 移动源 和 移动目标 之间
                        // ... 逻辑比较复杂，简单判断：
                        // 如果当前播放歌曲在前面，被移到了后面 -> 不需要，因为已经更新了playlist
                        // 我们只需要找到当前正在播放的歌曲的新索引
                        // 但由于对象引用可能变了（如果我们存的是对象），或者简单点：
                        // 我们在 render 前，不需要太复杂，因为我们已经重新排列了数组。
                        // 唯一的问题是 currentPlaylistIndex 指向的数字可能不再对应原来的歌。
                        
                        // 解决方案：由于我们移动的是数组元素，当前播放的歌曲对象还在数组里。
                        // 如果我们能根据"是否是正在播放的那首歌"来重置 currentPlaylistIndex 最好。
                        // 但这里没有唯一 ID。假设名字不重复？不一定。
                        // 比较好的办法是：记录当前播放状态，移动后重新计算。
                        
                        // 简化版逻辑修正：
                        if (dragSrcIndex < currentPlaylistIndex && insertAtIndex >= currentPlaylistIndex) {
                            currentPlaylistIndex--;
                        } else if (dragSrcIndex > currentPlaylistIndex && insertAtIndex <= currentPlaylistIndex) {
                            currentPlaylistIndex++;
                        }
                    }

                    if (typeof savePlaylistState === 'function') savePlaylistState();
                    renderPlaylist();
                }
                return false;
            });

            playlistItems.appendChild(li);
        });
    }
}

async function playTrackAtIndex(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentPlaylistIndex = index;
    // savePlaylistState(); // Save state
    if (typeof savePlaylistState === 'function') savePlaylistState();
    const track = playlist[index];
    
    // Update UI active state
    const items = playlistItems.querySelectorAll('.playlist-item');
    items.forEach((item, idx) => {
        if (idx === index) item.classList.add('active');
        else item.classList.remove('active');
    });
    
    await handleFile(track.path);
}

function togglePlayMode() {
    const modes = ['loop-list', 'loop-one', 'play-list'];
    const icons = {
        'loop-list': 'fa-repeat',
        'loop-one': 'fa-1', // Assuming font-awesome has this, or use text
        'play-list': 'fa-arrow-right'
    };
    const titles = {
        'loop-list': '列表循环',
        'loop-one': '单曲循环',
        'play-list': '列表播放'
    };
    
    let currentIdx = modes.indexOf(playMode);
    let nextIdx = (currentIdx + 1) % modes.length;
    playMode = modes[nextIdx];
    // savePlaylistState(); // Save new mode
    if (typeof savePlaylistState === 'function') savePlaylistState();
    
    updatePlayModeUI();
}

// Helper moved to updatePlayModeUI
/*
function togglePlayMode_Old() {
    // ... (Logic refactored into togglePlayMode and updatePlayModeUI)
}
*/

function playNext(auto = true) {
    if (playlist.length === 0) return;
    
    let nextIndex = currentPlaylistIndex;
    
    if (playMode === 'loop-one') {
        if (auto) {
            // Loop current
            nextIndex = currentPlaylistIndex;
        } else {
            // Manually clicking next goes to next even in loop-one
            nextIndex = (currentPlaylistIndex + 1) % playlist.length;
        }
    } else if (playMode === 'loop-list') {
        nextIndex = (currentPlaylistIndex + 1) % playlist.length;
    } else if (playMode === 'play-list') {
        if (currentPlaylistIndex < playlist.length - 1) {
            nextIndex = currentPlaylistIndex + 1;
        } else {
            // End of playlist
            return; 
        }
    }
    
    playTrackAtIndex(nextIndex);
}

function setupPlaylist() {
    // Toggle Panel
    playlistBtn.addEventListener('click', () => {
        playlistPanel.classList.toggle('hidden');
        
        if (!playlistPanel.classList.contains('hidden')) {
            // If opened, stop timer and show button
            handleButtonInteraction();
        } else {
            // If closed and playing, start timer
            if (!audioPlayer.paused) {
                startPlaylistBtnTimer();
            }
        }
    });
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!playlistPanel.contains(e.target) && 
            !playlistBtn.contains(e.target)) {
            playlistPanel.classList.add('hidden');
            // If playing, resume auto-hide timer
            if (!audioPlayer.paused) {
                startPlaylistBtnTimer();
            }
        }
    });
    
    importFolderBtn.addEventListener('click', importFolder);
    importFolderBtnEmpty.addEventListener('click', importFolder);
    clearPlaylistBtn.addEventListener('click', clearPlaylist); // New
    
    playModeBtn.addEventListener('click', togglePlayMode);
    
    // Audio Ended Event
    audioPlayer.addEventListener('ended', () => {
        cancelAnimationFrame(animationFrameId);
        if (playlist.length > 0) {
            playNext(true);
        }
    });

    // === Button Auto-Hide Events ===
    audioPlayer.addEventListener('play', () => {
        // Only start lyrics animation
        loopLyricsAnimation();
    });

    audioPlayer.addEventListener('pause', () => {
        // Only stop lyrics animation, do not show playlist button
        cancelAnimationFrame(animationFrameId);
    });

    playlistBtn.addEventListener('mouseenter', handleButtonInteraction);
    playlistBtn.addEventListener('mousemove', handleButtonInteraction); // Extra safety
    
    playlistBtn.addEventListener('mouseleave', () => {
        // Always auto-hide when mouse leaves, regardless of playback state
        startPlaylistBtnTimer();
    });
}

// === Lyrics Animation Loop ===
let animationFrameId;

function loopLyricsAnimation() {
    if (audioPlayer.paused || audioPlayer.ended) {
        cancelAnimationFrame(animationFrameId);
        return;
    }
    
    // Only update word-by-word progress if needed
    if (lyricsDisplayMode !== 0 && parsedLyrics.length > 0 && currentLyricIndex !== -1) {
        const line = parsedLyrics[currentLyricIndex];
        if (line && line.isWordByWord) {
             updateWordByWordProgress(audioPlayer.currentTime, currentLyricIndex);
        }
    }
    
    animationFrameId = requestAnimationFrame(loopLyricsAnimation);
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

audioPlayer.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener('timeupdate', () => {
    if (isSeeking) return; // 拖动时不更新
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
    const progress = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBarFill.style.width = `${progress}%`;
    updateLyrics(audioPlayer.currentTime);
    });

    loadBtn.addEventListener('click', async () => {
        try {
            const selected = await dialogOpen({
                multiple: false,
            filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'm4a'] }]
            });
            if (selected) {
                await handleFile(selected);
            }
    } catch (e) {
        console.error("Error opening file dialog", e);
        }
    });

// --- 进度条拖动逻辑 ---
function seek(e) {
    if (audioPlayer.duration) {
        const rect = progressBarContainer.getBoundingClientRect();
        // 使用 getBoundingClientRect() 的 width 而不是 clientWidth，确保使用实际渲染宽度
        const offsetX = e.clientX - rect.left;
        const width = rect.width;
        const progress = Math.max(0, Math.min(1, offsetX / width));
        
        const newTime = progress * audioPlayer.duration;
        audioPlayer.currentTime = newTime;

        // 拖动时立即手动更新UI
        progressBarFill.style.width = `${progress * 100}%`;
        currentTimeEl.textContent = formatTime(newTime);
    }
}

progressBarContainer.addEventListener('mousedown', (e) => {
    isSeeking = true;
    seek(e); // 立即跳转到点击位置
});

document.addEventListener('mousemove', (e) => {
    if (isSeeking) {
        // 使用 requestAnimationFrame 优化性能，避免过于频繁的更新
        requestAnimationFrame(() => seek(e));
    }
});

document.addEventListener('mouseup', () => {
    isSeeking = false;
});


// === 文件拖入处理（使用 Web API 替代 Tauri onDragDropEvent） ===
// 注意：已在 tauri.conf.json 中禁用 dragDropEnabled，以允许内部 HTML5 DnD 工作
document.body.addEventListener('dragover', (e) => {
    // 检查是否是外部文件拖入（dataTransfer.types 包含 'Files'）
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        document.body.classList.add('drag-over');
    }
});

document.body.addEventListener('dragleave', (e) => {
    // 只在离开 body 时移除样式（避免子元素触发）
    if (e.target === document.body || !document.body.contains(e.relatedTarget)) {
        document.body.classList.remove('drag-over');
    }
});

document.body.addEventListener('drop', async (e) => {
    document.body.classList.remove('drag-over');
    
    // 检查是否有文件
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        e.preventDefault();
        
        // 查找音频文件
        const files = Array.from(e.dataTransfer.files);
        const audioFile = files.find(f => /\.(mp3|wav|flac|m4a)$/i.test(f.name));
        
        if (audioFile) {
            // 对于 Tauri，我们需要文件路径而非 File 对象
            // dataTransfer.files 在 Tauri WebView 中可能包含 path 属性
            const filePath = audioFile.path || audioFile.name;
            if (filePath && filePath.includes('/') || filePath.includes('\\')) {
                showLoading('Analyzing Audio...');
                await handleFile(filePath);
            } else {
                alert('无法获取文件路径。请使用文件选择器导入音频。');
            }
        } else {
            alert('请拖入有效的音频文件 (mp3, wav, flac, m4a)');
        }
    }
});

window.addEventListener('keydown', (event) => {
        switch (event.key.toLowerCase()) {
            case ' ':
            event.preventDefault();
            if (audioPlayer.paused) {
                audioPlayer.play().catch(e => console.error("Audio playback failed:", e));
                } else {
                audioPlayer.pause();
                }
                break;
            case 'r':
            audioPlayer.currentTime = 0;
                break;
            case 'f':
            // 使用浏览器的 Fullscreen API，避免额外权限配置
                if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                } else {
                document.exitFullscreen().catch(() => {});
                }
                break;
        case 'l':
            // 只在播放器UI状态下启用快捷键L
            if (playerWrapper.classList.contains('hidden')) {
                break;
            }
            // 在进入歌词模式前，如果极简/封面模式是激活的，则先退出
            if (playerUIGlass.classList.contains('minimal-mode') || document.body.classList.contains('cover-mode')) {
                playerUIGlass.classList.remove('minimal-mode');
                document.body.classList.remove('cover-mode');
                coverModeLyricsContainer.classList.add('hidden');
                container.classList.remove('minimal-active');
                playerWrapper.classList.remove('minimal-active');
            }
            toggleLyrics();
            break;
            case 'v':
                // 只在播放器UI状态下启用快捷键V
                if (playerWrapper.classList.contains('hidden')) {
                    break;
                }
                // 在切换视图模式前，如果歌词模式处于激活状态，则强制先完全关闭歌词模式
                if (lyricsDisplayMode !== 0) {
                    const metaRegex = /(作[词詞]|作曲|编曲|編曲|詞|曲|译|arranger|composer|lyricist|lyrics|ti|ar|al|by)/i;
                    const hasTranslation = parsedLyrics.some(l => l.translation && !metaRegex.test(l.text));
                    lyricsDisplayMode = hasTranslation ? 6 : 5; // 设置为关闭(0)之前的那个模式
                    toggleLyrics();
                }

                const isMinimal = playerUIGlass.classList.contains('minimal-mode');
                const isCover = document.body.classList.contains('cover-mode');

                if (!isMinimal && !isCover) {
                    // 从 普通 -> 极简
                    playerUIGlass.classList.add('minimal-mode');
                    container.classList.add('minimal-active'); // for non-:has() browsers
                    playerWrapper.classList.add('minimal-active');
                } else if (isMinimal) {
                    // 从 极简 -> 封面
                    playerUIGlass.classList.remove('minimal-mode');
                    container.classList.remove('minimal-active');
                    playerWrapper.classList.remove('minimal-active');
                    document.body.classList.add('cover-mode');
                    coverModeLyricsContainer.classList.remove('hidden');
                    updateLyrics(audioPlayer.currentTime, true); // 强制刷新歌词
                } else { // isCover
                    // 从 封面 -> 普通
                    document.body.classList.remove('cover-mode');
                    coverModeLyricsContainer.classList.add('hidden');
                }
                break;
            case 'escape':
                if (!playerWrapper.classList.contains('hidden')) {
                    resetPlayerUI();
                }
                break;
        }
    });

function showLoading(message) {
    loadingOverlay.querySelector('p').textContent = message;
    loadingOverlay.classList.remove('ui-hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('ui-hidden');
}

function resetPlayerUI() {
    audioPlayer.pause();
    audioPlayer.src = '';

            // When resetting, show the file select screen and global controls again
    fileSelectContainer.classList.remove('hidden');
    githubLink.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
    playerWrapper.classList.add('hidden');


    songTitleEl.textContent = 'Unknown Title';
    artistNameEl.textContent = 'Unknown Artist';
    
    currentTimeEl.textContent = '00:00';
    durationEl.textContent = '00:00';
    progressBarFill.style.width = '0%';
    
    if (artworkUrl) {
        // data URLs don't need revoking
        artworkUrl = null;
    }
    currentDominantColorRGB = null;
    albumArt.src = '';
    albumArt.style.display = 'none';

    // After clearing song-specific data, update backgrounds based on persistent settings
    updateBackgrounds();

    // Clear and hide lyrics
    parsedLyrics = [];
    lyricsLinesContainer.innerHTML = '';
    noLyricsMessage.classList.add('hidden');
    currentLyricIndex = -1;
    document.body.classList.remove(
        'lyrics-active', 'lyrics-mode-translation', 'lyrics-mode-bilingual', 
        'lyrics-mode-bilingual-reversed', 'lyrics-mode-original', 'lyrics-mode-text-only', 
        'lyrics-mode-text-only-reversed', 'cover-mode'
    );
    lyricsContainer.classList.add('hidden');
    coverModeLyricsContainer.classList.add('hidden');
    coverModeLyrics.innerHTML = '';
    lyricsDisplayMode = 0; // Reset mode to off
}

function toggleLyrics() {
    // Exit cover mode if active before entering lyrics mode
    if (document.body.classList.contains('cover-mode')) {
        document.body.classList.remove('cover-mode');
        coverModeLyricsContainer.classList.add('hidden');
        // If we exit cover mode via 'L', we should go back to normal, not minimal.
        playerUIGlass.classList.remove('minimal-mode');
        container.classList.remove('minimal-active');
        playerWrapper.classList.remove('minimal-active');
    }

    // NEW: Define regex here to check for metadata lines like '作词', '作曲', '译' etc.
    const metaRegex = /(作[词詞]|作曲|编曲|編曲|詞|曲|译|arranger|composer|lyricist|lyrics|ti|ar|al|by)/i;
    // UPDATED: A song is considered to have translations only if there's at least one
    // translated line that isn't just metadata.
    const hasTranslation = parsedLyrics.some(l => l.translation && !metaRegex.test(l.text));

    // If there's no translation, just toggle between off (0) and original (4).
    if (!hasTranslation) {
        // NEW Cycle with Text-Only: Off(0) -> Original(4) -> Text Only(5) -> Off(0)
        const nextModeMap = {
            0: 4, // Off -> Original
            4: 5, // Original -> Text Only
            5: 0, // Text Only -> Off
        };
        lyricsDisplayMode = nextModeMap[lyricsDisplayMode] ?? 0;
    } else {
        // Cycle with new modes: Off(0) -> Bilingual(2) -> Reversed(3) -> Original(4) -> Translation(1) -> Text Only(5) -> Text Only Reversed(6) -> Off(0)
        const nextModeMap = {
            0: 2, // Off -> Bilingual
            2: 3, // Bilingual -> Bilingual Reversed
            3: 4, // Bilingual Reversed -> Original
            4: 1, // Original -> Translation
            1: 5, // Translation -> Text Only
            5: 6, // Text Only -> Text Only Reversed
            6: 0  // Text Only Reversed -> Off
        };
        lyricsDisplayMode = nextModeMap[lyricsDisplayMode] ?? 0; // Default to Off if state is weird
    }

    const lyricsActive = lyricsDisplayMode !== 0;
    let modeString = ''; // String name for the current mode for the indicator

    // This is the missing line that controls the visibility of the entire lyrics panel.
    lyricsContainer.classList.toggle('hidden', !lyricsActive);

    // Remove all mode classes before adding the new one
    document.body.classList.remove('lyrics-active', 'lyrics-mode-translation', 'lyrics-mode-bilingual', 'lyrics-mode-bilingual-reversed', 'lyrics-mode-original', 'lyrics-mode-text-only', 'lyrics-mode-text-only-reversed');

    if (lyricsActive) {
        document.body.classList.add('lyrics-active');
        switch (lyricsDisplayMode) {
            case 1: // Translation only
                modeString = 'translation';
                document.body.classList.add('lyrics-mode-translation');
                break;
            case 2: // Bilingual (orig/trans)
                modeString = 'bilingual';
                document.body.classList.add('lyrics-mode-bilingual');
                break;
            case 3: // Bilingual (trans/orig)
                modeString = 'bilingual-reversed';
                document.body.classList.add('lyrics-mode-bilingual-reversed');
                break;
            case 4: // Original only
                modeString = 'original';
                document.body.classList.add('lyrics-mode-original');
                break;
            case 5: // Text Only (NEW)
                modeString = 'text-only';
                document.body.classList.add('lyrics-mode-text-only');
                break;
            case 6: // Text Only Reversed (NEW)
                modeString = 'text-only-reversed';
                document.body.classList.add('lyrics-mode-text-only-reversed');
                break;
        }
        // Now that we have the correct mode string, show the indicator.
        showLyricsModeIndicator(modeString);
    }
    
    const settings = document.querySelector('.settings-wrapper');
    if (settings) {
        settings.classList.toggle('visually-hidden', lyricsActive);
    }
    
    // 修复：切换时立即更新歌词，但延迟到下一帧，确保新CSS生效后再计算位置
    currentLyricIndex = -1;
    requestAnimationFrame(() => updateLyrics(audioPlayer.currentTime, true));
}

// All marquee-related JavaScript has been removed for simplicity.
// Text will now wrap by default based on CSS rules.

function parseLRC(lrcText) {
    const lines = lrcText.split(/\r\n|\n|\r/);
    const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/;
    // Regex for checking multiple timestamps (global)
    const globalTimeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
    const intermediate = [];

    for (const line of lines) {
        // Check if line has multiple timestamps (indicating word-by-word)
        const allMatches = [...line.matchAll(globalTimeRegex)];
        
        if (allMatches.length > 1) {
            const wordData = parseWordByWordLine(line);
            if (wordData) {
                intermediate.push({
                    time: wordData.startTime,
                    text: wordData.fullText,
                    isWordByWord: true,
                    words: wordData.words
                });
                continue;
            }
        }

        // Standard LRC parsing
        const match = line.match(timeRegex);
        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = line.replace(timeRegex, '').trim();
            if (text) {
                intermediate.push({ time, text, isWordByWord: false });
            }
        }
    }

    if (intermediate.length === 0) return [];

    const finalLyrics = [];
    for (let i = 0; i < intermediate.length; i++) {
        const current = intermediate[i];
        const next = i + 1 < intermediate.length ? intermediate[i + 1] : null;

        // Translation logic: if next line has same time, treat as translation
        if (next && Math.abs(next.time - current.time) < 0.01) {
            // Note: If 'current' is word-by-word, 'next' (translation) usually isn't, 
            // or if it is, we currently don't support word-by-word translation syncing yet 
            // (plan said "Translation line keeps sentence-by-sentence").
            // So we just take next.text as translation.
            
            finalLyrics.push({ 
                time: current.time, 
                text: current.text, 
                translation: next.text,
                isWordByWord: current.isWordByWord,
                words: current.words
            });
            i++; // Skip next line
        } else {
            finalLyrics.push({ 
                time: current.time, 
                text: current.text, 
                translation: null,
                isWordByWord: current.isWordByWord,
                words: current.words
            });
        }
    }
    
    // Post-process: Calculate duration for the last word in each word-by-word line
    // based on the next line's start time (if available).
    for (let i = 0; i < finalLyrics.length; i++) {
        const current = finalLyrics[i];
        if (current.isWordByWord && current.words.length > 0) {
            const lastWord = current.words[current.words.length - 1];
            // If last word duration is unset or just defaulted
            // Try to cap it with next line time
            const nextLine = i + 1 < finalLyrics.length ? finalLyrics[i+1] : null;
            if (nextLine) {
                // If the calculated end time exceeds next line start, trim it?
                // Or just use next line start as the hard limit for the last word?
                // The parser logic sets endTime based on next word. 
                // For the very last word, we need a duration.
                // Let's ensure it has *some* duration.
                if (nextLine.time > lastWord.startTime) {
                    lastWord.endTime = nextLine.time;
                } else {
                    // Fallback: +0.5s or +1s
                    lastWord.endTime = lastWord.startTime + 1.0;
                }
            } else {
                 // No next line, end of song
                 lastWord.endTime = lastWord.startTime + 2.0; 
            }
        }
    }

    return finalLyrics;
}

/**
 * Parses a line with multiple timestamps into words
 */
function parseWordByWordLine(line) {
    const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
    const matches = [...line.matchAll(timeRegex)];
    if (matches.length === 0) return null;

    const words = [];
    let fullText = "";
    
    // First timestamp defines line start time
    let lineStartTime = 0;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
        const startTime = minutes * 60 + seconds + milliseconds / 1000;
        
        if (i === 0) lineStartTime = startTime;

        // Content is between current match end and next match start (or line end)
        const startIdx = match.index + match[0].length;
        const endIdx = i < matches.length - 1 ? matches[i+1].index : line.length;
        const text = line.substring(startIdx, endIdx);
        
        // Even if text is empty, we record it (could be spacing or just time anchor)
        // But for display, empty text spans might be invisible. 
        // We will filter or handle empty strings in renderer? 
        // Better to keep them for timing continuity.
        
        fullText += text;

        // Determine end time
        let endTime;
        if (i < matches.length - 1) {
            const nextMatch = matches[i+1];
            const nMin = parseInt(nextMatch[1], 10);
            const nSec = parseInt(nextMatch[2], 10);
            const nMs = parseInt(nextMatch[3].padEnd(3, '0'), 10);
            endTime = nMin * 60 + nSec + nMs / 1000;
        } else {
            // Placeholder, will be fixed in post-process
            endTime = startTime + 0.5; 
        }

        words.push({
            text,
            startTime,
            endTime
        });
    }

    return {
        startTime: lineStartTime,
        fullText: fullText.trim(), // Trim full text for cleaner display if it has bounding spaces
        words
    };
}

/**
 * Calculate the current lyric index based on current time
 */
function calculateCurrentLyricIndex(currentTime) {
    const firstLaterIdx = parsedLyrics.findIndex(line => line.time > currentTime);
    if (firstLaterIdx === -1) {
        // Already past the last lyric line
        return parsedLyrics.length - 1;
    } else {
        const newIndex = firstLaterIdx - 1;
        return newIndex < 0 ? 0 : newIndex;
    }
}

/**
 * Update DOM elements' position attributes
 */
function updateLyricElementPositions(isActive) {
    const allLines = lyricsLinesContainer.querySelectorAll('.lyrics-line');

    // Reset special states
    allLines.forEach(line => line.classList.remove('move-up-more'));

    // Set position attributes
    allLines.forEach(line => {
        const absIndex = parseInt(line.dataset.absIndex, 10);
        const relativeIndex = absIndex - currentLyricIndex;

        if (line.classList.contains('skip-line')) {
            if (relativeIndex === 0 || !isActive || Math.abs(relativeIndex) > 1) {
                line.classList.remove('skip-line');
            }
        }
        
        if (line.classList.contains('skip-line')) {
             delete line.dataset.lineIndex;
             return;
        }

        if (isActive && Math.abs(relativeIndex) <= 1) {
            line.dataset.lineIndex = relativeIndex;
        } else {
            delete line.dataset.lineIndex;
        }
    });

    // Force layout flush
    void lyricsLinesContainer.offsetHeight;
}

/**
 * Calculate and apply dynamic transforms for lyric positioning
 * 
 * FIX: Now positions lyrics so that each line's VISUAL CENTER (not top edge)
 * aligns correctly. The current line's center is aligned to the container's 
 * horizontal midline, making multi-line lyrics (original + translation) 
 * appear properly centered.
 */
function applyLyricTransforms() {
    const getLineByRelIdx = (idx) => lyricsLinesContainer.querySelector(`.lyrics-line[data-line-index="${idx}"]`);
    
    const getScale = (el) => {
        if (!el) return 0;
        return parseFloat(getComputedStyle(el).getPropertyValue('--scale'));
    };

    const line0 = getLineByRelIdx(0);
    if (!line0) return;

    const baseGap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.0; 

    // FIX: Set current line's position so its visual center is at container center
    // CSS has `top: 50%` which places the TOP edge at center.
    // Visual center Y = translateY + offsetHeight/2 = 0 (container center)
    // Therefore: translateY = -offsetHeight/2
    // Additional vertical offset to visually balance the layout (positive = move down)
    const visualBalanceOffset = 35; // px - adjusts for perceived vertical center
    const line0CenterOffset = -line0.offsetHeight / 2 + visualBalanceOffset;
    line0.style.setProperty('--translate-y', `${line0CenterOffset}px`);
    
    // Track the visual center position (relative to container center, where 0 = center)
    let lastCenterY = visualBalanceOffset; // line0's center is slightly below container center
    let lastLine = line0;

    // Calculate positions downwards
    const line1 = getLineByRelIdx(1);
    if (line1) {
        const dynamicGap = baseGap + (lastLine.offsetHeight + line1.offsetHeight) * 0.15;
        // Distance between visual centers of two lines
        const distance = (lastLine.offsetHeight / 2) * getScale(lastLine) + (line1.offsetHeight / 2) * getScale(line1) + dynamicGap;
        const centerY = lastCenterY + distance;
        // Visual center Y = translateY + offsetHeight/2 = centerY
        // Therefore: translateY = centerY - offsetHeight/2
        const translateY = centerY - line1.offsetHeight / 2;
        line1.style.setProperty('--translate-y', `${translateY}px`);

        lastLine = line1;
        lastCenterY = centerY;
        
        const line2 = getLineByRelIdx(2);
        if (line2) {
            const dynamicGap2 = baseGap + (lastLine.offsetHeight + line2.offsetHeight) * 0.15;
            const distance2 = (lastLine.offsetHeight / 2) * getScale(lastLine) + (line2.offsetHeight / 2) * getScale(line2) + dynamicGap2;
            const centerY2 = lastCenterY + distance2;
            const translateY2 = centerY2 - line2.offsetHeight / 2;
            line2.style.setProperty('--translate-y', `${translateY2}px`);
        }
    }

    // Calculate positions upwards
    lastLine = line0;
    lastCenterY = 0;

    const line_minus_1 = getLineByRelIdx(-1);
    if (line_minus_1) {
        const dynamicGap = baseGap + (lastLine.offsetHeight + line_minus_1.offsetHeight) * 0.15;
        const distance = (lastLine.offsetHeight / 2) * getScale(lastLine) + (line_minus_1.offsetHeight / 2) * getScale(line_minus_1) + dynamicGap;
        const centerY = lastCenterY - distance;
        const translateY = centerY - line_minus_1.offsetHeight / 2;
        line_minus_1.style.setProperty('--translate-y', `${translateY}px`);

        lastLine = line_minus_1;
        lastCenterY = centerY;

        const line_minus_2 = getLineByRelIdx(-2);
        if (line_minus_2) {
            const dynamicGap2 = baseGap + (lastLine.offsetHeight + line_minus_2.offsetHeight) * 0.15;
            const distance2 = (lastLine.offsetHeight / 2) * getScale(lastLine) + (line_minus_2.offsetHeight / 2) * getScale(line_minus_2) + dynamicGap2;
            const centerY2 = lastCenterY - distance2;
            const translateY2 = centerY2 - line_minus_2.offsetHeight / 2;
            line_minus_2.style.setProperty('--translate-y', `${translateY2}px`);
        }
    }
}

/**
 * Update cover mode lyrics display
 */
function updateCoverModeLyrics() {
    if (!document.body.classList.contains('cover-mode')) return;
    
    const currentLineData = parsedLyrics[currentLyricIndex];
    if (currentLineData) {
        let finalHTML = '';
        // Build original lyric span
        const originalText = currentLineData.text || '';
        if (originalText) {
            const lang = detectLang(originalText);
            finalHTML += `<span class="original-lyric" lang="${lang}">${wrapEnglish(fixProblemGlyphs(originalText))}</span>`;
        }
        // Build translated lyric span if it exists
        const translatedText = currentLineData.translation || '';
        if (translatedText) {
            const lang = detectLang(translatedText);
            finalHTML += `<span class="translated-lyric" lang="${lang}">${wrapEnglish(fixProblemGlyphs(translatedText))}</span>`;
        }
        
        coverModeLyrics.innerHTML = finalHTML;
    } else {
        coverModeLyrics.innerHTML = '';
    }
}

function updateLyrics(currentTime, forceRecalc = false) {
    if (parsedLyrics.length === 0) {
        return;
    }

    const newLyricIndex = calculateCurrentLyricIndex(currentTime);

    const isActive = lyricsDisplayMode !== 0;

    // Only update when lyric line changes or forced recalculation
    if (forceRecalc || newLyricIndex !== currentLyricIndex) {
        currentLyricIndex = newLyricIndex;

        // Update DOM element positions
        updateLyricElementPositions(isActive);

        // Apply dynamic transforms if lyrics are active
        if (isActive) {
            applyLyricTransforms();
        }
        
        // Update cover mode display
        updateCoverModeLyrics();
    }
    
    // NEW: Always update word-by-word progress if the current line is word-by-word
    // even if the line index hasn't changed.
    if (isActive && parsedLyrics[currentLyricIndex]?.isWordByWord) {
        updateWordByWordProgress(currentTime, currentLyricIndex);
    }
}

/**
 * Updates the gradient progress for word-by-word lyrics
 */
function updateWordByWordProgress(currentTime, lineIndex) {
    const lineEl = lyricsLinesContainer.querySelector(`.lyrics-line[data-abs-index="${lineIndex}"]`);
    if (!lineEl) return;

    const words = lineEl.querySelectorAll('.word-char');
    words.forEach(word => {
        const start = parseFloat(word.dataset.start);
        const end = parseFloat(word.dataset.end);
        
        if (currentTime >= end) {
            // Already sung
            word.style.setProperty('--glow-progress', '100%');
            word.classList.add('completed');
            word.classList.remove('active');
        } else if (currentTime < start) {
            // Not yet sung
            word.style.setProperty('--glow-progress', '0%');
            word.classList.remove('completed', 'active');
        } else {
            // Currently singing
            const progress = (currentTime - start) / (end - start);
            const percentage = Math.min(100, Math.max(0, progress * 100));
            
            word.style.setProperty('--glow-progress', `${percentage}%`);
            word.classList.add('active');
            word.classList.remove('completed');
        }
    });
}

/** NEW utility function to avoid code repetition */
function detectLang(text) {
    let lang = 'en'; // Default lang
    const langCode = franc(text, { minLength: 1 });
    if (langCode === 'cmn' || langCode === 'nan') {
        lang = 'zh-CN';
    } else if (langCode === 'jpn') {
        lang = 'ja';
    }
    return lang;
}

// --- 新增函数 ---
// 在加载时一次性渲染所有歌词行到 DOM 中
function renderAllLyricsOnce() {
    lyricsLinesContainer.innerHTML = ''; // 清空
    if (!parsedLyrics || parsedLyrics.length === 0) {
        noLyricsMessage.classList.remove('hidden');
        return;
    }
    noLyricsMessage.classList.add('hidden');

    parsedLyrics.forEach((line, index) => {
        const li = document.createElement('li');
        li.className = 'lyrics-line';
        li.dataset.time = line.time;
        // FIX: Add the absolute index back for the updateLyrics function to find the element.
        li.dataset.absIndex = index;

        const originalSpan = document.createElement('span');
        originalSpan.className = 'original-lyric';
        
        let originalText = line.text || '';
        originalText = fixProblemGlyphs(originalText);
        
        const langCode = franc(originalText, { minLength: 1 });
        if (langCode === 'cmn' || langCode === 'nan') {
            originalSpan.lang = 'zh-CN';
        } else if (langCode === 'jpn') {
            originalSpan.lang = 'ja';
        } else {
            originalSpan.lang = 'en';
        }

        if (line.isWordByWord && line.words && line.words.length > 0) {
            // Render word-by-word structure
            // We use wrapEnglish logic per word/segment if needed, or just plain text
            // Ideally, we keep the wrapEnglish for latin parts even inside words?
            // For simplicity and to avoid nested span chaos with animation,
            // we will just render the words as spans.
            // If the word contains mixed latin/non-latin, we might lose the font benefit of wrapEnglish 
            // unless we parse inside. 
            // Let's iterate words.
            
            line.words.forEach(word => {
                const wSpan = document.createElement('span');
                wSpan.className = 'word-char';
                wSpan.dataset.start = word.startTime;
                wSpan.dataset.end = word.endTime;
                wSpan.textContent = word.text; 
                // Note: fixProblemGlyphs is already done on full text, but words are raw.
                // We should probably apply it to words too if they match? 
                // Actually parseWordByWordLine extracts raw text.
                // Let's just assume words are fine or apply fix if needed.
                wSpan.textContent = fixProblemGlyphs(word.text);
                
                // If we want font fallback for latin inside word-by-word:
                // It gets complicated because .word-char needs to be the specific target for animation.
                // If we nest .latin inside .word-char, it should be fine.
                wSpan.innerHTML = wrapEnglish(fixProblemGlyphs(word.text));
                
                originalSpan.appendChild(wSpan);
            });
            // Mark the line or span as having word-by-word content for CSS if needed
            originalSpan.classList.add('is-word-by-word');
            
        } else {
            // Standard line render
            originalSpan.innerHTML = wrapEnglish(originalText);
        }

        li.appendChild(originalSpan);
        
        const translationSpan = document.createElement('span');
        translationSpan.className = 'translated-lyric';
        translationSpan.lang = 'zh-CN';
        if (line.translation) {
            translationSpan.innerHTML = wrapEnglish(line.translation);
        } else {
            translationSpan.innerHTML = '';
        }
        li.appendChild(translationSpan);
        lyricsLinesContainer.appendChild(li);
    });
}

// === NEW: Utility to fix problematic glyphs in metadata lines ===
/**
 * Replaces problematic simplified glyphs with traditional forms
 * currently for "作词"→"作詞" and "编曲"→"編曲".
 * @param {string} text original text
 * @returns {string}
 */
function fixProblemGlyphs(text) {
    return text.replace(/作词/g, '作詞').replace(/编曲/g, '編曲');
}

// --- NEW: Lyrics Mode Indicator ---
const lyricsModeIndicator = document.getElementById('lyrics-mode-indicator');
const indicatorIcon = lyricsModeIndicator.querySelector('.indicator-icon');
const indicatorText = lyricsModeIndicator.querySelector('.indicator-text');
let indicatorTimeout;

function showLyricsModeIndicator(mode) {
    clearTimeout(indicatorTimeout);

    const modeMap = {
        'original': { icon: 'Aあ', text: '原文模式' },
        'translation': { icon: '译', text: '译文模式' },
        'bilingual': { icon: 'Aあ<br>译', text: '双语模式' },
        'bilingual-reversed': { icon: '译<br>Aあ', text: '双语模式 (反转)' },
        'text-only': { icon: '文', text: '纯文字模式' },
        'text-only-reversed': { icon: '译<br>文', text: '纯文字模式 (反转)' }
    };

    const config = modeMap[mode] || { icon: '?', text: '未知模式' };
    
    indicatorIcon.innerHTML = config.icon;
    indicatorText.textContent = config.text;

    lyricsModeIndicator.classList.add('visible');

    indicatorTimeout = setTimeout(() => {
        lyricsModeIndicator.classList.remove('visible');
    }, 1500); // Keep it visible for 1.5 seconds
}

// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
    // All initial setup calls can go here.
    setupSettings();
    // NEW: Ensure functions are defined before calling
    if (typeof setupPlaylist === 'function') setupPlaylist(); 
    if (typeof loadPlaylistState === 'function') loadPlaylistState(); 

    // Custom background button listeners
    customBgBtn.addEventListener('click', async () => {
        try {
            const selected = await dialogOpen({
                multiple: false,
                filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
            });
            if (selected) {
                localStorage.setItem('customBgPath', selected);
                // NEW: When setting an image, clear any video to avoid conflicts
                localStorage.removeItem('customBgVideoPath');
                updateBackgrounds(); // Update UI immediately
            }
        } catch (e) {
            console.error("Error opening image dialog", e);
        }
    });

    // NEW: Listener for custom video background
    customBgVideoBtn.addEventListener('click', async () => {
        try {
            const selected = await dialogOpen({
                multiple: false,
                filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }]
            });
            if (selected) {
                localStorage.setItem('customBgVideoPath', selected);
                // NEW: When setting a video, clear any image to avoid conflicts
                localStorage.removeItem('customBgPath');
                updateBackgrounds();
            }
        } catch (e) {
            console.error("Error opening video dialog", e);
        }
    });

    // NEW: Listener to clear any custom background
    clearCustomBgBtn.addEventListener('click', clearCustomBackground);

    // GitHub link click → open in system browser
    if (githubLink) {
        githubLink.addEventListener('click', (e) => {
            e.preventDefault();
            const url = githubLink.getAttribute('href');
            if (window.__TAURI__) {
                // Use plugin-shell to open URL
                openInBrowser(url).catch(() => window.open(url, '_blank'));
            } else {
                window.open(url, '_blank');
            }
        });
    }

    // === NEW: Ctrl + Wheel Zoom Support ===
    let zoomLevel = parseFloat(localStorage.getItem('pageZoomLevel')) || 1.0;
    // Apply saved zoom level on startup
    document.body.style.zoom = zoomLevel;

    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            zoomLevel = Math.min(Math.max(0.5, zoomLevel + delta), 3.0);
            // Round to 1 decimal place to avoid floating point weirdness
            zoomLevel = Math.round(zoomLevel * 10) / 10;
            
            document.body.style.zoom = zoomLevel;
            localStorage.setItem('pageZoomLevel', zoomLevel.toString());
        }
    }, { passive: false });
});

// === NEW: Localized Font Name Mapping ===
// Map English family names to their localized (Japanese/Chinese) display names for better readability in the dropdowns.
const LOCALIZED_FONT_NAME_MAP = {
    // Japanese fonts
    "Yu Mincho": "游明朝",
    "YuMincho": "游明朝",
    "Yu Mincho UI": "游明朝 UI",
    "YuMincho UI": "游明朝 UI",
    "Yu Gothic": "游ゴシック",
    "YuGothic": "游ゴシック",
    "Yu Gothic UI": "游ゴシック UI",
    "YuGothic UI": "游ゴシック UI",
    "MS Mincho": "ＭＳ 明朝",
    "MS Gothic": "ＭＳ ゴシック",
    "MS PGothic": "ＭＳ Ｐゴシック",
    "Meiryo": "メイリオ",
    "SoukouMincho": "装甲明朝",
    "Rounded M+ 1p": "Rounded M+ 1p",
    // Chinese common aliases (optional)
    "Noto Sans SC": "思源黑体 SC",
    "Noto Serif SC": "思源宋体 SC",
    "Source Han Sans SC": "思源黑体 SC",
    "Source Han Serif SC": "思源宋体 SC",
    // Add more mappings as needed...
    "Sarasa Fixed J": "更纱等距 J",
    "Sarasa Fixed SC": "更纱等距 SC",
    "Sarasa Fixed Slab J": "更纱等距 Slab J",
    "Sarasa Fixed Slab SC": "更纱等距 Slab SC",
    "Sarasa Term SC": "更纱等宽 SC",
    "Sarasa Term J": "更纱等宽 J",
    "Sarasa Term Slab J": "更纱等宽 Slab J",
    "Sarasa Term Slab SC": "更纱等宽 Slab SC",
    "Sarasa Term Slab J": "更纱等宽 Slab J",
    "Sarasa Term Slab TC": "更纱等宽 Slab TC",
    "Sarasa Fixed": "更纱等距",
    "Sarasa Gothic SC": "更纱黑体 SC",
    "Sarasa Gothic TC": "更纱黑体 TC",
    "Sarasa Gothic J": "更纱黑体 J",
    "Sarasa Gothic K": "更纱黑体 K",
    "Microsoft JhengHei": "微软正黑体",
    // === Japanese Fonts (new entries) ===
    "A-OTF Ryumin Pr6N B-KL": "リュウミン Pr6N B-KL",
    "A-OTF Ryumin Pr6N H-KL": "リュウミン Pr6N H-KL",
    "BIZ UDGothic": "BIZ UDゴシック",
    "BIZ UDMincho": "BIZ UD明朝",
    "BestTen-CRT": "ベストテン CRT",
    "Century Gothic": "センチュリーゴシック",
    "Copperplate Gothic": "コッパープレート ゴシック",
    "DFCraftYu-W5": "DFクラフト游 W5",
    "DFGanKaiSho-W7": "DF岩楷書 W7",
    "DFMaruMoji-SL": "DF丸文字 SL",
    "DFMaruMojiRD-W7": "DF丸文字 RD W7",
    "FOT-Comet Std": "FOT-コメット Std",
    "FOT-MatisseEleganto Pro DB": "FOT-マティスエレガント Pro DB",
    "FOT-Skip Std": "FOT-スキップ Std",
    "FOT-UDKakugo_Large Pr6N DB": "FOT-UD角ゴ_Large Pr6N DB",
    "UD Digi Kyokasho N": "UDデジタル教科書体 N",
    "UD Digi Kyokasho NP": "UDデジタル教科書体 NP",
    "UD Digi Kyokasho NK-R": "UDデジタル教科書体 NK-R",
    "UD Digi Kyokasho N-R": "UDデジタル教科書体 N-R",
    "Meiryo UI": "メイリオ UI",
    "Noto Sans JP": "Noto Sans JP",
    "Noto Serif JP": "Noto Serif JP",
    "Nico Moji": "ニコ文字",
    "Rounded M+ 1p": "Rounded M+ 1p",
    "Showcard Gothic": "SHOWCARD ゴシック",
    "Source Han Serif JP": "源ノ明朝 JP",
    // Add more as needed...
    "Meiryo with Source Han Sans": "メイリオ + 思源黑体",
    "MZhiHei PRC": "M正黑体 PRC",
    "HonyaJi-Re": "ホンヤジ Re",
    "SimSun-ExtB": "宋体 扩展B",
    "SimSun-ExtG": "宋体 扩展G",
};

// Heuristic replacements for Japanese -> native script
const JP_REPLACEMENTS = [
    [/(?:^|\s)Gothic/gi, " ゴシック"],
    [/(?:^|\s)Mincho/gi, " 明朝"],
    [/Ryumin/gi, "リュウミン"],
    [/Maru/gi, "丸"],
    [/Kaku/gi, "角"],
    [/UD/gi, "UD"],
];

function autoJapaneseName(name) {
    let result = name;
    JP_REPLACEMENTS.forEach(([regex, rep]) => {
        result = result.replace(regex, rep);
    });
    return result;
}

/**
 * Returns localized display name.
 */
function getLocalizedFontName(name) {
    if (LOCALIZED_FONT_NAME_MAP[name]) return LOCALIZED_FONT_NAME_MAP[name];
    // If looks Japanese (simple heuristic) apply autop replace
    if (/Gothic|Mincho|Ryumin|Kaku|Maru|ゴシック|明朝/i.test(name)) {
        return autoJapaneseName(name);
    }
    return name;
}

// === NEW: Custom Select Implementation ===
function setupCustomSelect(originalSelect) {
    // 1. Remove existing custom select if any
    const existingContainer = originalSelect.nextElementSibling;
    if (existingContainer && existingContainer.classList.contains('custom-select-container')) {
        existingContainer.remove();
    }

    // 2. Create Container
    const container = document.createElement('div');
    container.className = 'custom-select-container';

    // 3. Create Trigger
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    
    // Initial Text
    // Note: Use .value to find the selected option because .selected might not be reliable after dynamic changes
    let selectedOption = null;
    if (originalSelect.value) {
        selectedOption = Array.from(originalSelect.options).find(opt => opt.value === originalSelect.value);
    }
    // Fallback to first option or "默认"
    if (!selectedOption) selectedOption = originalSelect.options[0];
    
    const initialText = selectedOption ? selectedOption.textContent : '默认';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = initialText;
    textSpan.style.whiteSpace = 'nowrap';
    textSpan.style.overflow = 'hidden';
    textSpan.style.textOverflow = 'ellipsis';
    
    const arrow = document.createElement('span');
    arrow.className = 'custom-select-arrow';
    arrow.innerHTML = '&#9662;'; // Down arrow character

    trigger.appendChild(textSpan);
    trigger.appendChild(arrow);
    container.appendChild(trigger);

    // 4. Create Options List
    const optionsList = document.createElement('div');
    optionsList.className = 'custom-options';

    // 5. Populate Options
    Array.from(originalSelect.children).forEach(child => {
        if (child.tagName === 'OPTGROUP') {
            const groupLabel = document.createElement('div');
            groupLabel.className = 'custom-optgroup-label';
            groupLabel.textContent = child.label;
            optionsList.appendChild(groupLabel);

            Array.from(child.children).forEach(opt => {
                createCustomOption(opt, optionsList, textSpan, originalSelect, container);
            });
        } else if (child.tagName === 'OPTION') {
            createCustomOption(child, optionsList, textSpan, originalSelect, container);
        }
    });

    container.appendChild(optionsList);

    // 6. Event Listeners
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other open selects
        document.querySelectorAll('.custom-select-container.open').forEach(el => {
            if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
        
        // Scroll to selected option
        if (container.classList.contains('open')) {
             const selected = optionsList.querySelector('.custom-option.selected');
             if (selected) {
                 selected.scrollIntoView({ block: 'nearest' });
             }
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    });

    // 7. Insert into DOM
    originalSelect.style.display = 'none'; // Hide original
    originalSelect.parentNode.insertBefore(container, originalSelect.nextSibling);
}

function createCustomOption(optionEl, containerEl, triggerTextEl, originalSelect, wrapperEl) {
    const customOption = document.createElement('div');
    customOption.className = 'custom-option';
    customOption.textContent = optionEl.textContent;
    customOption.dataset.value = optionEl.value;
    
    // Copy font styles for preview
    if (optionEl.style.fontFamily) {
        customOption.style.fontFamily = optionEl.style.fontFamily;
        customOption.style.fontSize = '1.1em'; // Make it slightly larger in list
    }

    // Check if selected based on value, not just attribute
    if (originalSelect.value === optionEl.value) {
        customOption.classList.add('selected');
    }

    customOption.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Update Trigger Text
        triggerTextEl.textContent = optionEl.textContent;

        // Update Original Select
        originalSelect.value = optionEl.value;
        
        // Trigger Change Event
        originalSelect.dispatchEvent(new Event('change'));

        // Update Selection UI
        containerEl.querySelectorAll('.custom-option').forEach(el => el.classList.remove('selected'));
        customOption.classList.add('selected');

        // Close Dropdown
        wrapperEl.classList.remove('open');
    });

    containerEl.appendChild(customOption);
}
