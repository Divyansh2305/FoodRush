import { Link, useRouteError } from "react-router-dom";
const Error = () => { const err = useRouteError(); return <main className="fr-error-page"><div className="fr-empty-state"><div className="fr-empty-icon">🍽️</div><p className="fr-kicker">FOODRUSH</p><h1>This page got lost on delivery.</h1><p>{err?.status ? `${err.status} ${err.statusText || ""}` : "The page you requested is unavailable."}</p><Link className="fr-primary-link" to="/">Back to home</Link></div></main>; };
export default Error;
