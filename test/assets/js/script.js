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
    isWorldsLoaded: false,
}

// ==================== 全局變數 ====================

/**
 * 搜尋結果的完整物品陣列
 * @type {Array<Object>}
 */
let fullSearchResults = [];

/**
 * Dialog 內已選擇的物品（物品ID為key，布林值為value）
 * @type {Object<number, boolean>}
 */
let selectedDialogItems = {};

/**
 * 當前查詢的物品資訊（標準 Item 物件）
 * @type {Object|null}
 */
let currentItem = null;

/**
 * 樹狀圖中已選擇的物品陣列
 * @type {Array<Object>}
 */
let selectedTreeItems = [];

/**
 * 樹狀圖已展開的節點（物品ID為key，布林值為value）
 * @type {Object<number, boolean>}
 */
let expandedTreeNodes = {};

/**
 * 已固定（Pinned）的物品清單
 * @type {Array<Object>}
 */
let pinnedItems = [];

/**
 * 當前的職業過濾器
 * @type {String}
 */
let currentJobFilter = 'ALL';

/**
 * 預設物品圖示路徑
 * @type {string}
 */
const DEFAULT_ICON = 'assets/images/default-item.png';

// 初始化預設 mock 物品（支持單個或多個物品）
function initWithMockItem(mockData) {
    if (!mockData) return;

    // 支援單個物品或陣列
    const items = Array.isArray(mockData) ? mockData : [mockData];

    selectedTreeItems = items.map(mockItem => {
        const itemData = window.MockItems && window.MockItems[mockItem.id];
        const recipeData = window.MockRecipes && window.MockRecipes[mockItem.id];

        return {
            id: mockItem.id,
            name: itemData ? itemData.name : `物品 ${mockItem.id}`,
            icon: itemData ? itemData.icon : DEFAULT_ICON,
            amount: mockItem.amount || 1,
            recipes: recipeData ? [recipeData] : null
        };
    });

    pinnedItems = items.map(mockItem => {
        const itemData = window.MockItems && window.MockItems[mockItem.id];

        return {
            id: mockItem.id,
            name: itemData ? itemData.name : `物品 ${mockItem.id}`,
            icon: itemData ? itemData.icon : DEFAULT_ICON,
            price: null
        };
    });

    updateSelectedTreeItemsList();
    renderCraftingTree();
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

        // 渲染數據中心下拉選單
        renderDatacenterOptions();
    } else {
        console.warn('名稱匹配失敗，保留備用列表');
        state.serversByDC = fallbackServers;
    }
}

// 將數據中心列表渲染到下拉選單
function renderDatacenterOptions() {
    const $dcSelect = $('#dcSelect');
    if (!$dcSelect.length) return;

    const options = ['<option value="">-- 選擇數據中心 --</option>'];
    const dcs = Object.keys(state.serversByDC || {}).sort((a, b) => a.localeCompare(b));
    dcs.forEach(dc => {
        options.push(`<option value="${escapeHtml(dc)}">${escapeHtml(dc)}</option>`);
    });

    $dcSelect.html(options.join(''));

    // 如果之前已有選擇，保持選中
    if (state.selectedDatacenter && dcs.includes(state.selectedDatacenter)) {
        $dcSelect.val(state.selectedDatacenter);
        loadServersByDatacenter(state.selectedDatacenter);
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

// 確認伺服器選擇
async function getItemPrice(itemId) {
    if (!state.selectedServer) {
        console.log('No server selected, skipping price lookup');
        return Promise.resolve();
    }

    console.log('Getting price for item', itemId, 'on server', state.selectedServer);

    try {
        const response = await APIManager.getItemPrice(state.selectedServer, itemId);
        console.log('Universalis price response:', response);
        console.log('lastUploadTime:', response?.lastUploadTime);

        if (response && (response.averagePriceNQ || response.averagePriceHQ || response.minPriceNQ || response.minPriceHQ)) {
            const price = {
                nqMin: response.minPriceNQ || 0,
                nqAvg: Math.round(response.averagePriceNQ) || 0,
                hqMin: response.minPriceHQ || 0,
                hqAvg: Math.round(response.averagePriceHQ) || 0,
                lastUploadTime: response.lastUploadTime || null,
                server: state.selectedServer
            };

            if (currentItem && currentItem.id === itemId) {
                currentItem.price = price;
            }

            const priceHtml = '<div class="price-row">' +
                '<div class="price-type">NQ (Normal Quality)</div>' +
                '<div>最低: <strong>' + price.nqMin.toLocaleString() + ' G</strong></div>' +
                '<div>平均: <strong>' + price.nqAvg.toLocaleString() + ' G</strong></div>' +
                '</div>' +
                '<div class="price-row">' +
                '<div class="price-type">HQ (High Quality)</div>' +
                '<div>最低: <strong>' + price.hqMin.toLocaleString() + ' G</strong></div>' +
                '<div>平均: <strong>' + price.hqAvg.toLocaleString() + ' G</strong></div>' +
                '</div>';

            $('#priceContent').html(priceHtml);
            return price;
        }

        console.warn('No price data available');
        $('#priceContent').html('<div class="text-muted">沒有市場價格資料</div>');
        return null;
    } catch (error) {
        console.error('Price lookup failed:', error);
        $('#priceContent').html('<div class="text-danger">價格查詢失敗</div>');
        return null;
    }
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
    $('#searchPanel').hide();
    $('#idSearchPanel').hide();
    $('#dcSelect').val('');
    $('#worldSelect').html('<option value="">-- 先選擇數據中心 --</option>').prop('disabled', true);
    $('#confirmBtn').prop('disabled', true);

    updateServerDisplay();

    // 清除結果面板
    clearSearchResults();
    clearItemInfo();

    openServerSelectModal();
    showMessage('已重置伺服器選擇', 'info');
}

// 切換搜尋面板（Bootstrap Modal）
function toggleSearchPanel() {
    const modalEl = document.getElementById('itemSearchDialog');
    if (!modalEl || !window.bootstrap) {
        console.warn('Bootstrap Modal 尚未載入');
        return;
    }

    modalEl.addEventListener('shown.bs.modal', () => {
        setTimeout(() => {
            $('#searchQuery').trigger('focus');
        }, 30);
    });

    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
    setTimeout(() => {
        $('#searchQuery').trigger('focus');
    }, 10);

    // 顯示已選擇的固定物品
    updateSelectedItemsList();
}

// 關閉搜尋面板
function closeSearchPanel() {
    const modalEl = document.getElementById('itemSearchDialog');
    if (modalEl && window.bootstrap) {
        const instance = bootstrap.Modal.getInstance(modalEl);
        if (instance) instance.hide();
    }
}

function searchItemByName() {
    const query = $('#searchQuery').val().trim();

    if (!query) {
        showMessage('請輸入物品名稱', 'warning');
        return;
    }

    showGlobalLoading(true);
    const language = state.selectedLanguage || 'tc';

    // 創建超時 Promise，15 秒後自動拒絕
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('搜尋超時')), 15000);
    });

    const searchPromise = APIManager.searchItems(query, language);
    Promise.race([searchPromise, timeoutPromise])
        .then(items => {
            fullSearchResults = items || [];

            if (fullSearchResults.length === 0) {
                showMessage('未找到符合的物品', 'warning');
                return [];
            }

            displaySearchResults();
        })
        .catch(err => {
            console.error('Search error:', err);
            showMessage('搜尋失敗：' + err.message, 'danger');
        })
        .finally(() => {
            showGlobalLoading(false);
        });
}

// 通過物品ID獲取物品信息（支持多語言）
// 返回標準 Item 對象（委派給 API 模組）
function getItemInfoById(itemId, language = 'zh-TW') {
    return APIManager.getItemInfo(itemId, language);
}

function displaySearchResults() {
    currentJobFilter = 'ALL';

    // 只在搜尋 Dialog 中顯示結果
    renderDialogJobFilter(fullSearchResults);
    renderDialogResultsList(getFilteredResults());

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
        html += '<div class="result-actions">';
        html += '<button class="btn btn-small btn-primary item-result-btn" onclick="queryItemById(' + item.id + ')">查詢</button>';
        html += '<button class="btn btn-small btn-info item-result-btn" onclick="openTreeModal(\'' + item.id + '\', \'' + item.name.replace(/'/g, "\\'") + '\', \'' + (item.icon || DEFAULT_ICON).replace(/'/g, "\\'") + '\')">🌳 加到樹</button>';
        html += '</div>';
        html += '</div>';
    });

    $('#resultsList').html(html);
}

