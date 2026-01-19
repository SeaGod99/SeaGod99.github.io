// ==================== 全局狀態 ====================
const state = {
    selectedServer: localStorage.getItem('selectedServer') || null,
    selectedDatacenter: localStorage.getItem('selectedDatacenter') || null,
    selectedLanguage: localStorage.getItem('selectedLanguage') || 'tc',
    isLoading: false,
    serversByDC: null,
    datacenters: null,
    isDataLoaded: false,
    isDatacentersLoaded: false,
    isWorldsLoaded: false
    // 注意：不再使用 lastItemPriceData，價格直接附在 currentItem.price 中
};

let fullSearchResults = [];
let currentJobFilter = 'ALL';
let currentItem = null;  // 存儲當前查詢的物品（包含價格信息）

// ==================== 配置 ====================
const config = {
    xivApiUrl: 'https://xivapi.com',
    universalisUrl: 'https://universalis.app/api/v2',
    tcSearchUrl: 'https://tc-ffxiv-item-search-service.onrender.com/items/search',
    timeout: 15000
};

const DEFAULT_ICON = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

// ==================== 初始化 ====================
$(document).ready(function () {
    console.log('jQuery ready');
    initializeApp();

    // 在物品搜尋輸入框按下 Enter 直接觸發搜尋
    $('#searchQuery').on('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchItemByName();
        }
    });
});

function initializeApp() {
    console.log('=== FFXIV 市場查詢工具 - 初始化開始 ===');
    console.log('📦 LocalStorage 狀態:');
    console.log('  - selectedServer:', state.selectedServer);
    console.log('  - selectedDatacenter:', state.selectedDatacenter);
    console.log('  - selectedLanguage:', state.selectedLanguage);

    // 無論如何都先預加載數據中心和伺服器數據
    console.log('🚀 開始預加載數據中心和伺服器列表...');
    loadAllDataInBackground();

    if (state.selectedServer && state.selectedDatacenter) {
        console.log('✓ 找到已保存的伺服器配置，直接進入主頁面');
        showMainContent();
    } else {
        console.log('ℹ 未找到伺服器配置，顯示選擇面板');
    }

    showServerSelectionPanel();
}

// 在背景加載數據（不阻塞UI）
function loadAllDataInBackground() {
    console.log('背景加載數據中心和伺服器列表...');

    let datacentersData = null;
    let worldsData = null;

    // 同時請求兩個 API
    Promise.all([
        // 請求數據中心列表
        $.ajax({
            url: 'https://universalis.app/api/v2/data-centers',
            type: 'GET',
            dataType: 'json',
            timeout: 10000
        }).then(response => {
            console.log('✓ 數據中心 API 完成');
            datacentersData = Array.isArray(response) ? response : (response.datacenters || []);
            return datacentersData;
        }).catch(error => {
            console.warn('數據中心 API 失敗:', error);
            return null;
        }),

        // 請求伺服器列表
        $.ajax({
            url: 'https://universalis.app/api/v2/worlds',
            type: 'GET',
            dataType: 'json',
            timeout: 10000
        }).then(response => {
            console.log('✓ 伺服器 API 完成');
            worldsData = response;
            return response;
        }).catch(error => {
            console.warn('伺服器 API 失敗:', error);
            return null;
        })
    ]).then(() => {
        // 兩個 API 都完成了
        if (datacentersData && datacentersData.length > 0) {
            state.datacenters = datacentersData;
            state.isDatacentersLoaded = true;
            console.log('✓ 數據中心數據已緩存:', datacentersData.length, '個');
        }

        if (worldsData && Array.isArray(worldsData) && worldsData.length > 0) {
            // 使用 ID 匹配方式構建映射
            if (datacentersData && datacentersData.length > 0) {
                buildServersByDCMapWithIDs(datacentersData, worldsData);
            } else {
                buildServersByDCMapWithNames(worldsData);
            }
            state.isWorldsLoaded = true;
            console.log('✓ 伺服器數據已緩存:', Object.keys(state.serversByDC || {}).length, '個數據中心');
        }

        state.isDataLoaded = true;
        console.log('✅ 所有數據加載完成並已緩存');
    });
}

// 顯示伺服器選擇面板
function showServerSelectionPanel() {
    console.log('顯示伺服器選擇面板');

    // 如果數據已加載，直接渲染
    if (state.isDataLoaded && state.datacenters) {
        renderDatacenterOptions(state.datacenters);
        $('#dcSelect').prop('disabled', false);
    } else {
        // 等待數據加載
        $('#dcSelect').prop('disabled', true).html('<option value="">-- 載入中... --</option>');

        // 監聽數據加載完成
        const checkInterval = setInterval(() => {
            if (state.isDataLoaded && state.datacenters) {
                clearInterval(checkInterval);
                renderDatacenterOptions(state.datacenters);
                $('#dcSelect').prop('disabled', false);
                showMessage('數據加載完成，請選擇伺服器', 'success');
            }
        }, 100);
    }

    // 設置語言選擇器的值（從 localStorage 讀取）
    const savedLanguage = state.selectedLanguage || 'tc';
    $('#languageSelect').val(savedLanguage);

    // 綁定事件
    bindServerSelectionEvents();
}

// 綁定伺服器選擇事件
function bindServerSelectionEvents() {
    // 綁定數據中心選擇事件
    $('#dcSelect').off('change').on('change', function () {
        const dc = $(this).val();
        console.log('數據中心選擇變化:', dc);

        if (dc) {
            loadServersByDatacenter(dc);
        } else {
            resetServerSelect();
        }
    });

    // 綁定伺服器選擇事件
    $('#worldSelect').off('change').on('change', function () {
        const world = $(this).val();
        $('#confirmBtn').prop('disabled', !world);
    });

    // 綁定語言選擇事件
    $('#languageSelect').off('change').on('change', function () {
        const selectedLang = $(this).val();
        console.log('語言選擇變化:', selectedLang);
        
        // 更新 state 和 localStorage
        state.selectedLanguage = selectedLang;
        localStorage.setItem('selectedLanguage', selectedLang);
        
        // 更新顯示
        updateServerDisplay();
        
        showMessage('語言已切換為: ' + (selectedLang === 'tc' ? '繁體中文' : 'English'), 'success');
    });

    // 綁定確認按鈕事件
    $('#confirmBtn').off('click').on('click', function () {
        confirmServerSelection();
    });
}

// ==================== 伺服器選擇相關函數 ====================

// 渲染數據中心選項
function renderDatacenterOptions(datacenters) {
    let html = '<option value="">-- 選擇數據中心 --</option>';

    // 確保數據格式正確
    if (!Array.isArray(datacenters)) {
        console.error('數據中心格式錯誤:', datacenters);
        return;
    }

    datacenters.sort((a, b) => {
        const nameA = a.name || a;
        const nameB = b.name || b;
        return nameA.localeCompare(nameB);
    });

    datacenters.forEach(dc => {
        const name = dc.name || dc;
        const region = dc.region || '';
        if (region) {
            html += `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${escapeHtml(region)})</option>`;
        } else {
            html += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        }
    });

    $('#dcSelect').html(html);
    console.log('數據中心選項已更新，共', datacenters.length, '個');
}

// 構建數據中心->伺服器映射表（使用ID匹配 - 正確方式）
function buildServersByDCMapWithIDs(datacenters, worlds) {
    console.log('=== 使用 ID 匹配方式構建映射表 ===');

    // 先建立 world ID -> world name 的映射
    const worldIdToName = {};
    worlds.forEach(world => {
        if (world.id && world.name) {
            worldIdToName[world.id] = world.name;
        }
    });

    console.log('世界ID映射表:', Object.keys(worldIdToName).length, '個世界');

    // 根據數據中心的 worlds ID 列表構建映射
    const newServersByDC = {};
    let totalServers = 0;

    datacenters.forEach(dc => {
        const dcName = dc.name;
        const worldIds = dc.worlds || [];

        if (dcName && Array.isArray(worldIds) && worldIds.length > 0) {
            newServersByDC[dcName] = [];

            worldIds.forEach(worldId => {
                const worldName = worldIdToName[worldId];
                if (worldName) {
                    newServersByDC[dcName].push(worldName);
                    totalServers++;
                }
            });

            // 排序
            newServersByDC[dcName].sort();
        }
    });

    if (totalServers > 0) {
        state.serversByDC = newServersByDC;
        console.log('✓ 使用ID匹配成功構建映射表');
        console.log('- 數據中心數量:', Object.keys(newServersByDC).length);
        console.log('- 伺服器總數:', totalServers);
        console.log('- 詳細映射:', state.serversByDC);
    } else {
        console.warn('ID匹配失敗，保留備用列表');
    }
}

