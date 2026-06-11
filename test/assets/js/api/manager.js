/**
 * API Manager - 統一管理所有 API 調用
 * 提供簡化的介面來訪問各個 API 模組
 */

const APIManager = {
    /**
     * 根據語言搜尋物品
     * @param {string} query - 搜尋關鍵詞
     * @param {string} language - 語言代碼 ('tc' 或 'en')
     * @returns {Promise} - 搜尋結果
     */
    searchItems: async function (query, language = 'tc') {
        if (language === 'tc' || language === 'zh-TW') {
            try {
                // 並行調用兩個 API
                const [tnzeResults, tcResults] = await Promise.all([
                    TnzeAPI.search(query, 'zh-TW'),
                    TCSearchAPI.search(query)
                ]);

                // 合併並去重結果
                return this.mergeAndDeduplicateItems(tcResults, tnzeResults);
            } catch (err) {
                console.error('搜尋繁體中文物品出錯:', err);
                return [];
            }
        } else if (language === 'en') {
            try {
                return await TnzeAPI.search(query, 'en');
            } catch (err) {
                console.error('搜尋英文物品出錯:', err);
                return [];
            }
        } else {
            console.warn('未知語言:', language);
            return [];
        }
    },

    /**
     * 取得物品詳細信息
     * @param {number} itemId - 物品 ID
     * @param {string} language - 語言代碼
     * @returns {Promise} - 物品詳細信息
     */
    getItemInfo: async function (itemId, language = 'tc') {
        try {
            if (language === 'tc' || language === 'zh-TW') {
                return await TnzeAPI.getItemInfo(itemId, 'zh-TW');
            } else if (language === 'en') {
                return await TnzeAPI.getItemInfo(itemId, 'en');
            } else {
                return await TnzeAPI.getItemInfo(itemId, 'zh-TW');
            }
        } catch (err) {
            console.error('取得物品信息出錯:', err);
            return null;
        }
    },

    /**
     * 取得配方詳細信息
     * @param {number} recipeId - 配方 ID
     * @returns {Promise} - 配方詳細信息
     */
    getRecipeInfo: async function (recipeId) {
        try {
            return await XIVAPI.getRecipeDetails(recipeId);
        } catch (err) {
            console.error('取得配方信息出錯:', err);
            return null;
        }
    },

    /**
     * 取得物品市場價格
     * @param {string} world - 伺服器名稱
     * @param {number} itemId - 物品 ID
     * @returns {Promise} - 價格信息
     */
    getItemPrice: async function (world, itemId) {
        try {
            return await UniversalisAPI.getItemPrice(world, itemId);
        } catch (err) {
            console.error('取得物品價格出錯:', err);
            return null;
        }
    },

    /**
     * 取得所有可用的資料中心
     * @returns {Promise} - 資料中心列表
     */
    getDataCenters: async function () {
        try {
            return await UniversalisAPI.getDataCenters();
        } catch (err) {
            console.error('取得資料中心出錯:', err);
            return [];
        }
    },

    /**
     * 取得特定資料中心下的所有伺服器
     * @param {string} dataCenterName - 資料中心名稱
     * @returns {Promise} - 伺服器列表
     */
    getWorlds: async function (dataCenterName) {
        try {
            return await UniversalisAPI.getWorlds(dataCenterName);
        } catch (err) {
            console.error('取得伺服器列表出錯:', err);
            return [];
        }
    },

    /**
     * 合併並去重兩個物品搜尋結果
     * @param {Array} tcItems - TC Search Service 的結果
     * @param {Array} tnzeItems - Tnze API 的結果
     * @returns {Array} - 合併並去重後的結果
     */
    mergeAndDeduplicateItems: function (tcItems, tnzeItems) {
        const itemMap = new Map();

        // 優先使用 tnze.yyyy.games 的結果
        (tnzeItems || []).forEach(item => {
            if (item.id) {
                itemMap.set(item.id, item);
            }
        });

        // 補充 tc-search-service 的結果（只添加 tnze 沒有的物品）
        (tcItems || []).forEach(item => {
            if (item.id && !itemMap.has(item.id)) {
                itemMap.set(item.id, item);
            }
        });

        // 轉換為陣列並按 ID 排序
        const mergedArray = Array.from(itemMap.values());
        mergedArray.sort((a, b) => a.id - b.id);

        return mergedArray;
    }
};
