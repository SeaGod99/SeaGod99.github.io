/**
 * CORS Proxy Helper - 用於處理跨域請求
 * 支持多個 CORS 代理服務
 */

const CORSProxy = {
    // 可選的 CORS 代理服務
    proxies: [
        'https://corsproxy.io',
        'https://api.allorigins.win/raw',
    ],
    
    activeProxy: 'https://corsproxy.io',

    /**
     * 使用 CORS 代理包裝 URL
     * @param {string} url - 原始 URL
     * @param {string} proxyOption - 指定的代理（可選）
     * @returns {string} - 被代理的 URL
     */
    wrapUrl: function(url, proxyOption) {
        const proxy = proxyOption || this.activeProxy;
        return proxy + '/?' + encodeURIComponent(url);
    },

    /**
     * 嘗試切換到下一個可用的 CORS 代理
     * @returns {boolean} - 是否成功切換
     */
    switchProxy: function() {
        const currentIndex = this.proxies.indexOf(this.activeProxy);
        if (currentIndex < this.proxies.length - 1) {
            this.activeProxy = this.proxies[currentIndex + 1];
            console.log('🔄 切換 CORS 代理至:', this.activeProxy);
            return true;
        }
        console.warn('⚠️ 沒有更多可用的 CORS 代理');
        return false;
    },

    /**
     * 重置為第一個代理
     */
    reset: function() {
        this.activeProxy = this.proxies[0];
        console.log('🔄 CORS 代理已重置為:', this.activeProxy);
    }
};