// Dialog 搜尋結果顯示函式
function renderDialogResultsList(items) {
    let html = '';
    items.forEach(function (item) {
        let categoryHtml = item.category ? '<span class="result-category">' + escapeHtml(item.category) + '</span>' : '';
        let levelHtml = item.level ? '<span class="result-tag result-tag-ghost">LV ' + item.level + '</span>' : '';
        let recipeLevelHtml = item.recipeLevel ? '<span class="result-tag result-tag-ghost">RLV ' + item.recipeLevel + '</span>' : '';
        let isChecked = selectedDialogItems[item.id] ? 'checked' : '';
        let selectedClass = selectedDialogItems[item.id] ? 'selected' : '';

        html += '<div class="result-item result-card ' + selectedClass + '" data-item-id="' + item.id + '" onclick="toggleDialogItemSelection(' + item.id + ', this)" style="cursor: pointer;">';
        html += '<input type="checkbox" class="result-checkbox" ' + isChecked + ' onclick="event.stopPropagation();">';
        html += '<div class="result-details">';
        html += '<div class="result-name-row">';
        html += '<div class="result-name">' + escapeHtml(item.name) + '</div>';
        html += '</div>';
        html += '<div class="result-meta">';
        html += '<span class="result-id-badge">ID: ' + item.id + '</span>';
        html += categoryHtml;
        html += levelHtml;
        html += recipeLevelHtml;
        html += '</div>';
        html += '</div>';
        html += '<div class="result-trailing">';
        html += '</div>';
        html += '</div>';
    });

    $('#dialogResultsList').html(html);
    updateDialogSelectedCount();
}

// 切換Dialog中物品的選擇
function toggleDialogItemSelection(itemId, element) {
    if (selectedDialogItems[itemId]) {
        delete selectedDialogItems[itemId];
    } else {
        selectedDialogItems[itemId] = fullSearchResults[fullSearchResults.findIndex(i => i.id === itemId)];
    }

    if (selectedDialogItems[itemId]) {
        $(element).addClass('selected').find('.result-checkbox').prop('checked', true);
    } else {
        $(element).removeClass('selected').find('.result-checkbox').prop('checked', false);
    }

    updateDialogSelectedCount();
}

// 更新Dialog選擇數量
function updateDialogSelectedCount() {
    const count = Object.values(selectedDialogItems).filter(v => v).length;
    $('#dialogSelectedCount').text(count);
    updateSelectedItemsList();
}

// 更新已選擇物品清單
function updateSelectedItemsList() {
    const $list = $('#selectedItemsList');

    let html = '';

    // 固定物品區塊
    if (pinnedItems.length > 0) {
        html += '<div class="d-flex align-items-center justify-content-between text-muted small mb-1">'
            + '<span>已固定物品</span>'
            + `<span class="badge bg-secondary">${pinnedItems.length}</span>`
            + '</div>';
        html += '<div class="list-group mb-2">';
        pinnedItems.forEach(p => {
            html += `
                <div class="list-group-item d-flex align-items-center py-2 px-2">
                    <div class="flex-fill">
                        <div class="fw-semibold">${escapeHtml(p.name)}</div>
                        <div class="text-muted small">ID: ${p.id}</div>
                    </div>
                    <button class="btn btn-outline-danger btn-sm" onclick="event.stopPropagation(); removePinnedItem(${p.id});">×</button>
                </div>
            `;
        });
        html += '</div>';
    }

    // 本次選擇的物品
    const selectedEntries = Object.entries(selectedDialogItems).filter(([_, item]) => item);
    if (selectedEntries.length > 0) {
        html += '<div class="text-muted small mt-2 mb-1">此次選擇</div>';
        html += '<div class="list-group mb-2">';
        selectedEntries.forEach(([id, item]) => {
            html += `
                <div class="list-group-item d-flex align-items-center py-2 px-2">
                    <div class="flex-fill">
                        <div class="fw-semibold">${escapeHtml(item.name)}</div>
                        <div class="text-muted small">ID: ${item.id}</div>
                    </div>
                    <button class="btn btn-outline-secondary btn-sm" onclick="event.stopPropagation(); removeFromDialogSelection(${id})">×</button>
                </div>
            `;
        });
        html += '</div>';
    }

    if (html === '') {
        $list.html('').addClass('empty');
    } else {
        $list.html(html).removeClass('empty');
    }
}

// 從Dialog選擇中移除物品
function removeFromDialogSelection(itemId) {
    selectedDialogItems[itemId] = false;
    updateDialogSelectedCount();

    // 更新結果列表中的複選框
    const $item = $(`[data-item-id="${itemId}"]`);
    if ($item.length) {
        $item.removeClass('selected').find('.result-checkbox').prop('checked', false);
    }
}

// 確認將選中的物品加到樹
async function confirmDialogTreeItems() {
    $('#dialogResultsList .result-item').removeClass('selected').find('.result-checkbox').prop('checked', false);

    const selectedIds = Object.entries(selectedDialogItems)
        .filter(([_, selected]) => selected)
        .map(([id, _]) => parseInt(id));

    if (selectedIds.length === 0) {
        showMessage('請至少選擇一個物品', 'warning');
        return;
    }

    const selectedItems = fullSearchResults.filter(item => selectedIds.includes(item.id));
    let warnMissingIcon = false;

    const enrichedItems = await Promise.all(selectedItems.map(async item => {
        try {
            const detail = await XIVAPI.getItemInfo(item.id);
            const iconPath = detail?.IconHD || detail?.Icon || item.icon;
            const icon = XIVAPI.getIconUrl(iconPath) || item.icon || DEFAULT_ICON;
            return { ...item, icon };
        } catch (err) {
            console.error('XIVAPI 取得物品圖示失敗:', item.id, err);
            warnMissingIcon = true;
            return { ...item, icon: item.icon || DEFAULT_ICON };
        }
    }));

    enrichedItems.forEach(item => {
        addItemToTree(item.id, item.name, item.icon);
    });

    if (warnMissingIcon) {
        showMessage('部分物品無法從 XIVAPI 取得圖示，已使用預設圖示', 'warning');
    }

    showMessage(`已添加 ${enrichedItems.length} 個物品到樹狀圖`, 'success');
    selectedDialogItems = {};
    switchTab('crafting-tree');
    closeSearchPanel();
}

