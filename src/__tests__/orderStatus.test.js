import { getOrderProgress } from "../utilis/orderStatus";
test("old order becomes delivered",()=>{const order={createdAt:new Date(Date.now()-40*60*1000).toISOString()};expect(getOrderProgress(order).delivered).toBe(true);});