// 構建數據中心->伺服器映射表（使用名稱匹配 - 備用方式）
function buildServersByDCMapWithNames(worlds) {
    console.log('=== 使用名稱匹配方式構建映射表 ===');

    // 先保留備用列表
    const fallbackServers = state.serversByDC;
    const newServersByDC = {};

    // 使用 dataCenter 屬性分組
    let successCount = 0;
    worlds.forEach(world => {
        const dc = world.dataCenter || world.datacenter;  // 支援兩種格式
        const serverName = world.name;

        if (dc && serverName) {
            if (!newServersByDC[dc]) {
                newServersByDC[dc] = [];
            }
            newServersByDC[dc].push(serverName);
            successCount++;
        }
    });

    // 如果成功解析了數據，使用新數據，否則保留備用數據
    if (successCount > 0) {
        state.serversByDC = newServersByDC;

        // 對每個數據中心的伺服器列表進行排序
        Object.keys(state.serversByDC).forEach(dc => {
            state.serversByDC[dc].sort();
        });

        console.log('✓ 使用名稱匹配成功構建映射表');
        console.log('- 數據中心數量:', Object.keys(state.serversByDC).length);
        console.log('- 伺服器總數:', successCount);
        console.log('- 詳細映射:', state.serversByDC);
    } else {
        console.warn('名稱匹配失敗，保留備用列表');
        state.serversByDC = fallbackServers;
    }
}

// 根據數據中心加載伺服器列表（直接從預加載的變數讀取）
function loadServersByDatacenter(datacenter) {
    console.log('=== 從變數讀取伺服器列表 ===');
    console.log('選擇的數據中心:', datacenter);

    if (!datacenter) {
        resetServerSelect();
        return;
    }

    // 確保數據已加載
    if (!state.isDataLoaded) {
        console.warn('數據尚未加載完成，請稍候');
        showMessage('數據載入中，請稍候...', 'info');
        return;
    }

    // 檢查映射表
    if (!state.serversByDC || Object.keys(state.serversByDC).length === 0) {
        console.error('伺服器映射表為空');
        showMessage('伺服器數據異常', 'danger');
        return;
    }

    console.log('可用的數據中心列表:', Object.keys(state.serversByDC).join(', '));

    // 檢查該數據中心是否有伺服器
    if (!state.serversByDC[datacenter]) {
        console.warn('找不到數據中心:', datacenter);
        console.log('嘗試大小寫不敏感匹配...');

        // 嘗試大小寫不敏感匹配
        const dcLower = datacenter.toLowerCase();
        const matchedDC = Object.keys(state.serversByDC).find(key => key.toLowerCase() === dcLower);

        if (matchedDC) {
            console.log('找到匹配的數據中心:', matchedDC);
            loadServersByDatacenter(matchedDC);
            return;
        }

        showMessage(`找不到數據中心 "${datacenter}" 的伺服器\n可用: ${Object.keys(state.serversByDC).join(', ')}`, 'warning');
        resetServerSelect();
        return;
    }

    // 渲染伺服器選項
    const servers = state.serversByDC[datacenter];
    console.log('找到伺服器列表:', servers);

    if (!Array.isArray(servers) || servers.length === 0) {
        console.warn('伺服器列表為空');
        showMessage('該數據中心沒有可用的伺服器', 'warning');
        resetServerSelect();
        return;
    }

    let html = '<option value="">-- 選擇伺服器 --</option>';

    servers.forEach(server => {
        html += `<option value="${escapeHtml(server)}">${escapeHtml(server)}</option>`;
    });

    $('#worldSelect').html(html).prop('disabled', false);
    $('#confirmBtn').prop('disabled', true);

    console.log('✓ 伺服器列表已更新，共', servers.length, '個伺服器');
}

// 重置伺服器選擇框
function resetServerSelect() {
    $('#worldSelect').html('<option value="">-- 先選擇數據中心 --</option>').prop('disabled', true);
    $('#confirmBtn').prop('disabled', true);
}

// 確認伺服器選擇
function confirmServerSelection() {
    const datacenter = $('#dcSelect').val();
    const world = $('#worldSelect').val();

    if (!datacenter || !world) {
        showMessage('請選擇數據中心和伺服器', 'warning');
        return;
    }

    // 保存選擇
    state.selectedDatacenter = datacenter;
    state.selectedServer = world;
    localStorage.setItem('selectedDatacenter', datacenter);
    localStorage.setItem('selectedServer', world);

    console.log('已選擇:', datacenter, '-', world);
    showMessage(`已選擇伺服器: ${world} (${datacenter})`, 'success');

    // 更新顯示
    updateServerDisplay();

    // 顯示主功能介面
    showMainContent();
}

// 更新伺服器顯示
function updateServerDisplay() {
    const server = state.selectedServer || '未選擇';
    const datacenter = state.selectedDatacenter || '';
    const language = state.selectedLanguage || 'tc';
    const languageText = language === 'tc' ? '繁中' : (language === 'en' ? 'EN' : language);

    if (datacenter) {
        $('#serverBadge').text(`${server} (${datacenter})`);
    } else {
        $('#serverBadge').text(server);
    }

    $('#languageBadge').text(`語言: ${languageText}`);
}

// 顯示主內容（隱藏伺服器選擇面板）
function showMainContent() {
    console.log('顯示主內容區域');
    $('#serverSelectPanel').hide();
    $('#searchPanel').show();
    $('#idSearchPanel').show();
    updateServerDisplay();
}

// 重置伺服器選擇（清除已保存的設定）
function resetServerSelection() {
    console.log('重置伺服器選擇');

    // 清除 LocalStorage
    localStorage.removeItem('selectedServer');
    localStorage.removeItem('selectedDatacenter');

    // 清除狀態
    state.selectedServer = null;
    state.selectedDatacenter = null;

    // 重置UI
    $('#serverSelectPanel').show();
    $('#searchPanel').hide();
    $('#idSearchPanel').hide();
    $('#dcSelect').val('');
    $('#worldSelect').html('<option value="">-- 先選擇數據中心 --</option>').prop('disabled', true);
    $('#confirmBtn').prop('disabled', true);
    $('#serverBadge').text('未選擇伺服器');

    // 清除結果面板
    clearSearchResults();
    clearItemInfo();

    showMessage('已重置伺服器選擇', 'info');
}

// 使用 PHP API 搜尋物品
function searchItemByName() {
    const query = $('#searchQuery').val().trim();

    if (!query) {
        showMessage('請輸入物品名稱', 'warning');
        return;
    }

    // 調用原有的搜尋函數
    searchItems();
}

function searchItems() {
    const query = $('#searchQuery').val().trim();

    if (!query) {
        showMessage('請輸入物品名稱', 'warning');
        return;
    }

    showGlobalLoading(true);
    const loadingTimeout = setTimeout(function () {
        if (state.isLoading) {
            showGlobalLoading(false);
            showMessage('搜尋超時，請稍後重試', 'warning');
        }
    }, 12000);
    console.log('Searching for item:', query);

    // 取得語言設定
    const language = state.selectedLanguage || 'tc';

    if (language === 'tc') {
        // 繁體中文：同時查詢兩個API並整合結果（優先使用 tnze.yyyy.games）
        console.log('🔍 同時查詢 tnze API 和 tc-search-service...');
        
        Promise.allSettled([
            searchFromTnzeAPI(query, 'zh-TW'),
            searchFromTcService(query)
        ]).then(results => {
            const tnzeResult = results[0].status === 'fulfilled' ? results[0].value : [];
            const tcResult = results[1].status === 'fulfilled' ? results[1].value : [];
            
            console.log('✅ tnze API 結果:', tnzeResult.length, '個物品 (優先)');
            console.log('✅ tc-search-service 結果:', tcResult.length, '個物品');
            
            // 整合結果並去重（tnze 優先）
            const mergedItems = mergeAndDeduplicateItems(tcResult, tnzeResult);
            
            clearTimeout(loadingTimeout);
            showGlobalLoading(false);

            if (mergedItems.length === 0) {
                showMessage('未找到符合的物品', 'warning');
                return;
            }

            console.log('📊 整合後結果:', mergedItems.length, '個物品');
            fullSearchResults = mergedItems;
            displaySearchResults(fullSearchResults);
        }).catch(err => {
            console.error('Search error:', err);
            clearTimeout(loadingTimeout);
            showGlobalLoading(false);
            showMessage('搜尋失敗：' + err.message, 'danger');
        });
    } else {
        // 英文：使用 tnze API 英文端點
        console.log('🔍 使用 tnze API 搜尋英文物品...');
        
        searchFromTnzeAPI(query, 'en').then(items => {
            clearTimeout(loadingTimeout);
            showGlobalLoading(false);

            if (items.length === 0) {
                showMessage('未找到符合的物品', 'warning');
                return;
            }

            fullSearchResults = items;
            displaySearchResults(fullSearchResults);
        }).catch(err => {
            console.error('Search error:', err);
            clearTimeout(loadingTimeout);
            showGlobalLoading(false);
            showMessage('搜尋失敗：' + err.message, 'danger');
        });
    }
}