// Dialog 職業篩選
function renderDialogJobFilter(items) {
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

    const $container = $('#dialogJobFilter');
    const $buttons = $('#dialogJobFilterButtons');

    if (categoryMap.size === 0) {
        $container.css('display', 'none');
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
    $container.css('display', 'block');

    $('#dialogJobFilterButtons .filter-btn').off('click').on('click', function () {
        const selected = $(this).data('job');
        currentJobFilter = selected;

        $('#dialogJobFilterButtons .filter-btn').removeClass('filter-btn-active');
        $(this).addClass('filter-btn-active');

        renderDialogResultsList(getFilteredResults());
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

    // 使用 XIVAPI 模組獲取物品信息
    XIVAPI.getItemInfo(itemId).then(function (response) {
        console.log('XIVAPI item response:', response);

        if (!response.ID) {
            showMessage('找不到物品 ID: ' + itemId, 'danger');
            showGlobalLoading(false);
            return;
        }

        // 如果是繁中，獲取中文名稱
        const currentLanguage = state.selectedLanguage || 'tc';
        if (currentLanguage === 'tc') {
            getItemInfoById(response.ID, 'zh-TW').then(function (chineseInfo) {
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
                        .then(() => autoCalculateCraftingCost())
                        .catch(() => autoCalculateCraftingCost());
                }
                showGlobalLoading(false);

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
                    .then(() => autoCalculateCraftingCost())
                    .catch(() => autoCalculateCraftingCost());
            }
            showGlobalLoading(false);

            // 顯示製造成本計算面板
            $('#craftingCostPanel').show();
        }
    }).catch(function (error) {
        console.log('XIVAPI item error:', error);
        showMessage('查詢失敗。物品 ID 可能不存在。', 'danger');
        showGlobalLoading(false);
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

function clearItemInfo() {
    $('#itemInfoPanel').hide();
    $('#pricePanel').hide();
    $('#craftPanel').hide();
    $('#craftContent').html('');
    $('#craftingCostPanel').hide();
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

    // 先從 XIVAPI 模組獲取合成信息
    XIVAPI.getItemInfo(currentItemId).then(function (itemResponse) {
        console.log('Item response:', itemResponse);

        if (!itemResponse.Recipes || itemResponse.Recipes.length === 0) {
            showMessage('找不到該物品的合成', 'warning');
            showGlobalLoading(false);
            return;
        }

        const recipeId = itemResponse.Recipes[0].ID;
        console.log('Found recipe ID:', recipeId);

        // 使用 XIVAPI 模組獲取合成詳細信息
        XIVAPI.getRecipeDetails(recipeId).then(function (recipeResponse) {
            console.log('Recipe details:', recipeResponse);
            calculateAndDisplayCost(recipeResponse, quantity);
            showGlobalLoading(false);
        }).catch(function (error) {
            console.log('Recipe details error:', error);
            showMessage('獲取合成詳情失敗', 'danger');
            showGlobalLoading(false);
        });
    }).catch(function (error) {
        console.log('Item lookup error:', error);
        showGlobalLoading(false);
        showMessage('查詢物品失敗：' + error, 'danger');
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
        const itemIds = ingredients.map(i => i.id);
        APIManager.getItemPrice(state.selectedServer, itemIds).then(function (priceResponse) {
            console.log('Price response:', priceResponse);

            // 更新材料價格
            if (priceResponse.results) {
                priceResponse.results.forEach(function (result) {
                    const itemId = result.itemId || result.itemId;
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
            showMessage('合成成本計算完成', 'success');
        }).catch(function (error) {
            console.log('Price lookup error:', error);
            showMessage('無法獲取材料價格，請稍後重試', 'warning');

            // 仍然顯示材料列表，但價格為 0
            const costPerUnit = 0;
            displayCraftingCost({
                ingredients: ingredients,
                totalCost: 0,
                costPerUnit: costPerUnit
            });
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

    showMessage('製作成本計算完成', 'success');
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
        const itemResponse = await XIVAPI.getItemInfo(itemId);

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
                // 使用 Universalis API 模組
                APIManager.getItemPrice(state.selectedServer, itemId).then(function (priceResponse) {
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
                }).catch(function (err) {
                    console.warn('❌ loadRecipeDetailsForItem 查詢市場價格失敗:', err);

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
        showGlobalLoading(false);

        console.warn('loadRecipeDetailsForItem error', error);
        showMessage('載入配方詳情失敗', 'warning');
    } finally {
        showGlobalLoading(false);
    }
}

async function fetchRecipeDetail(recipeId) {
    return APIManager.getRecipeInfo(recipeId);
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

async function fetchItemUnitPrices(itemIds) {
    if (!itemIds || !itemIds.length || !state.selectedServer) {
        return null;
    }

    try {
        const response = await APIManager.getItemPrice(state.selectedServer, itemIds);
        const results = response?.results || [];
        console.log('Unit prices response:', response);
        console.log('Results count:', results.length);

        // 處理每個物品的價格數據
        results.forEach(item => {
            console.log('Item', item.itemId || item.itemId, 'lastUploadTime:', item.lastUploadTime);

            // 從 listings 中提取最低單價
            if (item.listings && item.listings.length > 0) {
                item.minPricePerUnit = item.listings[0].pricePerUnit;
            } else {
                item.minPricePerUnit = 0;
            }
        });

        return results;
    } catch (err) {
        console.warn('Unit price fetch failed', err);
        return null;
    }
}

async function buildRecipeCost(recipeDetail, hasServer) {
    const ingredients = await collectIngredients(recipeDetail);
    const itemIds = ingredients.map(i => i.id);
    let priceMap = {};

    if (hasServer) {
        const aggResults = await fetchItemUnitPrices(itemIds);
        if (aggResults) {
            aggResults.forEach(res => {
                const id = res.getAggregatedPrices
                const unit = res.minPricePerUnit || 0;

                priceMap[id] = {
                    price: roundPrice(unit),
                    lastUploadTime: res.lastUploadTime
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
        const itemResponse = await XIVAPI.getItemInfo(itemId);
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
    return XIVAPI.getIconUrl(iconPath);
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
// ==================== 頁籤系統 ====================
function switchTab(tabName) {
    // 隱藏所有頁籤內容
    $('[data-tab-content]').hide();

    // 移除所有按鈕的 active 類
    $('.tab-button').removeClass('active');

    // 顯示選中的頁籤
    $('#' + (tabName === 'market-query' ? 'marketQueryTab' : 'craftingTreeTab')).show();

    // 將按鈕設置為 active
    $('.tab-button[data-tab="' + tabName + '"]').addClass('active');
}

// 顯示詳細價格模態
function showDetailedPriceModal(itemId) {
    const item = window.MockItems && window.MockItems[itemId];
    const recipe = window.MockRecipes && window.MockRecipes[itemId];

    if (!item) {
        showMessage('物品資訊未找到', 'danger');
        return;
    }

    let modalBody = '';

    // 標題和基本信息
    modalBody += `
        <div class="mb-4">
            <div class="d-flex align-items-start gap-3 mb-3">
                <img src="${getIconUrl(item.icon)}" alt="${escapeHtml(item.name)}" style="width:80px; height:80px; border-radius:0.5rem;">
                <div class="flex-fill">
                    <h4 class="mb-2">${escapeHtml(item.name)}</h4>
                    <div class="badge bg-secondary me-2">分類: ${item.category}</div>
                    <div class="badge bg-info">等級: ${item.level}</div>
                </div>
            </div>
        </div>
    `;

    // 配方信息（如果存在）
    if (recipe) {
        modalBody += `
            <div class="card mb-3">
                <div class="card-header bg-primary text-white">
                    <strong>⚙️ 合成表</strong>
                </div>
                <div class="card-body">
                    <div class="row mb-2">
                        <div class="col-6"><strong>職業:</strong> ${recipe.classJob}</div>
                        <div class="col-6"><strong>等級:</strong> ${recipe.level}</div>
                    </div>
                    <div class="row mb-2">
                        <div class="col-6"><strong>難度:</strong> ${recipe.difficulty || '—'}</div>
                        <div class="col-6"><strong>耐久:</strong> ${recipe.durability || '—'}</div>
                    </div>
                    <div class="row">
                        <div class="col-6"><strong>產出:</strong> ×${recipe.yields}</div>
                    </div>
                </div>
            </div>
        `;

        // 所需材料
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            modalBody += `
                <div class="card mb-3">
                    <div class="card-header bg-info text-white">
                        <strong>📦 所需材料</strong>
                    </div>
                    <div class="card-body">
            `;

            let totalMaterialCost = 0;
            recipe.ingredients.forEach(ingredient => {
                const ingredientItem = window.MockItems && window.MockItems[ingredient.id];
                const ingredientName = ingredientItem ? ingredientItem.name : `物品 ${ingredient.id}`;
                const ingredientIcon = ingredientItem ? ingredientItem.icon : DEFAULT_ICON;
                const ingredientPrice = ingredientItem && ingredientItem.price && ingredientItem.price.nqMin ? ingredientItem.price.nqMin : null;
                const ingredientAmount = ingredient.amount || 1;
                const subtotal = ingredientPrice ? ingredientPrice * ingredientAmount : null;

                if (subtotal !== null) {
                    totalMaterialCost += subtotal;
                }

                modalBody += `
                    <div class="d-flex align-items-center gap-2 mb-3 pb-3 border-bottom">
                        <img src="${getIconUrl(ingredientIcon)}" alt="${escapeHtml(ingredientName)}" style="width:40px; height:40px; border-radius:0.3rem;">
                        <div class="flex-fill">
                            <div class="fw-semibold">${escapeHtml(ingredientName)}</div>
                            <div class="text-muted small">需要 ×${ingredientAmount}</div>
                        </div>
                        <div class="text-end">
                            <div class="fw-semibold">${ingredientPrice ? ingredientPrice.toLocaleString() + ' G' : '—'}</div>
                            <div class="text-muted small">小計: ${subtotal ? subtotal.toLocaleString() + ' G' : '—'}</div>
                        </div>
                    </div>
                `;
            });

            modalBody += `
                    </div>
                </div>
            `;

            // 成本總結
            const unitCost = recipe.yields > 0 ? Math.ceil(totalMaterialCost / recipe.yields) : totalMaterialCost;
            modalBody += `
                <div class="card mb-3 bg-light">
                    <div class="card-body">
                        <div class="row mb-2">
                            <div class="col-6">
                                <strong>製作總成本</strong><br>
                                <span class="fs-5 text-success">${totalMaterialCost.toLocaleString()} G</span>
                            </div>
                            <div class="col-6">
                                <strong>單個成本</strong><br>
                                <span class="fs-5 text-success">${unitCost.toLocaleString()} G</span>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-12">
                                <strong>成品</strong><br>
                                ${escapeHtml(item.name)} ×${recipe.yields}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // 市場價格信息
    if (item.price) {
        modalBody += `
            <div class="card">
                <div class="card-header bg-warning text-dark">
                    <strong>💰 市場價格</strong>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-6">
                            <strong>NQ 最低價:</strong><br>
                            <span class="fs-5">${item.price.nqMin ? item.price.nqMin.toLocaleString() + ' G' : '—'}</span>
                        </div>
                        <div class="col-6">
                            <strong>HQ 最低價:</strong><br>
                            <span class="fs-5">${item.price.hqMin ? item.price.hqMin.toLocaleString() + ' G' : '—'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 填充模態內容
    $('#detailedPriceModalBody').html(modalBody);

    // 顯示模態
    const modal = new bootstrap.Modal(document.getElementById('detailedPriceModal'));
    modal.show();
}

// 添加物品到樹狀圖
function addItemToTree(itemId, itemName, itemIcon) {
    // 檢查是否已經添加
    if (selectedTreeItems.some(item => item.id === itemId)) {
        showMessage('此物品已添加', 'info');
        return;
    }

    const pinned = pinnedItems.find(i => i.id === itemId);
    if (!pinned) {
        pinnedItems.push({
            id: itemId,
            name: itemName,
            icon: itemIcon,
            price: null
        });
    }

    const newItem = {
        id: itemId,
        name: itemName,
        icon: itemIcon,
        recipes: null  // 配方會在展開時加載
    };

    selectedTreeItems.push(newItem);
    updateSelectedTreeItemsList();
    renderCraftingTree();
    showMessage(`已添加 ${itemName} 到樹狀圖`, 'success');
}

// 更新已選擇物品列表顯示
function updateSelectedTreeItemsList() {
    const $list = $('#selectedTreeItemsList');

    if (selectedTreeItems.length === 0) {
        $list.html('<p class="placeholder-text">未選擇任何物品</p>');
        updateMarketSelectedPanel();
        return;
    }

    let html = '<div class="selected-items">';
    selectedTreeItems.forEach((item, index) => {
        html += `
            <div class="selected-item">
                <img src="${item.icon}" alt="${item.name}" class="selected-item-icon">
                <div class="selected-item-body">
                    <span class="selected-item-name">${item.name}</span>
                    <div class="d-flex align-items-center gap-2 mt-1">
                        <label class="text-muted small mb-0">數量</label>
                        <input type="number" class="form-control form-control-sm" style="width:80px;" value="${item.amount || 1}" min="1" onchange="updateTreeItemAmount(${item.id}, this.value)">
                    </div>
                </div>
                <button class="btn-close" onclick="removeItemFromTree(${index})" title="移除">×</button>
            </div>
        `;
    });
    html += '</div>';

    $list.html(html);

    // 同步左側摘要面板
    updateMarketSelectedPanel();
    refreshMarketSelectedPrices();
}

// 將已選擇物品顯示在市場頁左側面板（名稱 + 最低 NQ/HQ）
function updateMarketSelectedPanel() {
    const $list = $('#marketSelectedItemsList');
    const $count = $('#marketSelectedCount');

    $count.text(`${pinnedItems.length} 件`);

    if (pinnedItems.length === 0) {
        $list.html('<p class="text-muted mb-0">尚未選擇物品</p>');
        return;
    }

    let html = '';
    pinnedItems.forEach(item => {
        const price = item.marketPrice || {};
        const nqText = formatPriceValue(price.nqMin);
        const hqText = formatPriceValue(price.hqMin);
        const iconUrl = getIconUrl(item.icon || DEFAULT_ICON);

        html += `
            <div class="d-flex align-items-center gap-2 p-2 mb-2 border rounded bg-white shadow-sm">
                <img src="${iconUrl}" alt="${escapeHtml(item.name)}" style="width:40px; height:40px; border-radius:0.5rem; object-fit:cover; border:1px solid var(--border-color); background:#f8f9fa;">
                <div class="flex-fill">
                    <div class="fw-semibold">${escapeHtml(item.name)}</div>
                    <div class="text-muted small">ID: ${item.id}</div>
                    <div class="d-flex gap-2 mt-1 flex-wrap">
                        <span class="badge bg-secondary">NQ: ${nqText}</span>
                        <span class="badge bg-warning text-dark">HQ: ${hqText}
                        </span>
                    </div>
                </div>
                <div class="d-flex gap-1">
                    <button class="btn btn-outline-primary btn-sm" title="詳細價格" onclick="showDetailedPriceModal(${item.id})">💰</button>
                    <button class="btn btn-outline-danger btn-sm" title="移除固定" onclick="removePinnedItem(${item.id})">×</button>
                </div>
            </div>
        `;
    });

    $list.html(html);
}

// 取最小價並暫存，供摘要面板展示
function refreshMarketSelectedPrices() {
    if (!state.selectedServer || pinnedItems.length === 0) {
        return;
    }

    const fetches = pinnedItems.map(item => {
        // 若已有且伺服器一致，跳過
        if (item.marketPrice && item.marketPrice.server === state.selectedServer) {
            return Promise.resolve();
        }

        return APIManager.getItemPrice(state.selectedServer, item.id)
            .then(response => {
                const nqMin = deriveMinPrice(response, false);
                const hqMin = deriveMinPrice(response, true);
                item.marketPrice = {
                    server: state.selectedServer,
                    nqMin: nqMin,
                    hqMin: hqMin
                };
            })
            .catch(() => {
                item.marketPrice = {
                    server: state.selectedServer,
                    nqMin: null,
                    hqMin: null
                };
            });
    });

    Promise.allSettled(fetches).then(() => {
        updateMarketSelectedPanel();
    });
}

// 解析 Universalis 回傳中的最低價
function deriveMinPrice(response, isHQ) {
    if (!response) return null;

    // 優先使用 API 提供的欄位
    const fieldValue = isHQ ? response.minPriceHQ : response.minPriceNQ;
    if (fieldValue !== undefined && fieldValue !== null) {
        return fieldValue;
    }

    // 備用：從 listing 搜索對應 HQ/NQ
    if (Array.isArray(response.listings)) {
        const listing = response.listings.find(l => Boolean(l.hq) === Boolean(isHQ));
        if (listing && typeof listing.pricePerUnit === 'number') {
            return listing.pricePerUnit;
        }
    }

    return null;
}

// 價格格式化
function formatPriceValue(value) {
    if (value === null || value === undefined) {
        return '—';
    }
    return value.toLocaleString() + ' G';
}

// 移除物品
function removeItemFromTree(index) {
    const item = selectedTreeItems[index];
    selectedTreeItems.splice(index, 1);

    // 同步移除固定清單
    pinnedItems = pinnedItems.filter(p => p.id !== item.id);
    updateSelectedTreeItemsList();
    renderCraftingTree();
    showMessage(`已移除 ${item.name}`, 'success');
}

// 移除固定物品（同時會從樹狀圖移除）
function removePinnedItem(itemId) {
    const target = pinnedItems.find(p => p.id === itemId);
    if (!target) {
        showMessage('找不到固定物品', 'warning');
        return;
    }

    pinnedItems = pinnedItems.filter(p => p.id !== itemId);
    selectedTreeItems = selectedTreeItems.filter(item => item.id !== itemId);
    selectedDialogItems[itemId] = false;

    updateSelectedTreeItemsList();
    renderCraftingTree();
    updateSelectedItemsList();
    updateMarketSelectedPanel();

    showMessage(`已移除 ${target.name} 的固定`, 'info');
}

// 清空所有物品
function clearSelectedTreeItems() {
    if (selectedTreeItems.length === 0) {
        showMessage('列表已是空的', 'info');
        return;
    }

    if (confirm('確定要清空所有物品嗎？')) {
        selectedTreeItems = [];
        pinnedItems = [];
        expandedTreeNodes = {};
        updateSelectedTreeItemsList();
        renderCraftingTree();
        showMessage('已清空所有物品', 'success');
    }
}

// 渲染製作樹狀圖
function renderCraftingTree() {
    const $container = $('#craftingTreeContainer');

    if (selectedTreeItems.length === 0) {
        $container.html('<p class="placeholder-text">選擇物品以查看其材料樹狀圖</p>');
        return;
    }

    // 彙總子材料用於「材料清單」頁籤
    const aggregated = {};

    const renderRecipePanel = (item) => {
        const amount = item.amount || 1;
        let materialsHtml = '';
        let classJob = '—';
        let itemLevel = '—';
        let craftTimes = '—';
        let totalYield = '—';

        if (item.recipes && item.recipes.length > 0) {
            const recipe = item.recipes[0];
            const yields = recipe.yields || 1;
            craftTimes = Math.ceil(amount / yields);  // 製作次數
            totalYield = craftTimes * yields;  // 總產出 = 製作次數 × 產量
            classJob = recipe.classJob || '—';
            itemLevel = recipe.level || '—';

            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach(ingredient => {
                    const calculatedAmount = (ingredient.amount || 1) * craftTimes;  // 材料需求 = 單次材料 × 製作次數

                    // 從 MockItems 中查找材料的完整信息
                    const itemData = window.MockItems && window.MockItems[ingredient.id];
                    const ingredientName = itemData ? itemData.name : ingredient.name || '未知材料';
                    const ingredientIcon = itemData ? itemData.icon : (ingredient.icon || DEFAULT_ICON);
                    const price = itemData && itemData.price && itemData.price.nqMin ? itemData.price.nqMin : (ingredient.price || null);
                    const priceStr = price !== null && price !== undefined ? price.toLocaleString() + ' G' : '—';

                    // 累計到彙總表
                    const key = ingredient.id;
                    if (!aggregated[key]) {
                        aggregated[key] = {
                            id: ingredient.id,
                            name: ingredientName,
                            icon: ingredientIcon,
                            amount: 0,
                            price: price
                        };
                    }
                    aggregated[key].amount += calculatedAmount;

                    materialsHtml += `
                        <div class="recipe-material-item">
                            <img src="${ingredientIcon}" alt="${escapeHtml(ingredientName)}" class="material-icon">
                            <span class="material-name">${escapeHtml(ingredientName)}</span>
                            <span class="material-amount">×${calculatedAmount}</span>
                        </div>
                    `;
                });
            } else {
                materialsHtml = '<span class="text-muted">無材料</span>';
            }
        } else {
            materialsHtml = '<span class="text-muted">待加載</span>';
        }

        // 計算總價（如果有價格資料）
        let totalPrice = '—';
        if (item.recipes && item.recipes.length > 0) {
            const recipe = item.recipes[0];
            const yields = recipe.yields || 1;
            const craftTimes = Math.ceil(amount / yields);  // 計算製作次數
            let sum = 0;
            let hasPrice = false;

            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach(ingredient => {
                    const itemData = window.MockItems && window.MockItems[ingredient.id];
                    const price = itemData && itemData.price && itemData.price.nqMin ? itemData.price.nqMin : null;
                    if (price !== null && price !== undefined) {
                        const calculatedAmount = (ingredient.amount || 1) * craftTimes;  // 材料需求 = 單次材料 × 製作次數
                        sum += price * calculatedAmount;
                        hasPrice = true;
                    }
                });
            }

            if (hasPrice) {
                totalPrice = sum.toLocaleString() + ' G';
            }
        }

        return `
            <tr class="recipe-table-row">
                <td class="recipe-cell recipe-item-name">
                    <img src="${item.icon || DEFAULT_ICON}" alt="${escapeHtml(item.name)}" class="item-icon">
                    <span>${escapeHtml(item.name)}</span>
                </td>
                <td class="recipe-cell recipe-craft-times">${craftTimes}</td>
                <td class="recipe-cell recipe-yield">${totalYield}</td>
                <td class="recipe-cell recipe-class">${classJob}</td>
                <td class="recipe-cell recipe-level">${itemLevel}</td>
                <td class="recipe-cell recipe-materials">${materialsHtml}</td>
                <td class="recipe-cell recipe-price">${totalPrice}</td>
            </tr>
        `;
    };

    // 配方顯示頁籤內容（表格格式）
    let recipeTabHtml = `
        <table class="recipe-table">
            <thead>
                <tr>
                    <th>物品名稱</th>
                    <th>製作次數</th>
                    <th>總產出</th>
                    <th>職業</th>
                    <th>等級</th>
                    <th>材料（配方）</th>
                    <th>價格</th>
                </tr>
            </thead>
            <tbody>
    `;
    selectedTreeItems.forEach(item => {
        recipeTabHtml += renderRecipePanel(item);
    });
    recipeTabHtml += `
            </tbody>
        </table>
    `;

    // 材料清單彙整頁籤內容（表格格式）
    let summaryTabHtml = '';
    const aggregatedList = Object.values(aggregated);
    if (aggregatedList.length === 0) {
        summaryTabHtml = '<p class="text-muted">尚無材料資料</p>';
    } else {
        summaryTabHtml += `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>材料名稱</th>
                        <th>總需求數量</th>
                        <th>單價</th>
                        <th>總價</th>
                    </tr>
                </thead>
                <tbody>
        `;
        aggregatedList.forEach(ing => {
            const unitPrice = ing.price !== undefined && ing.price !== null ? ing.price.toLocaleString() + ' G' : '—';
            const totalPrice = ing.price !== undefined && ing.price !== null ? (ing.price * ing.amount).toLocaleString() + ' G' : '—';

            summaryTabHtml += `
                <tr>
                    <td class="summary-name">
                        <img src="${ing.icon}" alt="${escapeHtml(ing.name)}" class="summary-icon">
                        <span>${escapeHtml(ing.name)}</span>
                    </td>
                    <td class="summary-qty">×${ing.amount}</td>
                    <td class="summary-unit-price">${unitPrice}</td>
                    <td class="summary-total-price">${totalPrice}</td>
                </tr>
            `;
        });
        summaryTabHtml += `
                </tbody>
            </table>
        `;
    }

    // 最終端材料頁籤內容（遞迴展開所有材料）
    let finalTabHtml = '';
    const finalMaterials = {};

    // 彙總所有中間材料的需求（層級展開）
    let currentLevel = {};

    // 第一輪：收集所有選中物品作為起點
    selectedTreeItems.forEach(item => {
        const itemId = item.id;
        if (!currentLevel[itemId]) {
            currentLevel[itemId] = 0;
        }
        currentLevel[itemId] += (item.amount || 1);
    });

    // 遞迴展開每一層，直到全部變成最終材料
    while (Object.keys(currentLevel).length > 0) {
        const nextLevel = {};
        const itemsToMerge = {};  // 需要彙總的物品（既在當前層又會在下一層出現）

        // 第一遍：先掃描哪些物品會產生自己作為材料
        Object.keys(currentLevel).forEach(itemId => {
            const recipe = window.MockRecipes && window.MockRecipes[parseInt(itemId)];
            if (recipe && recipe.ingredients) {
                recipe.ingredients.forEach(ingredient => {
                    // 如果材料的 ID 在當前層中，標記需要彙總
                    if (currentLevel[ingredient.id]) {
                        itemsToMerge[ingredient.id] = true;
                    }
                });
            }
        });

        // 第二遍：展開所有物品
        Object.keys(currentLevel).forEach(itemId => {
            const totalAmount = currentLevel[itemId];
            const recipe = window.MockRecipes && window.MockRecipes[parseInt(itemId)];

            if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
                // 沒有配方 = 最終材料
                const itemData = window.MockItems && window.MockItems[parseInt(itemId)];
                if (itemData) {
                    if (!finalMaterials[itemId]) {
                        finalMaterials[itemId] = {
                            id: parseInt(itemId),
                            name: itemData.name,
                            icon: itemData.icon,
                            amount: 0,
                            price: itemData.price && itemData.price.nqMin ? itemData.price.nqMin : null
                        };
                    }
                    finalMaterials[itemId].amount += totalAmount;
                }
            } else if (itemsToMerge[itemId]) {
                // 這個物品需要彙總（它的材料中包含它自己）
                // 先不展開，移到下一層繼續累計
                if (!nextLevel[itemId]) {
                    nextLevel[itemId] = 0;
                }
                nextLevel[itemId] += totalAmount;
            } else {
                // 正常展開
                const yields = recipe.yields || 1;
                const craftTimes = Math.ceil(totalAmount / yields);

                recipe.ingredients.forEach(ingredient => {
                    const neededAmount = (ingredient.amount || 1) * craftTimes;
                    if (!nextLevel[ingredient.id]) {
                        nextLevel[ingredient.id] = 0;
                    }
                    nextLevel[ingredient.id] += neededAmount;
                });
            }
        });

        currentLevel = nextLevel;
    }

    const finalList = Object.values(finalMaterials);
    if (finalList.length === 0) {
        finalTabHtml = '<p class="text-muted">尚無最終材料資料</p>';
    } else {
        finalTabHtml += `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>最終材料名稱</th>
                        <th>總需求數量</th>
                        <th>單價</th>
                        <th>總價</th>
                    </tr>
                </thead>
                <tbody>
        `;
        finalList.forEach(mat => {
            const unitPrice = mat.price !== null && mat.price !== undefined ? mat.price.toLocaleString() + ' G' : '—';
            const totalPrice = mat.price !== null && mat.price !== undefined ? (mat.price * mat.amount).toLocaleString() + ' G' : '—';

            finalTabHtml += `
                <tr>
                    <td class="summary-name">
                        <img src="${mat.icon}" alt="${escapeHtml(mat.name)}" class="summary-icon">
                        <span>${escapeHtml(mat.name)}</span>
                    </td>
                    <td class="summary-qty">×${mat.amount}</td>
                    <td class="summary-unit-price">${unitPrice}</td>
                    <td class="summary-total-price">${totalPrice}</td>
                </tr>
            `;
        });
        finalTabHtml += `
                </tbody>
            </table>
        `;
    }

    const html = `
        <div class="tree-tab-panel" data-tree-panel="recipe">${recipeTabHtml}</div>
        <div class="tree-tab-panel" data-tree-panel="summary" style="display:none;">${summaryTabHtml}</div>
        <div class="tree-tab-panel" data-tree-panel="final" style="display:none;">${finalTabHtml}</div>
    `;

    $container.html(html);
}

// 內部頁籤切換（樹狀圖）
function switchTreeInnerTab(tab) {
    $('.tree-tab-btn').removeClass('active');
    $(`.tree-tab-btn[data-tree-tab="${tab}"]`).addClass('active');

    $('.tree-tab-panel').hide();
    $(`.tree-tab-panel[data-tree-panel="${tab}"]`).show();
}

// 更新樹項目的數量
function updateTreeItemAmount(itemId, quantity) {
    const item = selectedTreeItems.find(t => t.id === itemId);
    if (item) {
        item.amount = parseInt(quantity) || 1;
        renderCraftingTree();

        // 如果選擇了伺服器，顯示查詢價格按鈕
        if (state.selectedServer) {
            $('#queryPricesBtn').show();
        }
    }
}

// 遞迴渲染樹節點
function renderTreeNode(item, nodeId, level = 0) {
    const hasRecipes = item.recipes && item.recipes.length > 0;

    // 計算實際需要的材料數量（考慮配方產量）
    let ingredientsList = [];
    if (hasRecipes && item.recipes.length > 0) {
        const recipe = item.recipes[0];  // 使用第一個配方
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            const yields = recipe.yields || 1;
            const multiplier = (item.amount || 1) / yields;

            recipe.ingredients.forEach(ing => {
                ingredientsList.push({
                    ...ing,
                    calculatedAmount: Math.ceil((ing.amount || 1) * multiplier)
                });
            });
        }
    }

    // 根節點僅顯示其子材料
    if (level === 0) {
        if (!hasRecipes) {
            return '<div class="tree-node-placeholder">展開以載入子材料...</div>';
        }

        if (ingredientsList.length === 0) {
            return '<div class="tree-node-placeholder">此物品沒有可顯示的子材料</div>';
        }

        let childrenHtml = '<div class="tree-node-children">';
        ingredientsList.forEach((ingredient) => {
            const childNodeId = `tree-node-${ingredient.id}-${level}-${ingredient.id}`;
            childrenHtml += renderTreeNode(ingredient, childNodeId, level + 1);
        });
        childrenHtml += '</div>';
        return childrenHtml;
    }

    const isExpanded = expandedTreeNodes[nodeId];
    const priceText = item.price !== undefined && item.price !== null ? `${item.price.toLocaleString()} GP` : '—';

    let html = `
        <div class="tree-node-header" style="margin-left: ${level * 20}px">
            ${hasRecipes ? `<button class="tree-toggle" onclick="toggleTreeNode('${nodeId}')"> ${isExpanded ? '▼' : '▶'} </button>` : `<span class="tree-toggle-placeholder"></span>`}
            <img src="${item.icon}" alt="${item.name}" class="tree-node-icon">
            <span class="tree-node-name">${escapeHtml(item.name)}</span>
            <span class="tree-node-qty">${item.calculatedAmount || item.amount || 1}</span>
            <span class="tree-node-price">${priceText}</span>
        </div>
    `;

    if (hasRecipes && isExpanded && ingredientsList.length > 0) {
        html += '<div class="tree-node-children">';
        ingredientsList.forEach((ingredient) => {
            const childNodeId = `tree-node-${ingredient.id}-${level}-${ingredient.id}`;
            html += renderTreeNode(ingredient, childNodeId, level + 1);
        });
        html += '</div>';
    }

    return html;
}

// 切換樹節點展開/折疊
async function toggleTreeNode(nodeId) {
    expandedTreeNodes[nodeId] = !expandedTreeNodes[nodeId];

    // 如果是首次展開，需要加載配方
    if (expandedTreeNodes[nodeId]) {
        try {
            await loadItemRecipesRecursive(nodeId);
        } catch (err) {
            console.error('載入樹節點失敗', err);
            showMessage('無法載入材料', 'warning');
            showGlobalLoading(false);
        }
    } else {
        renderCraftingTree();
    }
}

// 遞迴加載物品及其子材料的配方
async function loadItemRecipesRecursive(nodeId) {
    const match = nodeId.match(/tree-node-(\d+)/);
    if (!match) return;

    const itemId = parseInt(match[1]);

    // 找到對應的物品
    let item = null;
    const findItem = (items) => {
        for (let i of items) {
            if (i.id === itemId) return i;
            if (i.recipes) {
                for (let recipe of i.recipes) {
                    if (recipe.ingredients) {
                        const found = findItem(recipe.ingredients);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    };

    item = findItem(selectedTreeItems);
    if (!item) {
        renderCraftingTree();
        return;
    }

    // 已有配方資料直接渲染
    if (item.recipes) {
        renderCraftingTree();
        return;
    }

    // 加載配方
    showGlobalLoading(true);

    try {
        const results = await Promise.allSettled([
        ]);

        let recipes = [];

        if (results[0].status === 'fulfilled' && results[0].value.length > 0) {
            recipes = results[0].value;
            console.log('✅ 使用 tnze API 配方');
        } else if (results[1].status === 'fulfilled' && results[1].value.length > 0) {
            recipes = results[1].value;
            console.log('✅ 使用 tc-search-service 配方');
        }

        if (recipes.length > 0) {
            item.recipes = recipes;
            await loadSubMaterialsRecipes(recipes);
        } else {
            item.recipes = [];
        }

        renderCraftingTree();
    } catch (err) {
        console.error('遞迴加載配方失敗', err);
        item.recipes = [];
        renderCraftingTree();
    } finally {
        showGlobalLoading(false);
    }
}

// 遞迴加載所有子材料的配方
function loadSubMaterialsRecipes(recipes, depth = 0) {
    if (depth > 10) return;  // 限制遞迴深度防止無限迴圈

    const promises = [];

    recipes.forEach(recipe => {
        if (recipe.ingredients) {
            recipe.ingredients.forEach(ingredient => {
                if (!ingredient.recipes) {
                    promises.push(
                        Promise.allSettled([
                        ]).then(results => {
                            let subRecipes = [];
                            if (results[0].status === 'fulfilled' && results[0].value.length > 0) {
                                subRecipes = results[0].value;
                            } else if (results[1].status === 'fulfilled' && results[1].value.length > 0) {
                                subRecipes = results[1].value;
                            }

                            if (subRecipes.length > 0) {
                                ingredient.recipes = subRecipes;
                                loadSubMaterialsRecipes(subRecipes, depth + 1);
                            } else {
                                ingredient.recipes = [];
                            }
                        })
                    );
                }
            });
        }
    });

    return Promise.allSettled(promises);
}

// 加載物品的配方信息（已整合到 loadItemRecipesRecursive）
function loadItemRecipes(nodeId) {
    loadItemRecipesRecursive(nodeId);

    // 找到對應的物品
    let item = null;
    const findItem = (items) => {
        for (let i of items) {
            if (i.id === itemId) return i;
            if (i.recipes) {
                for (let recipe of i.recipes) {
                    if (recipe.ingredients) {
                        const found = findItem(recipe.ingredients);
                        if (found) return found;
                    }
                }
            }
        }
        return null;
    };

    item = findItem(selectedTreeItems);
    if (!item) return;

    // 如果已經有配方數據，直接渲染
    if (item.recipes) {
        renderCraftingTree();
        return;
    }

    // 否則加載配方
    showGlobalLoading(true);

    // 對於繁體中文，同時查詢 tnze 和 tc-search-service
    if (state.selectedLanguage === 'tc') {
        Promise.allSettled([
        ]).then(results => {
            let recipes = [];

            // 優先使用 tnze 結果
            if (results[0].status === 'fulfilled' && results[0].value.length > 0) {
                recipes = results[0].value;
                console.log('✅ 使用 tnze API 配方');
            } else if (results[1].status === 'fulfilled' && results[1].value.length > 0) {
                recipes = results[1].value;
                console.log('✅ 使用 tc-search-service 配方');
            }

            if (recipes.length > 0) {
                item.recipes = recipes;
                loadIngredientsPrice(recipes);
            } else {
                item.recipes = [];
                showMessage('無法加載配方信息', 'warning');
            }

            renderCraftingTree();
            showGlobalLoading(false);
        });
    } else {
        // 英文使用 XIVAPI
        XIVAPI.getItemInfo(itemId)
            .done(function (response) {
                const recipes = extractRecipes(response, itemId);
                item.recipes = recipes;
                loadIngredientsPrice(recipes);
                renderCraftingTree();
                showGlobalLoading(false);
            })
            .fail(function (error) {
                console.error('加載配方失敗:', error);
                item.recipes = [];
                renderCraftingTree();
                showGlobalLoading(false);
                showMessage('無法加載配方信息', 'warning');
            });
    }
}

// 原有的 loadItemRecipes 代碼已移至上方

// 從 API 響應提取配方
function extractRecipes(response, itemId) {
    let recipes = [];

    // 處理 XIVAPI 格式
    if (response.Recipes) {
        response.Recipes.forEach(recipe => {
            let ingredients = [];
            if (recipe.Ingredients) {
                recipe.Ingredients.forEach(ing => {
                    if (ing.Item) {
                        ingredients.push({
                            id: ing.Item.ID,
                            name: ing.Item.Name,
                            icon: ing.Item.Icon,
                            amount: ing.Quantity,
                            recipes: null
                        });
                    }
                });
            }

            recipes.push({
                id: recipe.ID,
                classJob: recipe.ClassJob?.Abbreviation || '未知',
                level: recipe.RecipeLevelTable?.Stars || 0,
                ingredients: ingredients
            });
        });
    }
    // 處理自定義 API 格式
    else if (response.recipes) {
        response.recipes.forEach(recipe => {
            let ingredients = [];
            if (recipe.ingredients) {
                recipe.ingredients.forEach(ing => {
                    ingredients.push({
                        id: ing.id,
                        name: ing.name,
                        icon: ing.icon,
                        amount: ing.amount,
                        recipes: null
                    });
                });
            }

            recipes.push({
                id: recipe.id,
                classJob: recipe.classJob || '未知',
                level: recipe.level || 0,
                ingredients: ingredients
            });
        });
    }

    return recipes;
}

// 加載材料的價格信息
function loadIngredientsPrice(recipes) {
    if (!state.selectedServer) return;

    recipes.forEach(recipe => {
        if (recipe.ingredients) {
            recipe.ingredients.forEach(ingredient => {
                // 可選：加載材料的價格信息
                APIManager.getItemPrice(state.selectedServer, ingredient.id)
                    .done(function (response) {
                        if (response.listings && response.listings.length > 0) {
                            ingredient.price = response.listings[0].pricePerUnit;
                        }
                    })
                    .fail(function () {
                        // 靜默失敗
                    });
            });
        }
    });
}

// ==================== 樹狀圖 Modal 懸浮窗 ====================

// 打開樹狀圖選擇 modal
function openTreeModal(itemId, itemName, itemIcon) {
    selectedModalItems = {};  // 重置選擇

    // 將當前搜尋結果顯示在 modal 中，並支持多選
    let html = '';
    fullSearchResults.forEach(item => {
        const isSelected = selectedModalItems[item.id] ? 'selected' : '';
        html += `
            <div class="modal-search-item ${isSelected}" data-item-id="${item.id}" onclick="toggleModalItemSelection(${item.id}, this)">
                <input type="checkbox" ${selectedModalItems[item.id] ? 'checked' : ''}>
                <img src="${item.icon || DEFAULT_ICON}" alt="${item.name}">
                <div class="modal-search-item-info">
                    <span class="modal-search-item-name">${escapeHtml(item.name)}</span>
                    <span class="modal-search-item-category">${item.category || '未分類'}</span>
                </div>
            </div>
        `;
    });

    // 使用 jQuery UI Dialog 顯示
    if (!$('#searchResultModal').dialog('instance')) {
        $('#searchResultModal').dialog({
            autoOpen: false,
            modal: true,
            width: 600,
            maxHeight: 600,
            buttons: [
                {
                    text: '取消',
                    click: function () {
                        $(this).dialog('close');
                    },
                    class: 'btn btn-secondary'
                },
                {
                    text: '確認並生成樹狀圖',
                    click: function () {
                        confirmTreeItems();
                        $(this).dialog('close');
                    },
                    class: 'btn btn-primary'
                }
            ]
        });
    }

    $('#searchResultModal').dialog('open');
}

// 切換 modal 中物品的選擇狀態
function toggleModalItemSelection(itemId, element) {
    selectedModalItems[itemId] = !selectedModalItems[itemId];

    if (selectedModalItems[itemId]) {
        $(element).addClass('selected').find('input[type="checkbox"]').prop('checked', true);
    } else {
        $(element).removeClass('selected').find('input[type="checkbox"]').prop('checked', false);
    }
}

// 關閉 modal
function closeSearchModal() {
    if ($('#searchResultModal').dialog('instance')) {
        $('#searchResultModal').dialog('close');
    }
    selectedModalItems = {};
}

// 確認並生成樹狀圖
function confirmTreeItems() {
    const selectedIds = Object.entries(selectedModalItems)
        .filter(([_, selected]) => selected)
        .map(([id, _]) => parseInt(id));

    if (selectedIds.length === 0) {
        showMessage('請先選擇物品', 'warning');
        return;
    }

    // 從搜尋結果中提取選擇的物品
    const itemsToAdd = fullSearchResults.filter(item => selectedIds.includes(item.id));

    // 添加到樹狀圖
    itemsToAdd.forEach(item => {
        if (!selectedTreeItems.some(t => t.id === item.id)) {
            if (!pinnedItems.some(p => p.id === item.id)) {
                pinnedItems.push({
                    id: item.id,
                    name: item.name,
                    icon: item.icon || DEFAULT_ICON,
                    price: null
                });
            }

            selectedTreeItems.push({
                id: item.id,
                name: item.name,
                icon: item.icon || DEFAULT_ICON,
                amount: 1,
                recipes: null
            });
        }
    });

    updateSelectedTreeItemsList();
    renderCraftingTree();
    closeSearchModal();

    // 切換到樹狀圖頁籤
    switchTab('crafting-tree');

    showMessage(`已添加 ${itemsToAdd.length} 個物品到樹狀圖`, 'success');

    // 如果選擇了伺服器，顯示查詢價格按鈕
    if (state.selectedServer) {
        $('#queryPricesBtn').show();
    }
}

// ==================== 樹狀圖價格查詢 ====================

// 查詢樹狀圖中所有物品的價格
function queryAllTreeItemsPrices() {
    if (!state.selectedServer) {
        showMessage('請先選擇伺服器', 'warning');
        return;
    }

    showGlobalLoading(true);

    // 收集所有需要查詢的物品ID
    const itemsToQuery = new Set();
    const collectItemIds = (items) => {
        items.forEach(item => {
            itemsToQuery.add(item.id);
            if (item.recipes) {
                item.recipes.forEach(recipe => {
                    if (recipe.ingredients) {
                        collectItemIds(recipe.ingredients);
                    }
                });
            }
        });
    };

    collectItemIds(selectedTreeItems);

    console.log('🔍 查詢', itemsToQuery.size, '個物品的價格');

    // 並行查詢所有物品的價格
    const pricePromises = Array.from(itemsToQuery).map(itemId =>
        APIManager.getItemPrice(state.selectedServer, itemId).then(response => {
            const priceInfo = {
                itemId: itemId,
                nqMin: null,
                hqMin: null,
                lastUpload: null
            };

            if (response.listings && response.listings.length > 0) {
                const listing = response.listings[0];
                priceInfo.nqMin = listing.pricePerUnit;
                priceInfo.lastUpload = response.lastUploadTime;
            }

            return priceInfo;
        }).catch(() => ({ itemId: itemId, nqMin: null }))
    );

    Promise.allSettled(pricePromises).then(results => {
        const priceMap = {};
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                priceMap[result.value.itemId] = result.value.nqMin;
            }
        });

        // 將價格信息附加到物品上
        const addPricesToItems = (items) => {
            items.forEach(item => {
                item.price = priceMap[item.id];
                if (item.recipes) {
                    item.recipes.forEach(recipe => {
                        if (recipe.ingredients) {
                            addPricesToItems(recipe.ingredients);
                        }
                    });
                }
            });
        };

        addPricesToItems(selectedTreeItems);

        // 計算總成本
        const totalCost = calculateTreeTotalCost(selectedTreeItems);

        renderCraftingTree();
        showGlobalLoading(false);

        if (totalCost > 0) {
            showMessage(`✅ 價格查詢完成。總成本: ${totalCost.toLocaleString()} GP`, 'success');
        } else {
            showMessage('已查詢價格信息', 'success');
        }
    });
}

// 計算樹狀圖的總成本
function calculateTreeTotalCost(items) {
    let totalCost = 0;

    const calculateCost = (itemList) => {
        itemList.forEach(item => {
            if (item.price) {
                totalCost += (item.price * (item.calculatedAmount || item.amount || 1));
            }
            if (item.recipes) {
                item.recipes.forEach(recipe => {
                    if (recipe.ingredients) {
                        calculateCost(recipe.ingredients);
                    }
                });
            }
        });
    };

    calculateCost(items);
    return totalCost;
}

// ==================== 頁面初始化 ====================
$(document).ready(function () {
    console.log('頁面初始化開始');

    // 更新伺服器顯示
    updateServerDisplay();

    // 更新語言顯示
    updateLanguageDisplay();

    // 預加載數據中心和伺服器列表
    preloadDatacentersAndWorlds();

    // 設置頁籤切換事件
    $('.nav-link[data-tab]').on('click', function (e) {
        e.preventDefault();
        const tabName = $(this).data('tab');
        switchTab(tabName);

        // 更新導航狀態
        $('.nav-link').removeClass('active');
        $(this).addClass('active');
    });

    // 預設打開市場查詢頁籤
    switchTab('market-query');
    $('.nav-link').removeClass('active');
    $('.nav-link[data-tab="market-query"]').addClass('active');

    // 若存在 MockItemData，初始化預設物品
    if (window.MockItemData) {
        initWithMockItem(window.MockItemData);
    }

    // 綁定數據中心選擇
    $('#dcSelect').on('change', function () {
        const dc = $(this).val();
        state.selectedDatacenter = dc || null;
        if (dc) {
            loadServersByDatacenter(dc);
        } else {
            resetServerSelect();
        }
        localStorage.setItem('selectedDatacenter', dc || '');
    });

    // 綁定伺服器選擇
    $('#worldSelect').on('change', function () {
        const world = $(this).val();
        state.selectedServer = world || null;
        $('#confirmBtn').prop('disabled', !world);
    });

    // 確認選擇伺服器
    $('#confirmBtn').on('click', function () {
        const dc = $('#dcSelect').val();
        const world = $('#worldSelect').val();

        if (!dc || !world) {
            showMessage('請先選擇數據中心與伺服器', 'warning');
            return;
        }

        state.selectedDatacenter = dc;
        state.selectedServer = world;
        localStorage.setItem('selectedDatacenter', dc);
        localStorage.setItem('selectedServer', world);

        updateServerDisplay();

        const modalEl = document.getElementById('serverSelectModal');
        if (modalEl && window.bootstrap) {
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();
        }

        showMessage(`已選擇 ${dc} / ${world}`, 'success');
    });

    // 綁定搜尋框 Enter 鍵事件
    $('#searchQuery').on('keypress', function (e) {
        if (e.which === 13 || e.keyCode === 13) {
            e.preventDefault();
            searchItemByName();
        }
    });

    // 初始化固定物品面板
    updateMarketSelectedPanel();

    console.log('頁面初始化完成');
});

// 更新伺服器顯示
function updateServerDisplay() {
    const serverName = state.selectedServer || '未選擇';
    const dcName = state.selectedDatacenter || '';

    if (state.selectedServer) {
        $('#serverBadge').text(`${dcName} - ${serverName}`).removeClass('bg-light text-dark').addClass('bg-success text-white');
    } else {
        $('#serverBadge').text('未選擇伺服器').removeClass('bg-success text-white').addClass('bg-light text-dark');
    }
}

// 更新語言顯示
function updateLanguageDisplay() {
    const language = state.selectedLanguage || 'tc';
    const languageText = language === 'tc' ? '繁體中文' : 'English';
    $('#languageBadge').text(languageText);
}

// 預加載數據中心和伺服器列表
function preloadDatacentersAndWorlds() {
    console.log('開始預加載數據中心和伺服器列表');

    Promise.all([
        APIManager.getDataCenters(),
        APIManager.getWorlds()
    ]).then(([datacenters, worlds]) => {
        state.datacenters = datacenters;
        state.isDatacentersLoaded = true;
        state.isWorldsLoaded = true;

        // 構建映射表
        buildServersByDCMapWithIds(datacenters, worlds);

        state.isDataLoaded = true;
        console.log('✓ 數據加載完成');
    }).catch(err => {
        console.error('預加載數據失敗:', err);
        showMessage('載入伺服器列表失敗', 'warning');
    });
}

// 使用 ID 匹配構建映射表
function buildServersByDCMapWithIds(datacenters, worlds) {
    console.log('=== 使用ID匹配方式構建映射表 ===');

    // 建立 worldId -> worldName 映射
    const worldIdToName = {};
    worlds.forEach(world => {
        if (world.id && world.name) {
            worldIdToName[world.id] = world.name;
        }
    });

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

        // 渲染數據中心下拉選單
        renderDatacenterOptions();
    } else {
        console.warn('ID匹配失敗，使用名稱匹配方式');
        buildServersByDCMapWithNames(worlds);
    }
}

// 打開伺服器選擇對話框
function openServerSelectModal() {
    const modalEl = document.getElementById('serverSelectModal');
    if (!modalEl || !window.bootstrap) {
        console.warn('Bootstrap Modal 尚未載入');
        return;
    }
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
}

// 重置伺服器選擇框
function resetServerSelect() {
    $('#worldSelect').html('<option value="">-- 先選擇數據中心 --</option>').prop('disabled', true);
    $('#confirmBtn').prop('disabled', true);
}