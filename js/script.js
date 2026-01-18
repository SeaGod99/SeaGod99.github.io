/**
 * FFXIV 市場查詢工具 - JavaScript 邏輯層
 * 改進版 v2.0
 * 
 * 改進：
 * - 模塊化架構
 * - 統一的狀態管理
 * - 改進的錯誤處理
 * - 加強的用戶反饋
 */

const App = (() => {
    'use strict';

    // ==================== 狀態管理 ====================
    const state = {
        selectedServer: localStorage.getItem('selectedServer') || null,
        selectedDatacenter: localStorage.getItem('selectedDatacenter') || null,
        selectedLanguage: localStorage.getItem('selectedLanguage') || 'auto',
        searchResults: [],
        isLoading: false
    };

    // ==================== 配置 ====================
    const config = {
        apiUrl: 'api.php',
        timeout: 15000  // 物品查詢需要較長時間，15秒超時
    };

    // ==================== API 調用 ====================
    const api = {
        call: async (action, params = {}) => {
            console.log('API調用:', action, '參數:', params);
            const formData = new FormData();
            formData.append('action', action);
            
            Object.entries(params).forEach(([key, value]) => {
                formData.append(key, value);
            });

            try {
                showGlobalLoading(true);
                
                const response = await fetch(config.apiUrl, {
                    method: 'POST',
                    body: formData,
                    signal: AbortSignal.timeout(config.timeout)
                });

                console.log('API響應狀態:', response.status, action);

                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }

                const data = await response.json();
                console.log('API響應數據:', action, data);
                
                if (data.error) {
                    throw new Error(data.message || '請求失敗');
                }

                return data.data;
            } catch (error) {
                console.error('API調用錯誤:', action, error);
                if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                    showMessage('請求逾時，請稍後重試或檢查網路連線', 'danger');
                } else {
                    showMessage(error.message || '請求失敗，請重試', 'danger');
                }
                throw error;
            } finally {
                showGlobalLoading(false);
            }
        },

        getDatacenters: async () => {
            return api.call('get_datacenters');
        },

        getWorlds: async (datacenter) => {
            return api.call('get_worlds', { datacenter });
        },

        searchItems: async (query, language = 'auto') => {
            return api.call('search_item_by_name', { query, language });
        },

        getItemInfo: async (itemId) => {
            return api.call('item_overview', {
                item_id: itemId,
                world: state.selectedServer,
                quantity: 1
            });
        },

        queryPrice: async (items) => {
            return api.call('query_price', {
                world: state.selectedServer,
                items: Array.isArray(items) ? items.join(',') : items
            });
        },

        searchRecipes: async (itemId) => {
            return api.call('search_recipe_by_item', { item_id: itemId });
        },

        calculateCraftCost: async (recipeId) => {
            return api.call('calculate_craft_cost', {
                recipe_id: recipeId,
                world: state.selectedServer
            });
        }
    };

    // ==================== UI 操作 ====================
    const ui = {
        init: () => {
            if (state.selectedServer && state.selectedDatacenter) {
                ui.showMainContent();
            } else {
                ui.initializeServerSelection();
            }

            // 事件綁定
            ui.bindEvents();
        },

        bindEvents: () => {
            $(document).on('change', '#dcSelect', ui.onDatacenterChange);
            $(document).on('change', '#worldSelect', ui.onWorldChange);
            $(document).on('change', '#languageSelect', ui.onLanguageChange);
            $(document).on('change', '#searchLanguage', ui.onLanguageChange);
            $(document).on('click', '#confirmBtn', ui.onConfirmSelection);
            $(document).on('click', '.item-result-btn', ui.onSelectItem);
            $(document).on('keypress', '#quickSearch', function(e) {
                if (e.which === 13 || e.keyCode === 13) {
                    e.preventDefault();
                    performQuickSearch();
                }
            });
        },

        initializeServerSelection: async function() {
            try {
                const dcData = await api.getDatacenters();
                const $select = $('#dcSelect');
                
                dcData.datacenters.forEach(function(dc) {
                    const name = dc.name || dc;
                    $select.append('<option value="' + name + '">' + name + '</option>');
                });
                
                // 初始化語言選擇
                $('#languageSelect').val(state.selectedLanguage);
            } catch (error) {
                showMessage('無法載入數據中心', 'danger');
            }
        },

        onDatacenterChange: async function() {
            const dc = $(this).val();
            const $worldSelect = $('#worldSelect');
            
            $worldSelect.find('option:not(:first)').remove();
            $worldSelect.prop('disabled', !dc);

            if (dc) {
                try {
                    const worldData = await api.getWorlds(dc);
                    worldData.worlds.forEach(function(world) {
                        const name = typeof world === 'object' ? (world.name || world.id) : world;
                        $worldSelect.append('<option value="' + name + '">' + name + '</option>');
                    });
                } catch (error) {
                    showMessage('無法載入伺服器列表', 'warning');
                }
            }

            ui.updateConfirmButton();
        },

        onWorldChange: () => {
            ui.updateConfirmButton();
        },

        onLanguageChange: function() {
            const language = $(this).val();
            state.selectedLanguage = language;
            localStorage.setItem('selectedLanguage', language);
        },

        updateConfirmButton: () => {
            const canConfirm = $('#dcSelect').val() && $('#worldSelect').val();
            $('#confirmBtn').prop('disabled', !canConfirm);
        },

        onConfirmSelection: () => {
            const dc = $('#dcSelect').val();
            const world = $('#worldSelect').val();

            if (dc && world) {
                state.selectedDatacenter = dc;
                state.selectedServer = world;
                localStorage.setItem('selectedDatacenter', dc);
                localStorage.setItem('selectedServer', world);
                ui.showMainContent();
            }
        },

        showMainContent: () => {
            $('#initialModal').hide();
            $('#mainContainer').show();
            $('#serverBadge').text(state.selectedServer);
            // 初始化語言選擇
            $('#searchLanguage').val(state.selectedLanguage);
        },

        onSelectItem: function() {
            const itemId = $(this).data('item-id');
            const itemName = $(this).data('item-name');
            
            $('#itemIdInput').val(itemId);
            queryItemById();
        }
    };

    // ==================== 搜尋功能 ====================
    window.performQuickSearch = async function() {
        const query = $('#quickSearch').val().trim();
        if (!query) {
            showMessage('請輸入物品名稱', 'warning');
            return;
        }

        try {
            const language = $('#searchLanguage').val() || state.selectedLanguage;
            state.selectedLanguage = language;
            localStorage.setItem('selectedLanguage', language);
            
            // 顯示搜尋中的提示
            showMessage('搜尋中...', 'info');
            
            const results = await api.searchItems(query, language);
            displaySearchResults(results.items, results.total);
        } catch (error) {
            if (error.name === 'AbortError') {
                showMessage('搜尋逾時，請稍後重試', 'danger');
            }
            // 其他錯誤已由 api.call 處理
        }
    };

    // 保存完整的搜尋結果用於篩選
    let fullSearchResults = [];

    window.clearSearchResults = function() {
        $('#searchResultsPanel').hide();
        $('#resultsList').html('');
        $('#jobFilterContainer').hide();
        $('#jobFilterButtons').html('');
        $('#quickSearch').val('');
        fullSearchResults = [];
    };

    function displaySearchResults(items, total) {
        const $resultsPanel = $('#searchResultsPanel');
        const $list = $('#resultsList');
        
        // 保存完整結果
        fullSearchResults = items;
        
        $('#resultCount').text(total || items.length);
        
        // 提取所有職業並建立篩選按鈕
        const jobs = extractJobsFromItems(items);
        if (jobs.length > 0) {
            renderJobFilterButtons(jobs);
        }
        
        // 顯示所有結果
        renderSearchResultsList(items);
        $resultsPanel.show();
    }

    // 從物品陣列中提取職業列表
    function extractJobsFromItems(items) {
        const jobsSet = new Set();
        items.forEach(function(item) {
            if (item.category && item.category !== '未分類') {
                jobsSet.add(item.category);
            }
        });
        return Array.from(jobsSet).sort();
    }

    // 渲染職業篩選按鈕
    function renderJobFilterButtons(jobs) {
        const $filterContainer = $('#jobFilterContainer');
        const $filterButtons = $('#jobFilterButtons');
        
        let html = '<button class="filter-btn filter-btn-active" data-job="all">全部 (' + fullSearchResults.length + ')</button>';
        
        jobs.forEach(function(job) {
            const count = fullSearchResults.filter(item => item.category === job).length;
            html += '<button class="filter-btn" data-job="' + escapeHtml(job) + '">' + escapeHtml(job) + ' (' + count + ')</button>';
        });
        
        $filterButtons.html(html);
        $filterContainer.show();
        
        // 綁定篩選按鈕點擊事件
        $filterButtons.find('.filter-btn').off('click').on('click', function() {
            const selectedJob = $(this).attr('data-job');
            filterSearchResultsByJob(selectedJob);
            
            // 更新按鈕樣式
            $filterButtons.find('.filter-btn').removeClass('filter-btn-active');
            $(this).addClass('filter-btn-active');
        });
    }

    // 按職業篩選搜尋結果
    function filterSearchResultsByJob(job) {
        let filteredItems = fullSearchResults;
        
        if (job !== 'all') {
            filteredItems = fullSearchResults.filter(function(item) {
                return item.category === job;
            });
        }
        
        renderSearchResultsList(filteredItems);
        $('#resultCount').text(filteredItems.length + ' / ' + fullSearchResults.length);
    }

    // 渲染搜尋結果列表
    function renderSearchResultsList(items) {
        const $list = $('#resultsList');
        
        let html = '';
        items.forEach(function(item) {
            let categoryHtml = item.category ? '<span class="result-category">' + escapeHtml(item.category) + '</span>' : '';
            let levelHtml = item.level ? '<span class="result-level">LV: ' + item.level + '</span>' : '';
            
            html += '<div class="result-item">';
            html += '<div class="result-details">';
            html += '<div class="result-name">' + escapeHtml(item.name) + '</div>';
            html += '<div class="result-meta">';
            html += '<span class="result-id">ID: ' + item.id + '</span>';
            html += categoryHtml;
            html += levelHtml;
            html += '</div></div>';
            html += '<button class="btn btn-small btn-primary item-result-btn" data-item-id="' + item.id + '" data-item-name="' + escapeHtml(item.name) + '">查詢</button>';
            html += '</div>';
        });
        
        $list.html(html);
    }

    // ==================== 物品查詢 ====================
    window.queryItemById = async function() {
        const itemId = $('#itemIdInput').val().trim();
        if (!itemId) {
            showMessage('請輸入物品 ID', 'warning');
            return;
        }

        try {
            const itemData = await api.getItemInfo(itemId);
            displayItemInfo(itemData);
        } catch (error) {
            // 錯誤已由 api.call 處理
        }
    };

    function displayItemInfo(data) {
        const item = data.item;
        const price = data.price;

        // 物品信息
        $('#itemTitle').text(item.name + ' (ID: ' + item.id + ')');
        $('#itemInfoContent').html(
            '<div class="info-row">' +
                '<span class="label">物品名稱：</span>' +
                '<span class="value">' + escapeHtml(item.name) + '</span>' +
            '</div>' +
            '<div class="info-row">' +
                '<span class="label">物品 ID：</span>' +
                '<span class="value">' + item.id + '</span>' +
            '</div>' +
            '<div class="info-row">' +
                '<span class="label">伺服器：</span>' +
                '<span class="value">' + escapeHtml(data.world) + '</span>' +
            '</div>'
        );
        $('#itemInfoPanel').show();

        // 價格信息
        if (price) {
            $('#priceContent').html(
                '<div class="price-row">' +
                    '<div class="price-type">NQ (Normal Quality)</div>' +
                    '<div class="price-value">' +
                        '<div>最低: <strong>' + (price.nq_min || '無') + '</strong> 金幣</div>' +
                        '<div>平均: <strong>' + (price.nq_avg || '無') + '</strong> 金幣</div>' +
                    '</div>' +
                '</div>' +
                '<div class="price-row">' +
                    '<div class="price-type">HQ (High Quality)</div>' +
                    '<div class="price-value">' +
                        '<div>最低: <strong>' + (price.hq_min || '無') + '</strong> 金幣</div>' +
                        '<div>平均: <strong>' + (price.hq_avg || '無') + '</strong> 金幣</div>' +
                    '</div>' +
                '</div>'
            );
            $('#pricePanel').show();
        }
        
        // 查詢合成表
        loadRecipesForItem(item.id);
    }

    // ==================== 合成表查詢 ====================
    async function loadRecipesForItem(itemId) {
        try {
            const recipes = await api.searchRecipes(itemId);
            console.log('收到的配方數據:', recipes);
            if (recipes && recipes.recipes && recipes.recipes.length > 0) {
                // 直接載入第一個配方的詳情，不顯示配方列表
                const firstRecipe = recipes.recipes[0];
                console.log('直接載入配方:', firstRecipe.name);
                loadRecipeDetails(firstRecipe.id, firstRecipe.name);
            } else {
                console.log('沒有配方數據');
                $('#craftPanel').hide();
                $('#recipePanel').hide();
            }
        } catch (error) {
            console.error('查詢配方時發生錯誤:', error);
            // 可能沒有合成表，這不算錯誤
            $('#craftPanel').hide();
            $('#recipePanel').hide();
        }
    }

    function displayRecipes(recipes, itemId) {
        const $craftPanel = $('#craftPanel');
        const $craftContent = $('#craftContent');
        
        console.log('displayRecipes 收到的配方數量:', recipes ? recipes.length : 0);
        
        if (!recipes || recipes.length === 0) {
            console.log('沒有配方或配方列表為空，隱藏面板');
            $craftPanel.hide();
            return;
        }
        
        let html = '<div class="recipes-list">';
        recipes.forEach(function(recipe) {
            html += '\n                <div class="recipe-item" style="cursor: pointer; padding: 10px; border: 1px solid #ddd; margin-bottom: 5px; border-radius: 4px;" onclick="loadRecipeDetails(' + recipe.id + ', \'' + escapeHtml(recipe.name) + '\')">\n                    <div><strong>' + escapeHtml(recipe.name) + '</strong></div>\n                    <div style="font-size: 12px; color: #666;">配方ID: ' + recipe.id + '</div>\n                </div>\n            ';
        });
        html += '</div>';
        
        $craftContent.html(html);
        $craftPanel.show();
        console.log('配方面板已顯示，共 ' + recipes.length + ' 個配方');
    }

    window.loadRecipeDetails = async function(recipeId, recipeName) {
        try {
            showGlobalLoading(true);
            const costData = await api.calculateCraftCost(recipeId);
            
            // 同時查詢所有材料的配方詳情（包括子材料價格）
            const ingredientsWithRecipes = await Promise.all(
                costData.ingredients.map(async function(ing) {
                    try {
                        // 先查詢該材料有哪些配方
                        const recipes = await api.searchRecipes(ing.id);
                        
                        // 如果有配方，查詢第一個配方的完整成本（包括子材料）
                        let recipeCostData = null;
                        if (recipes.recipes && recipes.recipes.length > 0) {
                            const firstRecipe = recipes.recipes[0];
                            recipeCostData = await api.calculateCraftCost(firstRecipe.id);
                        }
                        
                        return {
                            ...ing,
                            recipes: recipes.recipes || [],
                            recipeCostData: recipeCostData
                        };
                    } catch (error) {
                        return {
                            ...ing,
                            recipes: [],
                            recipeCostData: null
                        };
                    }
                })
            );
            
            costData.ingredients = ingredientsWithRecipes;
            displayRecipeDetails(costData, recipeName);
        } catch (error) {
            // 錯誤已由 api.call 處理
        } finally {
            showGlobalLoading(false);
        }
    };

    function displayRecipeDetails(data, recipeName) {
        const $recipePanel = $('#recipePanel');
        const recipe = data.recipe;
        const ingredients = data.ingredients;
        const totalCost = data.totalCost;
        const costPerItem = data.costPerItem;
        const yields = data.yields;
        
        let ingredientsHtml = '<div class="ingredients-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; margin-top: 15px;">';
        ingredients.forEach(function(ing, index) {
            const iconUrl = ing.icon ? 'https://xivapi.com' + ing.icon : '';
            const iconHtml = iconUrl ? '<img src="' + iconUrl + '" alt="' + escapeHtml(ing.name) + '" style="width: 40px; height: 40px;" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22%3E%3Crect fill=%22%23ddd%22 width=%2240%22 height=%2240%22/%3E%3C/svg%3E\'">' : '';
            
            // 材料配方詳情
            let recipeDetailsHtml = '';
            if (ing.recipeCostData) {
                const rData = ing.recipeCostData;
                const rRecipe = rData.recipe;
                const yields = rData.yields || 1;
                const costPerItem = yields > 0 ? Math.round(rData.totalCost / yields) : rData.totalCost;
                
                recipeDetailsHtml = '<div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #28a745;">';
                recipeDetailsHtml += '<div style="font-size: 11px; font-weight: bold; color: #28a745; margin-bottom: 6px;">📋 ' + escapeHtml(ing.recipes[0].name) + '</div>';
                recipeDetailsHtml += '<div style="display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-bottom: 4px;">';
                recipeDetailsHtml += '<span>產出: <strong>' + yields + '</strong> 個</span>';
                recipeDetailsHtml += '<span>總成本: <span style="color: #e74c3c; font-weight: bold;">' + rData.totalCost.toLocaleString() + '</span> 金幣</span>';
                recipeDetailsHtml += '</div>';
                recipeDetailsHtml += '<div style="font-size: 11px; color: #0066cc; font-weight: bold; margin-bottom: 4px;">單個成本: ' + costPerItem.toLocaleString() + ' 金幣</div>';
                
                // 子材料列表
                if (rData.ingredients && rData.ingredients.length > 0) {
                    recipeDetailsHtml += '<div style="font-size: 10px; color: #666; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #ddd;">需要材料：</div>';
                    rData.ingredients.forEach(function(subIng) {
                        const subIcon = subIng.icon ? 'https://xivapi.com' + subIng.icon : '';
                        const subIconHtml = subIcon ? '<img src="' + subIcon + '" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 3px;" onerror="this.style.display=\'none\'">' : '';
                        recipeDetailsHtml += '<div style="font-size: 10px; color: #555; padding: 2px 0; display: flex; justify-content: space-between;">';
                        recipeDetailsHtml += '<span>' + subIconHtml + escapeHtml(subIng.name) + ' x' + subIng.amount + '</span>';
                        recipeDetailsHtml += '<span style="color: #0066cc;">' + subIng.totalCost.toLocaleString() + '金</span>';
                        recipeDetailsHtml += '</div>';
                    });
                }
                
                // 成本比較
                const marketCost = ing.totalCost;
                const craftCost = costPerItem * ing.amount;
                const saving = marketCost - craftCost;
                if (saving !== 0) {
                    const savingClass = saving > 0 ? 'color: #28a745' : 'color: #dc3545';
                    const savingText = saving > 0 ? '💰 製作省' : '⚠️ 購買省';
                    recipeDetailsHtml += '<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 11px; ' + savingClass + '; font-weight: bold;">';
                    recipeDetailsHtml += savingText + ' ' + Math.abs(saving).toLocaleString() + ' 金幣';
                    recipeDetailsHtml += '</div>';
                }
                
                recipeDetailsHtml += '</div>';
            } else if (ing.recipes && ing.recipes.length > 0) {
                recipeDetailsHtml = '<div style="margin-top: 8px; padding: 6px; background: #fff3cd; border-radius: 4px;">';
                recipeDetailsHtml += '<div style="font-size: 11px; color: #856404;">可製作（' + ing.recipes.length + '個配方）</div>';
                recipeDetailsHtml += '</div>';
            } else {
                recipeDetailsHtml = '<div style="margin-top: 8px; padding: 6px; background: #e7f3ff; border-radius: 4px;">';
                recipeDetailsHtml += '<div style="font-size: 11px; color: #004085;">💎 採集/購買獲得</div>';
                recipeDetailsHtml += '</div>';
            }
            
            ingredientsHtml += '\n                <div class="ingredient-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; background: white; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">\n                    <div style="display: flex; align-items: center; margin-bottom: 8px;">\n                        ' + iconHtml + '\n                        <div style="margin-left: 10px; flex: 1;">\n                            <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">' + escapeHtml(ing.name) + '</div>\n                            <div style="font-size: 12px; color: #666;">需要 x' + ing.amount + '</div>\n                        </div>\n                    </div>\n                    <div style="border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px;">\n                        <div style="font-size: 12px; color: #666;">市場單價: <span style="color: #0066cc; font-weight: bold;">' + ing.unitPrice.toLocaleString() + '</span> 金幣</div>\n                        <div style="font-size: 13px; color: #333; margin-top: 4px;">購買小計: <span style="color: #e74c3c; font-weight: bold;">' + ing.totalCost.toLocaleString() + '</span> 金幣</div>\n                    </div>\n                    ' + recipeDetailsHtml + '\n                </div>\n            ';
        });
        ingredientsHtml += '</div>';
        
        const recipeHtml = '\n            <div class="recipe-details">\n                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">\n                    <h4 style="margin: 0 0 10px 0; font-size: 18px;">' + escapeHtml(recipeName) + '</h4>\n                    <div style="display: flex; gap: 20px; font-size: 13px; opacity: 0.9;">\n                        <div>職業: ' + recipe.classJob + '</div>\n                        <div>等級: ' + recipe.level + '</div>\n                        <div>難度: ' + recipe.difficulty + '</div>\n                        <div>耐久: ' + recipe.durability + '</div>\n                    </div>\n                </div>\n                \n                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">\n                    <div style="padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745;">\n                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">成品</div>\n                        <div style="font-weight: bold; font-size: 16px;">' + escapeHtml(recipe.resultItem.name) + ' x' + yields + '</div>\n                    </div>\n                    <div style="padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff;">\n                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">製作成本</div>\n                        <div style="font-weight: bold; font-size: 16px; color: #007bff;">' + totalCost.toLocaleString() + ' 金幣</div>\n                        <div style="font-size: 12px; color: #666; margin-top: 3px;">單個: ' + costPerItem.toLocaleString() + ' 金幣</div>\n                    </div>\n                </div>\n                \n                <div style="margin-bottom: 10px;">\n                    <h5 style="margin: 0; font-size: 16px; color: #333;">所需材料及配方</h5>\n                </div>\n                ' + ingredientsHtml + '\n            </div>\n        ';
        
        $('#recipeDetails').html(recipeHtml);
        $recipePanel.show();
    }

    /**
     * 查詢材料的合成鏈（循環查詢）
     * @param {number} itemId 材料ID
     * @param {string} itemName 材料名稱
     * @param {Event} event 點擊事件
     */
    window.queryMaterialChain = async function(itemId, itemName, event) {
        if (event) {
            event.stopPropagation();
        }
        
        try {
            showMessage('查詢 ' + itemName + ' 的合成方式...', 'info');
            
            // 查詢材料的市價
            const priceData = await api.queryPrice(itemId);
            
            // 查詢該材料的合成表
            const recipes = await api.searchRecipes(itemId);
            
            // 顯示材料信息和合成表
            displayMaterialChain(itemId, itemName, priceData, recipes.recipes);
            
        } catch (error) {
            showMessage('無法查詢 ' + itemName + ' 的資訊', 'warning');
        }
    };

    /**
     * 顯示材料信息和合成鏈
     */
    function displayMaterialChain(itemId, itemName, priceData, recipes) {
        const $recipePanel = $('#recipePanel');
        
        let html = '<div class="material-chain-container">';
        html += '<div style="margin-bottom: 15px; padding: 10px; background: #e8f4f8; border-radius: 4px; border-left: 4px solid #0066cc;">';
        html += '<h4 style="margin: 0 0 10px 0; color: #0066cc;">' + escapeHtml(itemName) + '</h4>';
        html += '<div style="font-size: 12px; color: #666;">物品ID: ' + itemId + '</div>';
        html += '</div>';
        
        // 顯示市價
        if (priceData && priceData.results && priceData.results.length > 0) {
            const item = priceData.results[0];
            html += '<div style="margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">';
            html += '<div style="font-weight: 600; color: #0066cc;">市場價格</div>';
            html += '<div style="font-size: 12px; margin-top: 5px;">';
            
            // 處理聚合API的響應格式
            if (item.minPriceNQ) {
                html += '<div>NQ最低: <strong>' + (item.minPriceNQ || '無') + '</strong> 金幣</div>';
                html += '<div>HQ最低: <strong>' + (item.minPriceHQ || '無') + '</strong> 金幣</div>';
            } else if (item.nq_min) {
                html += '<div>NQ最低: <strong>' + (item.nq_min || '無') + '</strong> 金幣</div>';
                html += '<div>HQ最低: <strong>' + (item.hq_min || '無') + '</strong> 金幣</div>';
            }
            html += '</div></div>';
        }
        
        // 顯示合成方式
        if (recipes && recipes.length > 0) {
            html += '<div style="margin-bottom: 10px; font-weight: 600; color: #333;">可被製作的方式：</div>';
            html += '<div class="nested-recipes">';
            recipes.forEach(function(recipe) {
                html += '<div class="nested-recipe-item" onclick="loadRecipeDetails(' + recipe.id + ', &quot;' + escapeHtml(recipe.name) + '&quot;)">';
                html += '<div><strong>' + escapeHtml(recipe.name) + '</strong></div>';
                html += '<div style="font-size: 12px; color: #666;">配方ID: ' + recipe.id + ' → 點擊查看成本</div>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div style="padding: 10px; background: #fff3cd; border-radius: 4px; border-left: 4px solid #ffc107; color: #666;">';
            html += '此物品無合成方式（採集物品或購買品）';
            html += '</div>';
        }
        
        html += '<div style="margin-top: 15px;"><button class="btn btn-small btn-primary" onclick="$(\'#recipePanel\').show();">← 返回配方</button></div>';
        html += '</div>';
        
        $recipePanel.html(html).show();
    }

    window.clearItemInfo = function() {
        $('#itemInfoPanel').hide();
        $('#pricePanel').hide();
        $('#itemIdInput').val('');
    };

    // ==================== 伺服器選擇 ====================
    window.resetServerSelection = function() {
        state.selectedServer = null;
        state.selectedDatacenter = null;
        localStorage.removeItem('selectedServer');
        localStorage.removeItem('selectedDatacenter');
        $('#initialModal').show();
        $('#mainContainer').hide();
        location.reload();
    };

    // ==================== UI 輔助函數 ====================
    function showGlobalLoading(show) {
        const $loading = $('#globalLoading');
        if (show) {
            $loading.show();
        } else {
            $loading.hide();
        }
        state.isLoading = show;
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
        setTimeout(function() {
            $alert.fadeOut(function() {
                $alert.remove();
            });
        }, 4000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== 初始化 ====================
    $(document).ready(function() {
        ui.init();
    });
})();
