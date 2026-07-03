export default function NotFound() {
  return (
    <div style={{ textAlign: "center", paddingTop: 64, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24 }}>Sidan hittades inte</h1>
      <p style={{ opacity: 0.72 }}>Sidan du letar efter finns inte eller har flyttats.</p>
      <a href="/">Till översikten</a>
    </div>
  );
}
