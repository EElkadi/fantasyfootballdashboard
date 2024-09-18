let cache = {
    data: null,
    lastUpdated: null
  };
  
  export function getCachedData() {
    return cache;
  }
  
  export function setCachedData(data) {
    cache.data = data;
    cache.lastUpdated = new Date();
  }