// 從 tc-ffxiv-item-search-service 搜尋 (繁體中文，優先使用)
function searchFromTcService(query) {
    // 構建原始 API URL
    const apiUrl = config.tcSearchUrl + '?' + $.param({
        sheets: 'Items',
        query: query,
        language: 'tc',
        limit: 100,
        field: 'Name,ItemSearchCategory.Name,Icon,LevelItem.todo,Rarity'
    });
    
    // 使用 CORS 代理
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(apiUrl);

    console.log('🔍 tc-search-service 原始 URL:', apiUrl);
    console.log('🔗 CORS 代理 URL:', proxyUrl);
    console.log('⏱️ 超時設置:', config.timeout, 'ms');

    return $.ajax({
        url: proxyUrl,
        type: 'GET',
        dataType: 'json',
        timeout: config.timeout,
        crossDomain: true,
        xhrFields: {
            withCredentials: false
        }
    }).then(response => {
        console.log('✅ tc-search-service 完整回應:', response);
        console.log('📦 response 類型:', typeof response);
        console.log('🔑 response 鍵值:', Object.keys(response || {}));
        
        // 嘗試多種可能的數據結構
        let rawItems = [];
        
        // 情況1: response 本身就是陣列
        if (Array.isArray(response)) {
            rawItems = response;
            console.log('✓ response 本身是陣列，長度:', rawItems.length);
        }
        // 情況2: response.items
        else if (response && response.items) {
            rawItems = Array.isArray(response.items) ? response.items : [];
            console.log('✓ 使用 response.items，長度:', rawItems.length);
        }
        // 情況3: response.results
        else if (response && response.results) {
            rawItems = Array.isArray(response.results) ? response.results : [];
            console.log('✓ 使用 response.results，長度:', rawItems.length);
        }
        // 情況4: response.data
        else if (response && response.data) {
            rawItems = Array.isArray(response.data) ? response.data : [];
            console.log('✓ 使用 response.data，長度:', rawItems.length);
        }
        else {
            console.warn('⚠ 無法識別的 response 結構');
        }

        if (rawItems.length === 0) {
            console.warn('tc-search-service 返回空結果');
            return [];
        }

        console.log('原始物品範例 (前3個):', rawItems.slice(0, 3));

        const items = rawItems.map(item => {
            const id = item.ID || item.id;
            const name = item.Name || item.name;
            if (!id || !name) {
                return null;
            }

            return {
                id: id,
                name: name,
                category: (item.ItemSearchCategory && item.ItemSearchCategory.Name) || item.category || '未分類',
                level: item.LevelItem || item.level || 0,
                rarity: item.Rarity || item.rarity || 0,
                icon: item.Icon || null
            };
        }).filter(Boolean);

        console.log('處理後的物品數量:', items.length);
        return items;
    }).catch(err => {
        console.error('❌ tc-search-service 請求失敗');
        console.error('錯誤類型:', err.type || 'unknown');
        console.error('錯誤狀態碼:', err.status || 'N/A');
        console.error('錯誤訊息:', err.statusText || err.message);
        
        if (err.responseText) {
            console.error('回應內容:', err.responseText);
        }
        
        if (err.type === 'error') {
            console.error('⚠️ 可能是 CORS 錯誤或網路連接問題');
        } else if (err.type === 'timeout') {
            console.error('⚠️ 請求超時 (' + config.timeout + 'ms)');
        } else if (err.status === 0) {
            console.error('⚠️ 無法連接到伺服器 - 檢查 URL 或網路');
        }
        
        console.error('完整錯誤對象:', err);
        return [];
    });
}

// 整合並去重兩個API的結果
function mergeAndDeduplicateItems(tcItems, tnzeItems) {
    const itemMap = new Map();
    
    // 優先使用 tnze.yyyy.games 的結果
    tnzeItems.forEach(item => {
        if (item.id) {
            itemMap.set(item.id, item);
        }
    });
    
    // 補充 tc-search-service 的結果（只添加 tnze 沒有的物品）
    tcItems.forEach(item => {
        if (item.id && !itemMap.has(item.id)) {
            itemMap.set(item.id, item);
        }
    });
    
    // 轉換為陣列並按 ID 排序
    const mergedArray = Array.from(itemMap.values());
    mergedArray.sort((a, b) => a.id - b.id);
    
    console.log('🔄 去重前總數:', tcItems.length + tnzeItems.length);
    console.log('✨ 去重後總數:', mergedArray.length);
    console.log('🗑️ 剔除重複:', (tcItems.length + tnzeItems.length) - mergedArray.length, '個');
    
    return mergedArray;
}

// 從 tnze.yyyy.games API 搜尋 (支援多語言)
function searchFromTnzeAPI(query, language = 'zh-TW') {
    const languageCode = language === 'en' ? 'en' : 'zh-TW';
    const categoryLabel = languageCode === 'en' ? 'Uncategorized' : '未分類';
    
    return new Promise((resolve, reject) => {
        const results = [];
        const seenItemIds = new Set();
        let pageId = 0;
        const maxPages = 5;

        function fetchPage() {
            if (pageId >= maxPages) {
                console.log('🎯 tnze API (' + languageCode + ') 搜索完成，共', results.length, '個物品');
                resolve(results);
                return;
            }

            const searchName = '%' + query + '%';
            const url = 'https://tnze.yyyy.games/api/datasource/' + languageCode + '/recipe_table?' + $.param({
                page_id: pageId,
                search_name: searchName
            });

            $.ajax({
                url: url,
                type: 'GET',
                dataType: 'json',
                timeout: 12000
            }).then(response => {
                if (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
                    resolve(results);
                    return;
                }

                response.data.forEach(recipe => {
                    const itemId = parseInt(recipe.item_id) || 0;
                    const itemName = recipe.item_name || '';

                    if (itemId > 0 && itemName && !seenItemIds.has(itemId)) {
                        seenItemIds.add(itemId);
                        results.push({
                            id: itemId,
                            name: itemName,
                            category: recipe.job || categoryLabel,
                            level: parseInt(recipe.item_level) || 0,
                            recipeLevel: parseInt(recipe.rlv) || 0,  // 添加配方難度
                            rarity: 0,
                            icon: null
                        });
                    }
                });

                pageId++;
                if (pageId >= maxPages) {
                    resolve(results);
                } else {
                    fetchPage();
                }
            }).catch(err => {
                console.warn('tnze API (' + languageCode + ') 第', pageId, '頁失敗:', err);
                if (results.length > 0) {
                    resolve(results);
                } else {
                    reject(new Error('tnze API 查詢失敗'));
                }
            });
        }

        fetchPage();
    });
}

// 英文搜尋使用統一的 tnze API (searchFromTnzeAPI 函數已支援多語言)

// 通過物品ID獲取物品信息（支持多語言）
// 返回標準 Item 對象
function getItemInfoById(itemId, language = 'zh-TW') {
    const languageCode = language === 'en' ? 'en' : 'zh-TW';
    
    return new Promise((resolve, reject) => {
        $.ajax({
            url: 'https://tnze.yyyy.games/api/datasource/' + languageCode + '/item_info',
            type: 'GET',
            data: {
                item_id: itemId
            },
            dataType: 'json',
            timeout: 10000
        }).then(response => {
            if (response && response.id) {
                // 映射為標準 Item 格式
                resolve({
                    id: response.id,
                    name: response.name || '',
                    level: response.level || 0,
                    recipeLevel: response.rlv || 0,  // 製作難度
                    canBeHQ: Boolean(response.can_be_hq),  // 轉換為布爾值
                    icon: null,  // tnze API 不提供 icon
                    category: '未分類',  // tnze API 只有 category_id
                    rarity: 0  // tnze API 不提供 rarity
                });
            } else {
                resolve(null);
            }
        }).catch(err => {
            console.warn('獲取物品信息失敗 (ID:', itemId, '):', err);
            resolve(null);
        });
    });
}

function displaySearchResults(items) {
    fullSearchResults = Array.isArray(items) ? items : [];
    currentJobFilter = 'ALL';

    renderJobFilter(fullSearchResults);
    renderResultsList(getFilteredResults());
    $('#searchResultsPanel').show();
    showMessage('搜尋完成，找到 ' + fullSearchResults.length + ' 個物品', 'success');
}

function renderResultsList(items) {
    $('#resultCount').text(items.length);

    let html = '';
    items.forEach(function (item) {
        let categoryHtml = item.category ? '<span class="result-category">' + escapeHtml(item.category) + '</span>' : '';
        let levelHtml = item.level ? '<span class="result-level">LV: ' + item.level + '</span>' : '';
        let recipeLevelHtml = item.recipeLevel ? '<span class="result-level" style="background:#9c27b0;">RLV: ' + item.recipeLevel + '</span>' : '';

        html += '<div class="result-item" data-item-id="' + item.id + '">';
        html += '<div class="result-details">';
        html += '<div class="result-name">' + escapeHtml(item.name) + '</div>';
        html += '<div class="result-meta">';
        html += '<span class="result-id">ID: ' + item.id + '</span>';
        html += categoryHtml;
        html += levelHtml;
        html += recipeLevelHtml;
        html += '</div></div>';
        html += '<button class="btn btn-small btn-primary item-result-btn" onclick="queryItemById(' + item.id + ')">查詢</button>';
        html += '</div>';
    });

    $('#resultsList').html(html);
}

