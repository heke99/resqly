import { getActiveTheme } from "../lib/theme";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const theme = await getActiveTheme();
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Support</h1>
      <p>Need help with {theme.productName}?</p>
      {theme.supportPhone ? (
        <a className="bigbtn" href={`tel:${theme.supportPhone}`}>
          Call support: {theme.supportPhone}
        </a>
      ) : (
        <p style={{ opacity: 0.7 }}>Support contact details are configured by your insurance partner.</p>
      )}
      <div className="tile" style={{ marginTop: 16 }}>
        <strong>What happens next?</strong>
        <p style={{ margin: "6px 0 0" }}>
          After you start a case and verify with BankID, we find the nearest tow truck, share live
          ETA, and keep your insurance company updated automatically.
        </p>
      </div>
    </div>
  );
}
