// app/strategy/loading.jsx
export default function StrategyLoading() {
  return (
    <div className="wrap" aria-busy="true" aria-live="polite">
      <div className="skeleton">
        <div className="bar w60" />
        <div className="bar w40" />
        <div className="bar w70" />
      </div>

      <style jsx>{`
        .wrap{
          min-height: 40vh;
          display:flex; align-items:center; justify-content:center;
          padding: 24px;
        }
        .skeleton{ width: min(680px, 90%); }
        .bar{
          height:16px; margin:10px 0; border-radius:8px;
          --a: color-mix(in srgb, var(--surface, #f7f9fc) 70%, transparent);
          --b: color-mix(in srgb, var(--surface, #f7f9fc) 40%, var(--card, #fff));
          background: linear-gradient(90deg, var(--a) 0%, var(--b) 50%, var(--a) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.1s linear infinite;
        }
        .w40{ width:40%; } .w60{ width:60%; } .w70{ width:70%; }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
