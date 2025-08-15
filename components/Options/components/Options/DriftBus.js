// components/Options/DriftBus.js
// Tiny event bus so StatsRail can publish the currently selected drift mode.
// Consumers listen to 'pricing:drift' on window.
export const DriftBus = {
  emit(mode){ try{ window.dispatchEvent(new CustomEvent("pricing:drift",{ detail:{ mode } })); }catch{} },
  on(cb){ try{ const h=(e)=>cb?.(e?.detail?.mode); window.addEventListener("pricing:drift",h); return ()=>window.removeEventListener("pricing:drift",h);}catch{return ()=>{};}
};