function renderJobFilter(items) {
    const categoryMap = new Map();

    (items || []).forEach(item => {
        const category = (item.category || '').trim();
        if (category) {
            const key = category.toLowerCase();
            const existing = categoryMap.get(key) || { name: category, count: 0 };
            existing.count += 1;
            existing.name = existing.name || category;
            categoryMap.set(key, existing);
        }
    });

    const $container = $('#jobFilterContainer');
    const $buttons = $('#jobFilterButtons');

    if (categoryMap.size === 0) {
        $container.removeClass('active');
        $buttons.html('');
        return;
    }

    const totalCount = (items || []).length;
    let html = '<button class="filter-btn filter-btn-active" data-job="ALL">全部 (' + totalCount + ')</button>';
    const sortedCategories = Array.from(categoryMap.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));

    sortedCategories.forEach(([key, data]) => {
        html += '<button class="filter-btn" data-job="' + escapeHtml(key) + '">' + escapeHtml(data.name) + ' (' + data.count + ')</button>';
    });

    $buttons.html(html);
    $container.addClass('active');

    $('#jobFilterButtons .filter-btn').off('click').on('click', function () {
        const selected = $(this).data('job');
        currentJobFilter = selected;

        $('#jobFilterButtons .filter-btn').removeClass('filter-btn-active');
        $(this).addClass('filter-btn-active');

        renderResultsList(getFilteredResults());
    });
}

function getFilteredResults() {
    if (currentJobFilter === 'ALL') {
        return fullSearchResults;
    }

    return fullSearchResults.filter(item => {
        const category = (item.category || '').trim().toLowerCase();
        return category === currentJobFilter;
    });
}

function clearSearchResults() {
    $('#searchResultsPanel').hide();
    $('#resultsList').html('');
    $('#searchQuery').val('');
    fullSearchResults = [];
    currentJobFilter = 'ALL';
    $('#jobFilterContainer').removeClass('active');
    $('#jobFilterButtons').html('');
}

// ==================== 物品查詢 ====================
let currentItemId = null;

function queryItemById(itemId) {
    if (!itemId) {
        itemId = $('#itemIdInput').val().trim();
    }

    if (!itemId) {
        showMessage('請輸入物品 ID', 'warning');
        return;
    }

    // 移除所有已查詢的標記
    $('.result-item').removeClass('queried');
    
    // 標記當前查詢的物品
    $('.result-item[data-item-id="' + itemId + '"]').addClass('queried');

    currentItemId = itemId;
    showGlobalLoading(true);
    console.log('Querying item ID:', itemId);

    // 使用 XIVAPI 獲取物品信息
    $.ajax({
        url: 'https://xivapi.com/Item/' + encodeURIComponent(itemId),
        type: 'GET',
        dataType: 'json',
        timeout: 10000,
        success: function (response) {
            console.log('XIVAPI item response:', response);

            if (!response.ID) {
                showMessage('找不到物品 ID: ' + itemId, 'danger');
                showGlobalLoading(false);
                return;
            }

            // 如果是繁中，獲取中文名稱
            const currentLanguage = state.selectedLanguage || 'tc';
            if (currentLanguage === 'tc') {
                getItemInfoById(response.ID, 'zh-TW').then(function(chineseInfo) {
                    const itemName = (chineseInfo && chineseInfo.name) ? chineseInfo.name : response.Name;
                    
                    const itemData = {
                        item: {
                            id: response.ID,
                            name: itemName,
                            description: response.Description
                        },
                        world: state.selectedServer,
                        price: null
                    };

                    // 設置 currentItem（標準 Item 對象）
                    currentItem = {
                        id: response.ID,
                        name: itemName,
                        icon: response.Icon || null,
                        level: response.LevelItem || 0,
                        category: response.ItemSearchCategory?.Name || '未分類',
                        rarity: response.Rarity || 0,
                        canBeHQ: Boolean(response.CanBeHq)
                    };

                    displayItemInfo(itemData);
                    showMessage('物品信息已載入', 'success');

                    // 嘗試從 Universalis 獲取價格，並自動計算合成成本
                    if (state.selectedServer) {
                        getItemPrice(response.ID)
                            .always(() => {
                                showGlobalLoading(false);
                                autoCalculateCraftingCost();
                            });
                    } else {
                        showGlobalLoading(false);
                    }

                    // 顯示製造成本計算面板
                    $('#craftingCostPanel').show();
                });
            } else {
                // 英文直接使用
                const itemData = {
                    item: {
                        id: response.ID,
                        name: response.Name,
                        description: response.Description
                    },
                    world: state.selectedServer,
                    price: null
                };

                // 設置 currentItem（標準 Item 對象）
                currentItem = {
                    id: response.ID,
                    name: response.Name,
                    icon: response.Icon || null,
                    level: response.LevelItem || 0,
                    category: response.ItemSearchCategory?.Name || '未分類',
                    rarity: response.Rarity || 0,
                    canBeHQ: Boolean(response.CanBeHq)
                };

                displayItemInfo(itemData);
                showMessage('物品信息已載入', 'success');

                // 嘗試從 Universalis 獲取價格，並自動計算合成成本
                if (state.selectedServer) {
                    getItemPrice(response.ID)
                        .always(() => {
                            showGlobalLoading(false);
                            autoCalculateCraftingCost();
                        });
                } else {
                    showGlobalLoading(false);
                }

                // 顯示製造成本計算面板
                $('#craftingCostPanel').show();
            }
        },
        error: function (xhr, status, error) {
            console.log('XIVAPI item error:', status, error, xhr);
            showMessage('查詢失敗。物品 ID 可能不存在。', 'danger');
            showGlobalLoading(false);
        }
    });
}

function displayItemInfo(data) {
    const item = data.item;
    const price = data.price;

    $('#itemTitle').text(item.name + ' (ID: ' + item.id + ')');
    
    // 建立左右佈局：左邊物品信息，右邊價格信息
    let infoHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">';
    
    // 左邊：物品信息
    infoHtml += '<div>';
    infoHtml += '<h4 style="margin: 0 0 0.75rem 0; color: var(--primary);">📋 物品信息</h4>';
    infoHtml += '<div class="info-row">';
    infoHtml += '<span class="label">物品名稱：</span>';
    infoHtml += '<span class="value">' + escapeHtml(item.name) + '</span>';
    infoHtml += '</div>';
    infoHtml += '<div class="info-row">';
    infoHtml += '<span class="label">物品 ID：</span>';
    infoHtml += '<span class="value">' + item.id + '</span>';
    infoHtml += '</div>';
    infoHtml += '<div class="info-row">';
    infoHtml += '<span class="label">伺服器：</span>';
    infoHtml += '<span class="value">' + escapeHtml(data.world) + '</span>';
    infoHtml += '</div>';
    infoHtml += '</div>';
    
    // 右邊：價格信息（占位，稍後填充）
    infoHtml += '<div id="priceInfoContainer">';
    infoHtml += '<h4 style="margin: 0 0 0.75rem 0; color: var(--primary);">💰 市場價格</h4>';
    infoHtml += '<div id="priceContent" style="color: #999;">載入中...</div>';
    infoHtml += '</div>';
    
    infoHtml += '</div>';
    
    $('#itemInfoContent').html(infoHtml);
    $('#itemInfoPanel').show();

    // 依 index.php 邏輯載入配方詳情，含子材料成本
    loadRecipeDetailsForItem(item.id, item.name);
}

function getItemPrice(itemId) {
    if (!state.selectedServer) {
        console.log('No server selected, skipping price lookup');
        return $.Deferred().resolve();
    }

    console.log('Getting price for item', itemId, 'on server', state.selectedServer);

    return $.ajax({
        url: 'https://universalis.app/api/v2/' + encodeURIComponent(state.selectedServer) + '/' + encodeURIComponent(itemId),
        type: 'GET',
        dataType: 'json',
        timeout: 10000
    }).then(function (response) {
        console.log('Universalis price response:', response);
        console.log('lastUploadTime:', response.lastUploadTime);

        if (response.averagePriceNQ || response.averagePriceHQ || response.minPriceNQ || response.minPriceHQ) {
            // 映射為標準 price 對象格式
            const price = {
                nqMin: response.minPriceNQ || 0,
                nqAvg: Math.round(response.averagePriceNQ) || 0,
                hqMin: response.minPriceHQ || 0,
                hqAvg: Math.round(response.averagePriceHQ) || 0,
                lastUploadTime: response.lastUploadTime || null,
                server: state.selectedServer
            };
            
            console.log('Saved price data:', price);

            // 將價格附加到 currentItem
            if (currentItem && currentItem.id === itemId) {
                currentItem.price = price;
            }

            // 填充到右側價格信息容器
            let priceHtml = '<div class="price-row">' +
                '<div class="price-type">NQ (Normal Quality)</div>' +
                '<div>最低: <strong>' + price.nqMin.toLocaleString() + ' G</strong></div>' +
                '<div>平均: <strong>' + price.nqAvg.toLocaleString() + ' G</strong></div>' +
                '</div>' +
                '<div class="price-row">' +
                '<div class="price-type">HQ (High Quality)</div>' +
                '<div>最低: <strong>' + price.hqMin.toLocaleString() + ' G</strong></div>' +
                '<div>平均: <strong>' + price.hqAvg.toLocaleString() + ' G</strong></div>' +
                '</div>';
            
            // 添加更新時間
            if (price.lastUploadTime) {
                priceHtml += '<div style="font-size: 0.85rem; color: #999; margin-top: 0.75rem; text-align: right; padding-top: 0.5rem; border-top: 1px solid #e5e7eb;">更新：' + formatUpdateTime(price.lastUploadTime) + '</div>';
            }
            
            $('#priceContent').html(priceHtml);
        } else {
            console.log('No price data available');
            $('#priceContent').html('<div style="color: #999;">無市場價格數據</div>');
        }
    }).catch(function (xhr, status, error) {
        console.log('Universalis error:', status, error);
        $('#priceContent').html('<div style="color: #e74c3c;">載入價格失敗</div>');
    });
}

