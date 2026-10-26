import { createContext, useCallback, useContext, useMemo, useState } from "react";
const ToastContext=createContext(null);
export const useToast=()=>useContext(ToastContext);
export const ToastProvider=({children})=>{const[toasts,setToasts]=useState([]);const show=useCallback((message,type="info")=>{const id=Date.now()+Math.random();setToasts((t)=>[...t,{id,message,type}]);setTimeout(()=>setToasts((t)=>t.filter((x)=>x.id!==id)),3200);},[]);const value=useMemo(()=>({show}),[show]);return <ToastContext.Provider value={value}>{children}<div className="fr-toast-stack" aria-live="polite">{toasts.map((t)=><div key={t.id} className={`fr-toast ${t.type}`}>{t.message}</div>)}</div></ToastContext.Provider>};
