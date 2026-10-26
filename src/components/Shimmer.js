const Shimmer = () => (
  <div className="fr-shimmer-grid" aria-label="Loading restaurants">
    {Array.from({ length: 8 }).map((_, i) => (
      <div className="fr-shimmer-card" key={i}>
        <div className="fr-shimmer-image" />
        <div className="fr-shimmer-line wide" />
        <div className="fr-shimmer-line mid" />
        <div className="fr-shimmer-line short" />
      </div>
    ))}
  </div>
);
export default Shimmer;
