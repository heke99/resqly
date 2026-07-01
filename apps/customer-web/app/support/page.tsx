import { getActiveTheme } from "../lib/theme";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const theme = await getActiveTheme();
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Support</h1>
      <p>Behöver du hjälp med {theme.productName}?</p>
      {theme.supportPhone ? (
        <a className="bigbtn" href={`tel:${theme.supportPhone}`}>
          Ring support: {theme.supportPhone}
        </a>
      ) : (
        <p style={{ opacity: 0.7 }}>Kontaktuppgifter sätts av ditt försäkringsbolag.</p>
      )}
      <div className="tile" style={{ marginTop: 16 }}>
        <strong>Vad händer nu?</strong>
        <p style={{ margin: "6px 0 0" }}>
          Efter att du har skapat ett ärende och verifierat med BankID skickas bärgningen till behöriga bärgningsbilar enligt försäkringsbolagets avtal. Vid privat bärgning skickas uppdraget till närmaste tillgängliga bärgare först.
        </p>
      </div>
    </div>
  );
}