function clearItemInfo() {
    $('#itemInfoPanel').hide();
    $('#pricePanel').hide();
    $('#craftPanel').hide();
    $('#craftContent').html('');
    $('#craftingCostPanel').hide();
    $('#itemIdInput').val('');
    currentItemId = null;
    currentItem = null;  // 清除當前物品
}

// ==================== 製造成本計算 ====================

function calculateCraftingCost() {
    if (!currentItemId) {
        showMessage('請先查詢物品', 'warning');
        return;
    }

    const quantity = parseInt($('#craftQuantity').val()) || 1;

    if (!state.selectedServer) {
        showMessage('請選擇伺服器', 'warning');
        return;
    }

    showGlobalLoading(true);
    console.log('Calculating crafting cost for item:', currentItemId, 'quantity:', quantity);

    // 先從 XIVAPI 獲取合成信息
    $.ajax({
        url: 'https://xivapi.com/Item/' + currentItemId,
        type: 'GET',
        dataType: 'json',
        timeout: config.timeout,
        success: function (itemResponse) {
            console.log('Item response:', itemResponse);

            if (!itemResponse.Recipes || itemResponse.Recipes.length === 0) {
                showMessage('找不到該物品的合成', 'warning');
                showGlobalLoading(false);
                return;
            }

            const recipeId = itemResponse.Recipes[0].ID;
            console.log('Found recipe ID:', recipeId);

            // 獲取合成詳細信息
            $.ajax({
                url: 'https://xivapi.com/Recipe/' + recipeId,
                type: 'GET',
                dataType: 'json',
                timeout: config.timeout,
                success: function (recipeResponse) {
                    console.log('Recipe details:', recipeResponse);
                    calculateAndDisplayCost(recipeResponse, quantity);
                    showGlobalLoading(false);
                },
                error: function (xhr, status, error) {
                    console.log('Recipe details error:', status, error);
                    showGlobalLoading(false);
                    showMessage('獲取合成詳情失敗', 'danger');
                }
            });
        },
        error: function (xhr, status, error) {
            console.log('Item lookup error:', status, error);
            showGlobalLoading(false);
            showMessage('查詢物品失敗：' + error, 'danger');
        }
    });
}

// 自動計算合成成本（在有伺服器且已有 currentItemId 時觸發）
function autoCalculateCraftingCost() {
    if (!state.selectedServer) {
        return;
    }
    if (!currentItemId) {
        return;
    }
    // 使用當前輸入的數量（預設 1）
    calculateCraftingCost();
}

function calculateAndDisplayCost(recipe, quantity) {
    if (!recipe) {
        showMessage('無效的合成信息', 'danger');
        return;
    }

    const ingredients = [];
    let totalCost = 0;
    const currentLanguage = state.selectedLanguage || 'tc';

    // 提取材料列表
    const promises = [];
    for (let i = 0; i <= 9; i++) {
        const ingredientKey = 'ItemIngredient' + i;
        const amountKey = 'AmountIngredient' + i;

        if (recipe[ingredientKey] && recipe[ingredientKey].ID) {
            const itemId = recipe[ingredientKey].ID;
            const amount = (recipe[amountKey] || 0) * quantity;  // 使用 amount
            const icon = recipe[ingredientKey].IconHD || recipe[ingredientKey].Icon || null;
            let itemName = recipe[ingredientKey].Name || '未知';

            if (amount > 0) {
                // 如果是繁中，通過ID獲取中文名稱
                if (currentLanguage === 'tc') {
                    const promise = getItemInfoById(itemId, 'zh-TW').then(itemInfo => {
                        if (itemInfo && itemInfo.name) {
                            itemName = itemInfo.name;
                        }
                        return {
                            id: itemId,
                            name: itemName,
                            amount: amount,  // 使用 amount 而非 requiredAmount
                            unitPrice: 0,
                            icon: icon,
                            level: itemInfo?.level || 0,
                            recipeLevel: itemInfo?.recipeLevel || 0,
                            category: itemInfo?.category || '未分類',
                            rarity: itemInfo?.rarity || 0,
                            canBeHQ: itemInfo?.canBeHQ || false
                        };
                    });
                    promises.push(promise);
                } else {
                    ingredients.push({
                        id: itemId,
                        name: itemName,
                        amount: amount,  // 使用 amount 而非 requiredAmount
                        unitPrice: 0,
                        icon: icon,
                        level: 0,
                        recipeLevel: 0,
                        category: '未分類',
                        rarity: 0,
                        canBeHQ: false
                    });
                }
            }
        }
    }

    // 等待所有中文名稱獲取完成
    const processIngredients = currentLanguage === 'tc' ? 
        Promise.all(promises).then(results => results) : 
        Promise.resolve(ingredients);

    processIngredients.then(finalIngredients => {
        if (currentLanguage === 'tc') {
            ingredients.push(...finalIngredients);
        }

        if (ingredients.length === 0) {
            showMessage('無法解析合成材料', 'warning');
            return;
        }

        console.log('Ingredients found:', ingredients);

        // 批量查詢材料價格
        const itemIds = ingredients.map(i => i.id).join(',');
        $.ajax({
            url: 'https://universalis.app/api/v2/aggregated/' + encodeURIComponent(state.selectedServer) + '/' + itemIds,
            type: 'GET',
            dataType: 'json',
            timeout: config.timeout,
            success: function (priceResponse) {
                console.log('Price response:', priceResponse);

                // 更新材料價格
                if (priceResponse.results) {
                    priceResponse.results.forEach(function (result) {
                        const itemId = result.itemID || result.itemId;
                        const ingredient = ingredients.find(i => i.id === itemId);

                        if (ingredient && result.nq) {
                            // 使用 NQ 最低價格或平均價格
                            const unit = result.nq.minListing?.world?.price ||
                                result.nq.averageSalePrice?.world?.price || 0;
                            ingredient.unitPrice = roundPrice(unit);
                            ingredient.lastUploadTime = result.lastUploadTime || null;  // 保存更新時間
                            totalCost += ingredient.unitPrice * ingredient.amount;  // 使用 amount
                        }
                    });
                }

                // 顯示結果
                totalCost = roundPrice(totalCost);
                const costPerUnit = quantity > 0 ? roundPrice(totalCost / quantity) : 0;
                displayCraftingCost({
                    ingredients: ingredients,
                    totalCost: totalCost,
                    costPerUnit: costPerUnit
                });
                showMessage('成本計算完成', 'success');
            },
            error: function (xhr, status, error) {
                console.log('Price lookup error:', status, error);
                showMessage('無法獲取材料價格，請稍後重試', 'warning');

                // 仍然顯示材料列表，但價格為 0
                const costPerUnit = 0;
                displayCraftingCost({
                    ingredients: ingredients,
                    totalCost: 0,
                    costPerUnit: costPerUnit
                });
            }
        });
    }).catch(error => {
        console.error('Error fetching Chinese names:', error);
        showMessage('無法獲取材料資訊', 'warning');
    });
}

