export const APP_NAME = "FoodRush";
export const STORAGE = {
  SESSION: "foodrush_session_v3",
  GUEST_CART: "foodrush_guest_cart_v3",
  NEWSLETTER: "foodrush_newsletter_v3",
  RECENT_SEARCHES: "foodrush_recent_searches_v3",
};

export const USER_BUCKETS = {
  CART: "cart",
  ORDERS: "orders",
  ADDRESSES: "addresses",
  FAVORITES: "favorites",
  GROCERY_FAVORITES: "grocery_favorites",
  TICKETS: "tickets",
  SETTINGS: "settings",
  USED_COUPONS: "used_coupons",
};

export const COUPONS = {
  RUSH60: { code: "RUSH60", label: "60% off up to ₹120", type: "percent", value: 60, cap: 120, min: 249, scope: "food" },
  FREEDEL: { code: "FREEDEL", label: "Free delivery on eligible restaurant orders", type: "delivery", min: 199, scope: "food" },
  QUICK50: { code: "QUICK50", label: "₹50 off grocery orders", type: "flat", value: 50, min: 299, scope: "grocery" },
  QUICK100: { code: "QUICK100", label: "₹100 off grocery orders", type: "flat", value: 100, min: 699, scope: "grocery" },
  WELCOME25: { code: "WELCOME25", label: "25% off your first order up to ₹100", type: "percent", value: 25, cap: 100, min: 199, scope: "all", firstOrderOnly: true },
};

export const ORDER_STAGES = [
  { key: "confirmed", label: "Confirmed", offset: 0 },
  { key: "preparing", label: "Preparing", offset: 2 },
  { key: "picked_up", label: "Picked up", offset: 10 },
  { key: "arriving", label: "Arriving", offset: 18 },
  { key: "delivered", label: "Delivered", offset: 30 },
];

export const SUPPORT_PHONE = "+91 1800 000 7374";
export const SUPPORT_EMAIL = "care@foodrush.app";
