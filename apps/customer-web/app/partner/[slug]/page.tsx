import { getActiveTheme } from "../../lib/theme";

export const dynamic = "force-dynamic";

export default async function PartnerLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const theme = await getActiveTheme(slug);
  return (
    <div>
      <div className="hero-card">
        <p className="eyebrow">Partnerlänk</p>
        <h1>{theme.productName}</h1>
        <p>
          Du är på Resqlys kundapp i partnerläge. När du kopplar ett fordon sparas försäkringen på bilen,
          så du kan ha flera bilar med olika försäkringsbolag på samma konto.
        </p>
        <a className="bigbtn" href={`/insurances?partner=${slug}`}>Koppla fordon till {theme.productName}</a>
        <a className="secondary-link" href={`/?partner=${slug}`}>Gå till dashboard</a>
      </div>
    </div>
  );
}
