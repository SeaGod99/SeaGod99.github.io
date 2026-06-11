/**
 * XIVAPI - Final Fantasy XIV Item & Recipe Database API
 * 負責物品基本資訊和配方數據的查詢
 */

const XIVAPI = {
    baseUrl: 'https://xivapi.com',
    timeout: 15000,

    /**
     * 獲取物品基本信息
     * @param {number} itemId - 物品ID
     * @returns {Promise} - 包含物品信息的Promise
     */
    getItemInfo: function (itemId) {
        return this.transXivItem($.ajax({
            url: this.baseUrl + '/Item/' + encodeURIComponent(itemId),
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout
        }));
    },

    /**
     * 將 XIVAPI Item JSON 轉成精簡 Object
     * @param {object} item - XIVAPI Item response
     * @returns {{
     *   item_id: number,
     *   icon: string | null,
     *   iconHD: string | null,
     *   recipesId: number | null
     * }}
     */
    transXivItem: function (item) {
        if (item == null || item.ID == null) {
            return {};
        }
        return {
            item_id: item?.ID ?? null,
            icon: this.getIconUrl(item?.IconHD ?? item?.Icon ?? null),
            level: item?.LevelEquip ?? null,
            CanBeHq: (Boolean)(item?.CanBeHq) ?? false,
            recipesId:
                Array.isArray(item?.Recipes) && item.Recipes.length > 0
                    ? item.Recipes[0].ID ?? null
                    : null
        }
    },

    /**
     * 獲取配方詳細信息
     * @param {number} recipeId - 配方ID
     * @returns {Promise} - 包含配方信息的Promise
     */
    getRecipeDetails: function (recipeId) {
        return $.ajax({
            url: this.baseUrl + '/Recipe/' + encodeURIComponent(recipeId),
            type: 'GET',
            dataType: 'json',
            timeout: this.timeout
        });
    },

    /**
     * 獲取物品icon的完整URL
     * @param {string} iconPath - icon路徑
     * @returns {string} - 完整的icon URL
     */
    getIconUrl: function (iconPath) {
        if (!iconPath) {
            return 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
        }
        if (iconPath.startsWith('http')) {
            return iconPath;
        }
        return this.baseUrl + iconPath;
    }
};
