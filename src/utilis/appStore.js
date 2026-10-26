import { configureStore } from "@reduxjs/toolkit";
import cartReducer, { persistCart } from "./cartSlice";
const appStore = configureStore({ reducer: { cart: cartReducer } });
let last = JSON.stringify(appStore.getState().cart.items);
appStore.subscribe(() => {
  const items = appStore.getState().cart.items;
  const next = JSON.stringify(items);
  if (next !== last) { last = next; persistCart(items); }
});
export default appStore;
