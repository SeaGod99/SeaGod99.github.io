/**
 * Universalis - FFXIV Market Board API
 * 負責市場價格數據的查詢
 */

const UniversalisAPI = {
    baseUrl: 'https://universalis.app/api/v2',
    timeout: 15000,

    /**
     * 獲取數據中心列表
     * @returns {Promise} - 包含數據中心列表的Promise
     */
    getDataCenters: function () {
        return $.ajax({
            url: this.baseUrl + '/data-centers',
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout
        });
    },

    /**
     * 獲取伺服器/世界列表
     * @returns {Promise} - 包含伺服器列表的Promise
     */
    getWorlds: function () {
        return $.ajax({
            url: this.baseUrl + '/worlds',
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout
        });
    },

    /**
     * 獲取單一或多個物品在特定伺服器的價格
     * @param {string} world - 伺服器名稱
     * @param {number|array} itemIds - 物品ID（單個）或物品ID列表（多個）
     * @returns {Promise} - 包含價格信息的Promise
     */
    getItemPrice: function (world, itemIds) {
        // 如果是陣列，使用聚合端點
        if (Array.isArray(itemIds)) {
            if (itemIds.length === 0) {
                return $.Deferred().reject(new Error('No item IDs provided'));
            }

            const itemIds = itemIds.join(',');
        }

        // 單個物品 - 使用單一物品端點
        return $.ajax({
            url: this.baseUrl + '/' + encodeURIComponent(world) + '/' + encodeURIComponent(itemIds),
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout
        }).then(response => this._parseAggregatedResponse(response));
    },

    /**
     * 批量獲取多個物品在特定伺服器的單位價格（含掛單明細）
     * @param {string} world - 伺服器名稱
     * @param {array} itemIds - 物品ID列表
     * @returns {Promise} - 包含價格信息列表的Promise
     */
    getUnitPrice: function (world, itemIds) {
        if (!itemIds || !itemIds.length) {
            return $.Deferred().reject(new Error('No item IDs provided'));
        }

        // 如果只有一個 ID，加上 0 避免 fields 格式錯誤
        let ids = [...itemIds];
        if (ids.length === 1) {
            ids.push(0);
        }

        const itemIdsStr = ids.join(',');
        const fields = 'items.itemId,items.lastUploadTime,items.listings.pricePerUnit,items.listings.quantity,items.listings.total,items.listings.tax';

        return $.ajax({
            url: this.baseUrl + '/' + encodeURIComponent(world) + '/' + itemIdsStr + '?fields=' + encodeURIComponent(fields),
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout
        }).then(response => {
            // 解析 items 物件格式的回應
            const results = [];

            if (response.items) {
                Object.keys(response.items).forEach(itemId => {
                    const id = parseInt(itemId);
                    // 跳過我們添加的 ID 0
                    if (id === 0) return;

                    const itemData = response.items[itemId];
                    const listings = itemData.listings || [];

                    // 將相同價格的掛單合併
                    const priceMap = new Map();
                    listings.forEach(listing => {
                        const price = listing.pricePerUnit;
                        if (priceMap.has(price)) {
                            const existing = priceMap.get(price);
                            existing.quantity += listing.quantity;
                            existing.total += listing.total;
                            existing.tax += listing.tax;
                        } else {
                            priceMap.set(price, {
                                pricePerUnit: listing.pricePerUnit,
                                quantity: listing.quantity,
                                total: listing.total,
                                tax: listing.tax
                            });
                        }
                    });

                    // 轉換為陣列並按單價升序排序
                    const mergedListings = Array.from(priceMap.values())
                        .sort((a, b) => a.pricePerUnit - b.pricePerUnit);

                    results.push({
                        itemId: itemData.itemId,
                        lastUploadTime: itemData.lastUploadTime ? Math.floor(itemData.lastUploadTime / 1000) : null,
                        listings: mergedListings
                    });
                });
            }

            return { results: results };
        });
    },

    /**
     * 解析 Universalis API 聚合回應，標準化價格格式
     * @private
     */
    _parseAggregatedResponse: function (response) {
        // 聚合端點回應（多個物品）
        if (response.results && Array.isArray(response.results)) {
            const results = response.results.map(item => ({
                itemId: item.itemId,
                minPriceNQ: item.nq?.minListing?.world?.price || 0,
                minPriceHQ: item.hq?.minListing?.world?.price || 0,
                averagePriceNQ: item.nq?.averageSalePrice?.world?.price || 0,
                averagePriceHQ: item.hq?.averageSalePrice?.world?.price || 0,
                nq: item.nq,
                hq: item.hq,
                worldUploadTimes: item.worldUploadTimes || [],
                lastUploadTime: item.worldUploadTimes && item.worldUploadTimes.length > 0
                    ? Math.floor(item.worldUploadTimes[0].timestamp / 1000)
                    : null
            }));

            return {
                results: results,
                failedItems: response.failedItems || []
            };
        }

        // 單一物品端點回應
        return {
            itemId: response.itemId,
            minPriceNQ: response.minPriceNQ || 0,
            minPriceHQ: response.minPriceHQ || 0,
            averagePriceNQ: response.averagePriceNQ || 0,
            averagePriceHQ: response.averagePriceHQ || 0,
            nq: response.nq,
            hq: response.hq,
            worldUploadTimes: response.worldUploadTimes || [],
            lastUploadTime: response.lastUploadTime || null
        };
    },
};
