import { useEffect, useState } from "react";
const useOnlineStatus=()=>{const[onlineStatus,setOnlineStatus]=useState(()=>navigator.onLine);useEffect(()=>{const offline=()=>setOnlineStatus(false);const online=()=>setOnlineStatus(true);window.addEventListener("offline",offline);window.addEventListener("online",online);return()=>{window.removeEventListener("offline",offline);window.removeEventListener("online",online);};},[]);return onlineStatus;};
export default useOnlineStatus;
