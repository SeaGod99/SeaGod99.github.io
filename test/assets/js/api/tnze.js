/**
 * Tnze API - FFXIV Item & Recipe Database (Multi-language)
 * 負責從 tnze.yyyy.games 獲取物品和配方數據
 */

const TnzeAPI = {
    baseUrl: 'https://tnze.yyyy.games/api/datasource',
    timeout: 12000,

    /**
     * 從 Tnze API 搜尋物品或配方
     * 最多搜尋頁數 (預設 3)
     * @param {string} query - 搜尋關鍵詞
     * @param {string} language - 語言代碼 ('zh-TW' 或 'en')
     * @returns {Promise} - 包含搜尋結果的Promise
     */
    search: function (query, language = 'zh-TW') {
        const languageCode = language === 'en' ? 'en' : 'zh-TW';
        const categoryLabel = languageCode === 'en' ? 'Uncategorized' : '未分類';
        let maxPages = 3;

        return new Promise((resolve, reject) => {
            const results = [];
            let pageId = 0;

            const fetchPage = () => {
                if (pageId > maxPages) {
                    resolve(results);
                    return;
                }

                const searchName = '%' + query + '%';
                const url = this.baseUrl + '/' + languageCode + '/recipe_table?' + $.param({
                    page_id: pageId,
                    search_name: searchName
                });

                $.ajax({
                    url: url,
                    type: 'GET',
                    dataType: 'json',
                    timeout: this.timeout
                }).then(response => {
                    if (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
                        pageId = maxPages;
                        resolve(results);
                        return;
                    }

                    response.data.forEach(item => {
                        results.push({
                            id: item.item_id,
                            name: item.item_name,
                            category: item.job || categoryLabel,
                            level: item.item_level || null,
                        });
                    });

                    maxPages = Math.min(response.p, maxPages);

                    pageId++;
                    if (pageId > maxPages) {
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
            };

            fetchPage();
        });
    },

    /**
     * 獲取物品詳細信息
     * @param {number} itemId - 物品ID
     * @param {string} language - 語言代碼
     * @returns {Promise} - 包含物品信息的Promise
     */
    getItemInfo: function (itemId, language = 'zh-TW') {
        const languageCode = language === 'en' ? 'en' : 'zh-TW';

        return new Promise((resolve, reject) => {
            $.ajax({
                url: this.baseUrl + '/' + languageCode + '/item_info',
                type: 'GET',
                data: {
                    item_id: itemId
                },
                dataType: 'json',
                timeout: 10000
            }).then(response => {
                if (response && response.id) {
                    resolve({
                        id: response.id,
                        name: response.name || '',
                        canBeHQ: Boolean(response.can_be_hq),
                    });
                } else {
                    resolve(null);
                }
            }).catch(err => {
                console.warn('獲取物品信息失敗 (ID:', itemId, '):', err);
                resolve(null);
            });
        });
    },
};
