import { STORAGE, USER_BUCKETS } from "./constants";

export const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (_) { return fallback; }
};
export const writeJSON = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
export const removeKey = (key) => { try { localStorage.removeItem(key); } catch (_) {} };

export const getSession = () => readJSON(STORAGE.SESSION, null);
export const setSession = (session) => session ? writeJSON(STORAGE.SESSION, session) : removeKey(STORAGE.SESSION);
export const getUser = getSession;

export const userKey = (bucket, userId = getSession()?.id || "guest") => `foodrush_v3_${userId}_${bucket}`;
export const getUserBucket = (bucket, fallback = [], userId) => readJSON(userKey(bucket, userId), fallback);
export const setUserBucket = (bucket, value, userId) => writeJSON(userKey(bucket, userId), value);
export const clearUserBucket = (bucket, userId) => removeKey(userKey(bucket, userId));

export const getOrders = (userId) => getUserBucket(USER_BUCKETS.ORDERS, [], userId);
export const setOrders = (value, userId) => setUserBucket(USER_BUCKETS.ORDERS, value, userId);
export const getAddresses = (userId) => getUserBucket(USER_BUCKETS.ADDRESSES, [], userId);
export const setAddresses = (value, userId) => setUserBucket(USER_BUCKETS.ADDRESSES, value, userId);
export const getFavorites = (userId) => getUserBucket(USER_BUCKETS.FAVORITES, [], userId);
export const setFavorites = (value, userId) => setUserBucket(USER_BUCKETS.FAVORITES, value, userId);
export const getGroceryFavorites = (userId) => getUserBucket(USER_BUCKETS.GROCERY_FAVORITES, [], userId);
export const setGroceryFavorites = (value, userId) => setUserBucket(USER_BUCKETS.GROCERY_FAVORITES, value, userId);
export const getTickets = (userId) => getUserBucket(USER_BUCKETS.TICKETS, [], userId);
export const setTickets = (value, userId) => setUserBucket(USER_BUCKETS.TICKETS, value, userId);
export const getSettings = (userId) => getUserBucket(USER_BUCKETS.SETTINGS, { language: "English", country: "India", notifications: true }, userId);
export const setSettings = (value, userId) => setUserBucket(USER_BUCKETS.SETTINGS, value, userId);
export const getUsedCoupons = (userId) => getUserBucket(USER_BUCKETS.USED_COUPONS, [], userId);
export const setUsedCoupons = (value, userId) => setUserBucket(USER_BUCKETS.USED_COUPONS, value, userId);

export const migrateLegacyData = () => {
  const session = readJSON("foodrush_user", null);
  if (session && !getSession()) setSession(session);
  const current = getSession();
  if (!current?.id) return;
  const mappings = [
    ["foodrush_orders", USER_BUCKETS.ORDERS], ["foodrush_addresses", USER_BUCKETS.ADDRESSES], ["foodrush_favorites", USER_BUCKETS.FAVORITES], ["foodrush_support_tickets", USER_BUCKETS.TICKETS],
  ];
  mappings.forEach(([legacy, bucket]) => {
    const target = getUserBucket(bucket, [], current.id);
    const old = readJSON(legacy, []);
    if (!target.length && Array.isArray(old) && old.length) setUserBucket(bucket, old, current.id);
  });
};

export const couponKey = (userId = getSession()?.id || "guest") => `foodrush_v3_${userId}_coupon`;
export const getCouponCode = (userId) => localStorage.getItem(couponKey(userId)) || "";
export const setCouponCode = (code, userId) => { const key=couponKey(userId); if(code) localStorage.setItem(key,code); else localStorage.removeItem(key); };
