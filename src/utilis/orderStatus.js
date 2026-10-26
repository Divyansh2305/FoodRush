import { ORDER_STAGES } from "./constants";
export const getOrderProgress = (order) => {
  if (!order) return { stage: ORDER_STAGES[0], index: 0, eta: 30, delivered: false };
  if (order.status === "cancelled") return { stage:{key:"cancelled",label:"Cancelled"}, index:-1, eta:0, delivered:false, cancelled:true };
  if (order.status === "delivered") return { stage:ORDER_STAGES.at(-1), index:ORDER_STAGES.length-1, eta:0, delivered:true };
  let index=0;
  let eta=30;
  if (Array.isArray(order.timeline) && order.timeline.length) {
    order.timeline.forEach((s,i)=>{ if(Date.now()>=new Date(s.at).getTime()) index=i; });
    const deliveryAt=new Date(order.timeline.at(-1).at).getTime();
    eta=Math.max(0,Math.ceil((deliveryAt-Date.now())/60000));
  } else {
    const elapsed=Math.max(0,Math.floor((Date.now()-new Date(order.createdAt).getTime())/60000));
    ORDER_STAGES.forEach((s,i)=>{ if(elapsed>=s.offset) index=i; });
    eta=Math.max(0,30-elapsed);
  }
  const delivered=index===ORDER_STAGES.length-1 || eta===0;
  return { stage:ORDER_STAGES[delivered?ORDER_STAGES.length-1:index], index:delivered?ORDER_STAGES.length-1:index, eta:delivered?0:eta, delivered };
};
export const formatEta = (order) => { const p=getOrderProgress(order); return p.cancelled?"Cancelled":p.delivered?"Delivered":`${p.eta}-${p.eta+8} min`; };
