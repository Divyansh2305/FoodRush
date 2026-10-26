import { createSlice } from "@reduxjs/toolkit";
import { USER_BUCKETS } from "./constants";
import { getUserBucket, setUserBucket } from "./storage";

const loadCart = () => getUserBucket(USER_BUCKETS.CART, []);
const cartSlice = createSlice({
  name: "cart",
  initialState: { items: loadCart() },
  reducers: {
    hydrateCart: (state, action) => { state.items = Array.isArray(action.payload) ? action.payload : []; },
    addItem: (state, action) => {
      const item = action.payload;
      const id = `${item.source || "food"}:${item.id}:${item.variant || "default"}`;
      const existing = state.items.find((x) => x.cartId === id);
      if (existing) existing.quantity = Math.min((existing.quantity || 1) + 1, item.maxQty || 10);
      else state.items.push({ ...item, cartId: id, quantity: 1, notes: item.notes || "" });
    },
    decreaseItem: (state, action) => {
      const existing = state.items.find((x) => x.cartId === action.payload || x.id === action.payload);
      if (!existing) return;
      if (existing.quantity > 1) existing.quantity -= 1;
      else state.items = state.items.filter((x) => x.cartId !== existing.cartId);
    },
    removeItem: (state, action) => { state.items = state.items.filter((x) => x.cartId !== action.payload && x.id !== action.payload); },
    clearCart: (state) => { state.items = []; },
    replaceCart: (state, action) => { state.items = (action.payload || []).map((item) => ({ ...item, cartId: item.cartId || `${item.source || "food"}:${item.id}:${item.variant || "default"}` })); },
    setItemNotes: (state, action) => { const item = state.items.find((x)=>x.cartId===action.payload.cartId); if(item) item.notes=action.payload.notes; },
  },
});
export const { hydrateCart, addItem, decreaseItem, removeItem, clearCart, replaceCart, setItemNotes } = cartSlice.actions;
export default cartSlice.reducer;
export const persistCart = (items) => setUserBucket(USER_BUCKETS.CART, items);
