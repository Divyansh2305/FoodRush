export default function PageHeader({ kicker, title, description, action }) {
  return <div className="fr-page-heading-pro"><div><p className="fr-kicker">{kicker}</p><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;
}