function displayCraftingCost(data) {
    let html = '';

    if (data.ingredients && data.ingredients.length > 0) {
        html += '<h4 style="margin-bottom: 1rem; color: var(--primary);">📦 所需材料</h4>';
        html += '<div style="overflow-y: auto; max-height: 300px; margin-bottom: 1.5rem;">';

        data.ingredients.forEach(function (ingredient) {
            const totalCost = roundPrice((ingredient.unitPrice || 0) * ingredient.amount);  // 使用 amount
            const iconUrl = getIconUrl(ingredient.icon);
            html += '<div style="display: flex; justify-content: space-between; padding: 0.5rem; border-bottom: 1px solid var(--border-color);">';
            html += '<div style="display:flex; align-items:center; gap:0.5rem;">';
            html += '<img src="' + iconUrl + '" alt="' + escapeHtml(ingredient.name) + ' icon" style="width:36px; height:36px; border-radius:0.5rem; border:1px solid var(--border-color); object-fit: cover; background:#e9ecef;">';
            html += '<div>';
            html += '<strong>' + escapeHtml(ingredient.name) + '</strong><br>';
            let infoText = '數量: ' + ingredient.amount + ' | 單價: ' + (ingredient.unitPrice || '0') + ' G';
            if (ingredient.recipeLevel) {
                infoText += ' | RLV: ' + ingredient.recipeLevel;
            }
            html += '<small style="color: var(--gray);">' + infoText + '</small>';
            if (ingredient.lastUploadTime) {
                html += '<div style="font-size: 0.75rem; color: #999; margin-top: 0.125rem;">市場更新：' + formatUpdateTime(ingredient.lastUploadTime) + '</div>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div style="text-align: right;">';
            html += '<strong>' + totalCost.toLocaleString() + ' G</strong>';
            html += '</div>';
            html += '</div>';
        });

        html += '</div>';
    }

    html += '<div style="background: #e8f4f8; padding: 1rem; border-radius: 0.375rem; margin-top: 1rem;">';
    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">';
    html += '<span>總成本：</span>';
    html += '<strong style="color: var(--danger);">' + (data.totalCost || 0).toLocaleString() + ' G</strong>';
    html += '</div>';
    html += '<div style="display: flex; justify-content: space-between;">';
    html += '<span>平均成本（單位）：</span>';
    html += '<strong style="color: var(--primary);">' + (data.costPerUnit || 0).toLocaleString() + ' G</strong>';
    html += '</div>';
    html += '</div>';

    // 顯示成品市場價 (使用 currentItem.price 而非 state.lastItemPriceData)
    if (currentItem && currentItem.price) {
        const price = currentItem.price;
        html += '<div style="background: #fff9e6; padding: 1rem; border-radius: 0.375rem; margin-top: 0.75rem; border: 1px solid var(--border-color);">';
        html += '<div style="font-weight: 600; margin-bottom: 0.5rem;">成品市場價（' + escapeHtml(price.server || '-') + '）</div>';
        html += '<div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">';
        html += '<span>NQ 最低 / 平均：</span>';
        html += '<strong>' + price.nqMin.toLocaleString() + ' / ' + price.nqAvg.toLocaleString() + ' G</strong>';
        html += '</div>';
        html += '<div style="display: flex; justify-content: space-between;">';
        html += '<span>HQ 最低 / 平均：</span>';
        html += '<strong>' + price.hqMin.toLocaleString() + ' / ' + price.hqAvg.toLocaleString() + ' G</strong>';
        html += '</div>';
        if (price.lastUploadTime) {
            console.log('Displaying update time for finished product:', price.lastUploadTime);
            html += '<div style="font-size: 0.85rem; color: #999; margin-top: 0.5rem; text-align: right;">更新：' + formatUpdateTime(price.lastUploadTime) + '</div>';
        } else {
            console.log('No lastUploadTime in price');
        }
        html += '</div>';
    }

    $('#craftingCostContent').html(html);
    $('#craftingCostPanel').show();
    
    // 如果合成表有內容，也一併顯示
    if ($('#craftContent').html().trim() !== '') {
        $('#craftPanel').show();
    }
    
    showMessage('成本計算完成', 'success');
}

// ==================== 合成表（含子材料成本） ====================
async function loadRecipeDetailsForItem(itemId, itemName) {
    console.log('loadRecipeDetailsForItem', itemId, itemName);
    $('#craftPanel').hide();
    $('#craftContent').html('');

    if (!itemId) {
        return;
    }

    // 沒選伺服器時，只顯示配方結構不算成本
    const hasServer = Boolean(state.selectedServer);

    try {
        showGlobalLoading(true);

        // 先取得物品可用的配方列表，取第一個
        const itemResponse = await $.ajax({
            url: config.xivApiUrl + '/Item/' + encodeURIComponent(itemId),
            type: 'GET',
            dataType: 'json',
            timeout: config.timeout
        });

        const recipes = (itemResponse && itemResponse.Recipes) || [];
        if (!recipes.length) {
            console.log('No recipes for item', itemId);
            
            // 隱藏製造成本計算面板
            $('#craftingCostPanel').hide();
            
            // 構建無合成表面板
            let html = '';
            html += '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.25rem; border-radius: 0.75rem; margin-bottom: 1rem;">';
            html += '<h4 style="margin:0 0 0.5rem 0;">' + escapeHtml(itemName || itemResponse.Name) + '</h4>';
            html += '<div style="font-size:0.9rem; opacity:0.9;">';
            html += '<span>此物品無合成表 (ID: ' + itemId + ')</span>';
            html += '</div>';
            html += '</div>';
            
            // 添加市場價格查詢中的提示
            if (hasServer) {
                html += '<div id="priceLoading" style="background:#e3f2fd; padding:1rem; border-radius:0.5rem; border-left:4px solid #2196F3; margin-top:0.5rem;">';
                html += '<div style="display:flex; align-items:center; gap:0.5rem;">';
                html += '<span style="display:inline-block; width:16px; height:16px; border:2px solid #2196F3; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></span>';
                html += '<span style="color:#1976D2;">正在查詢市場價格...</span>';
                html += '</div>';
                html += '</div>';
                html += '<style>';
                html += '@keyframes spin { to { transform: rotate(360deg); } }';
                html += '</style>';
            }
            
            $('#craftContent').html(html);
            $('#craftPanel').show();
            
            // 查不到合成表時，嘗試顯示市場單價（填充到右側價格區域）
            if (hasServer) {
                // 直接請求 Universalis API
                $.ajax({
                    url: 'https://universalis.app/api/v2/' + encodeURIComponent(state.selectedServer) + '/' + encodeURIComponent(itemId),
                    type: 'GET',
                    dataType: 'json',
                    timeout: 10000
                }).done(function(priceResponse) {
                    console.log('🔍 loadRecipeDetailsForItem 市場價格回應:', priceResponse);
                    
                    // 檢查是否有任何價格數據
                    const hasPriceData = priceResponse && (
                        (priceResponse.averagePriceNQ && priceResponse.averagePriceNQ > 0) ||
                        (priceResponse.averagePriceHQ && priceResponse.averagePriceHQ > 0) ||
                        (priceResponse.minPriceNQ && priceResponse.minPriceNQ > 0) ||
                        (priceResponse.minPriceHQ && priceResponse.minPriceHQ > 0)
                    );
                    
                    console.log('💰 是否有價格數據:', hasPriceData);
                    
                    if (hasPriceData) {
                        // 移除加載提示
                        $('#priceLoading').remove();
                        
                        // 將價格數據填充到右側價格容器
                        let priceHtml = '';
                        
                        // NQ 價格
                        priceHtml += '<div class="price-row">';
                        priceHtml += '<div class="price-type">NQ (Normal Quality)</div>';
                        if (priceResponse.minPriceNQ) {
                            priceHtml += '<div>最低: <strong>' + priceResponse.minPriceNQ.toLocaleString() + '</strong> 金幣</div>';
                        }
                        if (priceResponse.averagePriceNQ) {
                            priceHtml += '<div>平均: <strong>' + Math.round(priceResponse.averagePriceNQ).toLocaleString() + '</strong> 金幣</div>';
                        }
                        if (!priceResponse.minPriceNQ && !priceResponse.averagePriceNQ) {
                            priceHtml += '<div style="color:#999;">無市場資料</div>';
                        }
                        priceHtml += '</div>';
                        
                        // HQ 價格
                        priceHtml += '<div class="price-row">';
                        priceHtml += '<div class="price-type">HQ (High Quality)</div>';
                        if (priceResponse.minPriceHQ) {
                            priceHtml += '<div>最低: <strong>' + priceResponse.minPriceHQ.toLocaleString() + '</strong> 金幣</div>';
                        }
                        if (priceResponse.averagePriceHQ) {
                            priceHtml += '<div>平均: <strong>' + Math.round(priceResponse.averagePriceHQ).toLocaleString() + '</strong> 金幣</div>';
                        }
                        if (!priceResponse.minPriceHQ && !priceResponse.averagePriceHQ) {
                            priceHtml += '<div style="color:#999;">無市場資料</div>';
                        }
                        priceHtml += '</div>';
                        
                        $('#priceContent').html(priceHtml);
                    } else {
                        // 即使無價格數據也替換加載提示為提醒
                        $('#priceLoading').replaceWith(
                            '<div style="background:#fff3cd; padding:1rem; border-radius:0.5rem; border-left:4px solid #ffc107; margin-top:0.5rem;">' +
                            '<div style="color:#856404;">ℹ️ 此物品在 ' + escapeHtml(state.selectedServer) + ' 伺服器暫無市場價格</div>' +
                            '</div>'
                        );
                        $('#priceContent').html('<div style="color:#999;">暫無市場價格</div>');
                    }
                }).fail(function(err) {
                    console.warn('❌ loadRecipeDetailsForItem 查詢市場價格失敗:', err.statusText);
                    
                    // 移除加載提示，顯示失敗提示
                    $('#priceLoading').replaceWith(
                        '<div style="background:#ffebee; padding:1rem; border-radius:0.5rem; border-left:4px solid #f44336; margin-top:0.5rem;">' +
                        '<div style="color:#c62828;">⚠️ 市場價格查詢失敗</div>' +
                        '</div>'
                    );
                });
            }
            
            return;
        }

        const primaryRecipeId = recipes[0].ID;
        const recipeDetail = await fetchRecipeDetail(primaryRecipeId);
        const recipeCost = await buildRecipeCost(recipeDetail, hasServer);

        // 先顯示基本合成表（快速顯示）
        renderRecipeDetails(recipeDetail, recipeCost, itemName);
        showGlobalLoading(false);

        // 異步查詢子材料的配方（背景加載，不阻塞顯示）
        if (hasServer) {
            attachSubRecipeCosts(recipeCost.ingredients, hasServer).then(() => {
                // 子材料加載完成後更新顯示
                renderRecipeDetails(recipeDetail, recipeCost, itemName);
            }).catch(err => {
                console.warn('子材料查詢失敗:', err);
            });
        }
    } catch (error) {
        console.warn('loadRecipeDetailsForItem error', error);
        showMessage('載入配方詳情失敗', 'warning');
    } finally {
        showGlobalLoading(false);
    }
}

async function fetchRecipeDetail(recipeId) {
    return $.ajax({
        url: config.xivApiUrl + '/Recipe/' + encodeURIComponent(recipeId),
        type: 'GET',
        dataType: 'json',
        timeout: config.timeout
    });
}

async function collectIngredients(recipeDetail) {
    const ingredients = [];
    const currentLanguage = state.selectedLanguage || 'tc';
    
    // 先收集所有材料的基本信息
    const items = [];
    for (let i = 0; i <= 9; i++) {
        const item = recipeDetail['ItemIngredient' + i];
        const amount = recipeDetail['AmountIngredient' + i];
        if (item && item.ID && amount > 0) {
            items.push({
                id: item.ID,
                name: item.Name || '未知',
                amount: amount,
                icon: item.IconHD || item.Icon || null
            });
        }
    }
    
    // 如果選擇繁中語言，並行獲取所有中文名稱
    if (currentLanguage === 'tc' && items.length > 0) {
        const namePromises = items.map(item => 
            getItemInfoById(item.id, 'zh-TW').then(itemInfo => {
                if (itemInfo && itemInfo.name) {
                    item.name = itemInfo.name;
                    console.log('✓ 更新材料名稱:', item.id, '->', item.name);
                }
            }).catch(err => {
                console.warn('獲取材料名稱失敗:', item.id, err);
            })
        );
        await Promise.all(namePromises);
    }
    
    // 組裝最終結果
    items.forEach(item => {
        ingredients.push({
            id: item.id,
            name: item.name,
            amount: item.amount,
            icon: item.icon,
            unitPrice: 0,
            totalCost: 0,
            subRecipe: null
        });
    });
    
    return ingredients;
}

async function getAggregatedPrices(itemIds) {
    if (!itemIds || !itemIds.length || !state.selectedServer) {
        return null;
    }

    try {
        const response = await $.ajax({
            url: 'https://universalis.app/api/v2/aggregated/' + encodeURIComponent(state.selectedServer) + '/' + itemIds.join(','),
            type: 'GET',
            dataType: 'json',
            timeout: config.timeout
        });
        // 為每個結果添加時間戳
        const results = response.results || [];
        console.log('Aggregated prices response:', response);
        console.log('Results count:', results.length);
        results.forEach(item => {
            // 嘗試從多個位置獲取時間戳（毫秒級）
            let uploadTimeMs = null;
            
            // 優先從 worldUploadTimes 獲取
            if (item.worldUploadTimes && item.worldUploadTimes.length > 0) {
                uploadTimeMs = item.worldUploadTimes[0].timestamp;
            }
            // 或從最近購買記錄獲取
            else if (item.nq?.recentPurchase?.world?.timestamp) {
                uploadTimeMs = item.nq.recentPurchase.world.timestamp;
            }
            else if (item.hq?.recentPurchase?.world?.timestamp) {
                uploadTimeMs = item.hq.recentPurchase.world.timestamp;
            }
            
            // 轉換為秒級時間戳
            item.lastUploadTime = uploadTimeMs ? Math.floor(uploadTimeMs / 1000) : null;
            console.log('Item', item.itemID || item.itemId, 'lastUploadTime:', item.lastUploadTime, '(from ms:', uploadTimeMs, ')');
        });
        return results;
    } catch (err) {
        console.warn('Aggregated price fetch failed', err);
        return null;
    }
}

async function buildRecipeCost(recipeDetail, hasServer) {
    const ingredients = await collectIngredients(recipeDetail);
    const itemIds = ingredients.map(i => i.id);
    let priceMap = {};

    if (hasServer) {
        const aggResults = await getAggregatedPrices(itemIds);
        if (aggResults) {
            aggResults.forEach(res => {
                const id = res.itemID || res.itemId;
                const unit = res.nq?.minListing?.world?.price || res.nq?.averageSalePrice?.world?.price || res.minPriceNQ || 0;
                
                priceMap[id] = {
                    price: roundPrice(unit),
                    lastUploadTime: res.lastUploadTime  // 已在 getAggregatedPrices 中處理
                };
                console.log('PriceMap for item', id, '- price:', priceMap[id].price, 'uploadTime:', res.lastUploadTime);
            });
        }
    }

    let totalCost = 0;
    ingredients.forEach(ing => {
        const priceData = priceMap[ing.id];
        if (priceData && typeof priceData === 'object') {
            ing.unitPrice = priceData.price || 0;
            ing.priceUpdateTime = priceData.lastUploadTime;
            console.log('✓ Ingredient', ing.name, '(ID:', ing.id, ') - unitPrice:', ing.unitPrice, 'priceUpdateTime:', ing.priceUpdateTime);
        } else {
            ing.unitPrice = roundPrice(priceData || 0);
            ing.priceUpdateTime = null;
            console.log('✗ Ingredient', ing.name, '(ID:', ing.id, ') - No price data');
        }
        ing.totalCost = roundPrice(ing.unitPrice * ing.amount);
        totalCost += ing.totalCost;
    });

    const yields = recipeDetail.AmountResult || recipeDetail.AmountResultHQ || 1;
    totalCost = roundPrice(totalCost);
    const costPerUnit = yields > 0 ? roundPrice(totalCost / yields) : totalCost;

    // 獲取成品名稱（如果是繁中則通過ID重新獲取）
    let resultItemName = recipeDetail.ItemResult?.Name || '成品';
    const currentLanguage = state.selectedLanguage || 'tc';
    
    if (currentLanguage === 'tc' && recipeDetail.ItemResult?.ID) {
        const resultInfo = await getItemInfoById(recipeDetail.ItemResult.ID, 'zh-TW');
        if (resultInfo && resultInfo.name) {
            resultItemName = resultInfo.name;
            console.log('✓ 更新成品名稱:', recipeDetail.ItemResult.ID, '->', resultItemName);
        }
    }

    return {
        recipe: {
            id: recipeDetail.ID,
            classJob: (recipeDetail.ClassJob && (recipeDetail.ClassJob.Abbreviation || recipeDetail.ClassJob.Name)) || '-',
            level: (recipeDetail.RecipeLevelTable && (recipeDetail.RecipeLevelTable.ClassJobLevel || recipeDetail.RecipeLevelTable.Name)) || '-',
            difficulty: recipeDetail.Difficulty || '-',
            durability: recipeDetail.Durability || '-',
            resultItem: {
                id: recipeDetail.ItemResult?.ID || '',
                name: resultItemName
            }
        },
        ingredients,
        totalCost,
        yields,
        costPerUnit
    };
}
// 顯示無合成表但有市場價格的物品
function renderNoRecipeWithPrice(itemName, itemId, priceResponse) {
    let html = '';

    html += '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.25rem; border-radius: 0.75rem; margin-bottom: 1rem;">';
    html += '<h4 style="margin:0 0 0.5rem 0;">' + escapeHtml(itemName) + '</h4>';
    html += '<div style="font-size:0.9rem; opacity:0.9;">';
    html += '<span>此物品無合成表 (ID: ' + itemId + ')</span>';
    html += '</div>';
    html += '</div>';

    if (priceResponse.averagePriceNQ || priceResponse.averagePriceHQ || priceResponse.minPriceNQ || priceResponse.minPriceHQ) {
        html += '<div style="background:#fff9e6; padding:1rem; border-radius:0.5rem; border:1px solid #ffc069; margin-top:0.5rem;">';
        html += '<h5 style="margin:0 0 0.75rem 0; color:#cc7700;">📊 市場價格 (' + escapeHtml(state.selectedServer) + ')</h5>';
        
        html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">';
        
        // NQ 價格
        html += '<div style="background:white; padding:0.75rem; border-radius:0.5rem; border-left:3px solid #1890ff;">';
        html += '<div style="font-weight:700; color:#1890ff; margin-bottom:0.5rem;">NQ (Normal Quality)</div>';
        if (priceResponse.minPriceNQ) {
            html += '<div style="margin-bottom:0.25rem;"><span style="color:#666;">最低</span>: <strong>' + priceResponse.minPriceNQ.toLocaleString() + ' G</strong></div>';
        }
        if (priceResponse.averagePriceNQ) {
            html += '<div><span style="color:#666;">平均</span>: <strong>' + Math.round(priceResponse.averagePriceNQ).toLocaleString() + ' G</strong></div>';
        }
        html += '</div>';
        
        // HQ 價格
        html += '<div style="background:white; padding:0.75rem; border-radius:0.5rem; border-left:3px solid #faad14;">';
        html += '<div style="font-weight:700; color:#faad14; margin-bottom:0.5rem;">HQ (High Quality)</div>';
        if (priceResponse.minPriceHQ) {
            html += '<div style="margin-bottom:0.25rem;"><span style="color:#666;">最低</span>: <strong>' + priceResponse.minPriceHQ.toLocaleString() + ' G</strong></div>';
        }
        if (priceResponse.averagePriceHQ) {
            html += '<div><span style="color:#666;">平均</span>: <strong>' + Math.round(priceResponse.averagePriceHQ).toLocaleString() + ' G</strong></div>';
        }
        html += '</div>';
        
        html += '</div>';
        html += '</div>';
    }

    $('#craftContent').html(html);
    $('#craftPanel').show();
}

async function fetchSubRecipeCost(itemId, hasServer) {
    try {
        const itemResponse = await $.ajax({
            url: config.xivApiUrl + '/Item/' + encodeURIComponent(itemId),
            type: 'GET',
            dataType: 'json',
            timeout: config.timeout
        });
        const recipes = (itemResponse && itemResponse.Recipes) || [];
        if (!recipes.length) return null;

        const recipeDetail = await fetchRecipeDetail(recipes[0].ID);
        return await buildRecipeCost(recipeDetail, hasServer);
    } catch (err) {
        console.warn('fetchSubRecipeCost error for', itemId, err);
        return null;
    }
}

async function attachSubRecipeCosts(ingredients, hasServer) {
    // 並行查詢所有子材料的配方
    const promises = ingredients.map(async (ing) => {
        const subCost = await fetchSubRecipeCost(ing.id, hasServer);
        if (subCost) {
            ing.subRecipe = subCost;
        }
    });
    
    await Promise.all(promises);
}

function renderRecipeDetails(recipeDetail, recipeCost, itemName) {
    const headerName = itemName || recipeCost.recipe.resultItem.name;
    let html = '';

    html += '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.25rem; border-radius: 0.75rem; margin-bottom: 1rem;">';
    html += '<h4 style="margin:0 0 0.5rem 0;">' + escapeHtml(headerName) + '</h4>';
    html += '<div style="display:flex; gap:1rem; flex-wrap:wrap; font-size:0.9rem; opacity:0.9;">';
    html += '<span>職業: ' + escapeHtml(recipeCost.recipe.classJob) + '</span>';
    html += '<span>等級: ' + escapeHtml(recipeCost.recipe.level) + '</span>';
    html += '<span>難度: ' + escapeHtml(recipeCost.recipe.difficulty) + '</span>';
    html += '<span>耐久: ' + escapeHtml(recipeCost.recipe.durability) + '</span>';
    html += '<span>產出: x' + recipeCost.yields + '</span>';
    html += '</div>';
    html += '</div>';

    html += '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1rem;">';
    html += '<div style="background:#f8f9fa; padding:1rem; border-radius:0.5rem; border-left:4px solid #28a745;">';
    html += '<div style="font-size:0.9rem; color:#666;">製作總成本</div>';
    html += '<div style="font-size:1.4rem; font-weight:700; color:#28a745;">' + recipeCost.totalCost.toLocaleString() + ' G</div>';
    html += '<div style="font-size:0.85rem; color:#555;">單個: ' + recipeCost.costPerUnit.toLocaleString() + ' G</div>';
    html += '</div>';
    html += '<div style="background:#f8f9fa; padding:1rem; border-radius:0.5rem; border-left:4px solid #007bff;">';
    html += '<div style="font-size:0.9rem; color:#666;">成品</div>';
    html += '<div style="font-size:1.1rem; font-weight:700; color:#007bff;">' + escapeHtml(recipeCost.recipe.resultItem.name) + ' x' + recipeCost.yields + '</div>';
    html += '</div>';
    html += '</div>';

    html += '<h5 style="margin:0 0 0.5rem 0;">所需材料及成本</h5>';
    html += '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:0.75rem;">';

    recipeCost.ingredients.forEach(ing => {
        const iconUrl = getIconUrl(ing.icon);
        html += '<div style="background:white; border:1px solid #e5e7eb; border-radius:0.75rem; padding:0.9rem; box-shadow:0 2px 4px rgba(0,0,0,0.06);">';
        html += '<div style="display:flex; align-items:center; gap:0.75rem;">';
        html += '<img src="' + iconUrl + '" alt="' + escapeHtml(ing.name) + ' icon" style="width:42px; height:42px; border-radius:0.5rem; border:1px solid var(--border-color); object-fit:cover; background:#e9ecef;">';
        html += '<div style="flex:1;">';
        html += '<div style="font-weight:700;">' + escapeHtml(ing.name) + '</div>';
        let ingInfo = '需要 x' + ing.amount;
        if (ing.recipeLevel) {
            ingInfo += ' | RLV: ' + ing.recipeLevel;
        }
        html += '<div style="color:#666; font-size:0.9rem;">' + ingInfo + '</div>';
        html += '</div>';
        html += '</div>';

        html += '<div style="margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid #f0f0f0; font-size:0.95rem; color:#333;">';
        html += '<div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">';
        html += '<span>市場單價</span>';
        html += '<strong style="color:#0066cc;">' + (ing.unitPrice || 0).toLocaleString() + ' G</strong>';
        html += '</div>';
        html += '<div style="display:flex; justify-content:space-between;">';
        html += '<span>購買小計</span>';
        html += '<strong style="color:#e74c3c;">' + (ing.totalCost || 0).toLocaleString() + ' G</strong>';
        html += '</div>';
        if (ing.priceUpdateTime) {
            console.log('Displaying update time for ingredient', ing.name, ':', ing.priceUpdateTime);
            html += '<div style="font-size:0.8rem; color:#999; margin-top:0.25rem; text-align:right;">更新：' + formatUpdateTime(ing.priceUpdateTime) + '</div>';
        } else {
            console.log('No priceUpdateTime for ingredient', ing.name);
        }
        html += '</div>';

        if (ing.subRecipe) {
            const sub = ing.subRecipe;
            const subUnit = roundPrice(sub.costPerUnit || 0);
            const craftTotal = roundPrice(subUnit * ing.amount);
            const saving = roundPrice((ing.totalCost || 0) - craftTotal);
            const subTotal = roundPrice(sub.totalCost || 0);
            const savingColor = saving > 0 ? '#28a745' : '#dc3545';
            const savingLabel = saving > 0 ? '製作省' : (saving < 0 ? '購買省' : '持平');

            html += '<div style="margin-top:0.6rem; padding:0.65rem; background:#f8f9fa; border-radius:0.5rem; border-left:3px solid #28a745;">';
            html += '<div style="font-weight:700; font-size:0.95rem; color:#28a745; margin-bottom:0.35rem;">可製作：' + escapeHtml(sub.recipe.resultItem.name) + ' x' + sub.yields + '</div>';
            html += '<div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:0.25rem;">';
            html += '<span>子配方總成本</span><strong>' + subTotal.toLocaleString() + ' G</strong>';
            html += '</div>';
            html += '<div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:0.25rem;">';
            html += '<span>子配方單個成本</span><strong>' + subUnit.toLocaleString() + ' G</strong>';
            html += '</div>';
            html += '<div style="display:flex; justify-content:space-between; font-size:0.9rem; color:' + savingColor + '; font-weight:700;">';
            html += '<span>' + savingLabel + '</span><span>' + Math.abs(saving).toLocaleString() + ' G</span>';
            html += '</div>';

            if (sub.ingredients && sub.ingredients.length > 0) {
                html += '<div style="margin-top:0.5rem; font-size:0.85rem; color:#555;">子材料：</div>';
                sub.ingredients.forEach(subIng => {
                    const subIcon = getIconUrl(subIng.icon);
                    html += '<div style="display:flex; align-items:center; justify-content:space-between; gap:0.35rem; padding:0.2rem 0;">';
                    html += '<div style="display:flex; align-items:center; gap:0.35rem;">';
                    html += '<img src="' + subIcon + '" style="width:20px; height:20px; border-radius:0.35rem; border:1px solid #e5e7eb; background:#f1f3f5; object-fit:cover;">';
                    html += '<span>' + escapeHtml(subIng.name) + ' x' + subIng.amount + '</span>';
                    html += '</div>';
                    html += '<span style="color:#0066cc; font-weight:600;">' + (subIng.totalCost || 0).toLocaleString() + ' G</span>';
                    html += '</div>';
                });
            }

            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div>';

    $('#craftContent').html(html);
    $('#craftPanel').show();
}

// ==================== UI 輔助函數 ====================
function showGlobalLoading(show) {
    if (show) {
        $('#globalLoading').show();
    } else {
        $('#globalLoading').hide();
    }
    state.isLoading = show;
}

function getIconUrl(iconPath) {
    if (!iconPath) {
        return DEFAULT_ICON;
    }
    if (iconPath.startsWith('http')) {
        return iconPath;
    }
    return config.xivApiUrl + iconPath;
}

function roundPrice(value) {
    const num = Number(value) || 0;
    return Math.round(num);
}

function showMessage(msg, type) {
    type = type || 'info';
    const typeMap = {
        'danger': 'alert-danger',
        'success': 'alert-success',
        'warning': 'alert-warning',
        'info': 'alert-info'
    };

    const $container = $('#messageContainer');
    const alertClass = typeMap[type] || 'alert-info';
    const $alert = $('<div class="alert ' + alertClass + '">' + escapeHtml(msg) + '</div>');

    $container.append($alert);
    setTimeout(function () {
        $alert.fadeOut(function () {
            $alert.remove();
        });
    }, 4000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatUpdateTime(timestamp) {
    if (!timestamp) return '未知';
    
    const date = new Date(timestamp * 1000); // Universalis 使用秒級時間戳
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // 秒數差異
    
    if (diff < 60) {
        return '剛剛';
    } else if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        return minutes + ' 分鐘前';
    } else if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        return hours + ' 小時前';
    } else if (diff < 604800) {
        const days = Math.floor(diff / 86400);
        return days + ' 天前';
    } else {
        // 超過一週顯示完整日期
        return date.toLocaleDateString('zh-TW', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
