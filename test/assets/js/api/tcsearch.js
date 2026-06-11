/**
 * TC Search Service - Taiwan FFXIV Item Search API
 * 負責從台灣搜尋服務獲取繁體中文物品數據
 */

const TCSearchAPI = {
    baseUrl: 'https://tc-ffxiv-item-search-service.onrender.com/items/search',
    timeout: 15000,

    /**
     * 搜尋物品
     * @param {string} query - 搜尋關鍵詞
     * @returns {Promise} - 包含搜尋結果的Promise
     */
    search: function (query) {
        // 構建原始 API URL
        const apiUrl = this.baseUrl + '?' + $.param({
            sheets: 'Items',
            query: query,
            language: 'tc',
            limit: 100,
            field: 'Name,ItemSearchCategory.Name,Icon,LevelItem.todo,Rarity'
        });

        // 使用 CORS 代理模組
        const proxyUrl = CORSProxy.wrapUrl(apiUrl);

        return $.ajax({
            url: proxyUrl,
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout,
        }).then(response => {
            const items = response.items.map(item => {
                return {
                    id: item.id,
                    name: item.name,
                    category: '未分類',
                    level: item.levelItem || 0,
                };
            }).filter(Boolean);

            return items;
        }).catch(err => {
            console.error('❌ tc-search-service 請求失敗');
            console.error('錯誤類型:', err.type || 'unknown');
            console.error('錯誤狀態碼:', err.status || 'N/A');
            console.error('錯誤訊息:', err.statusText || err.message);

            return [];
        });
    },

    /**
     * 獲取物品信息（包含配方）
     * @param {number} itemId - 物品ID
     * @returns {Promise} - 包含物品信息的Promise
     */
    getItemInfo: function (itemId) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: 'https://tc-ffxiv-item-search-service.onrender.com/items/' + itemId,
                type: 'GET',
                dataType: 'json',
                timeout: this.timeout
            }).then(response => {
                resolve(response);
            }).catch(err => {
                console.warn('tc-search-service 物品查詢失敗:', err);
                resolve(null);
            });
        });
    }
};
