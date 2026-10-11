import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import GoogleSignIn from "@/components/google-sign-in";
import SessionExpiredNotice from "@/components/session-expired-notice";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getOwnerSession()) redirect("/");
  const query = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">A WARM WELCOME</span>
          <h1>
            A good day starts
            <br />
            with a clear plan.
          </h1>
          <p>
            Your team, their tasks, and every update—together in one familiar
            place.
          </p>
          <div className="task-art" aria-hidden="true">
            <div className="art-card art-card-back" />
            <div className="art-card">
              <span>Today’s prep</span>
              <i />
              <i />
              <i />
              <b>✓</b>
            </div>
            <em className="art-spark one">✦</em>
            <em className="art-spark two">✦</em>
          </div>
          <div className="auth-benefits">
            <span>
              <b>✓</b> Simple daily tasks
            </span>
            <span>
              <b>✓</b> WhatsApp updates
            </span>
          </div>
        </div>
        <small>Made with care for Ganesh Bhavan</small>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <div className="auth-form">
            <div className="form-icon">✓</div>
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Sign in to GB Tasks</h2>
            <p>A smoother service starts here.</p>
            <SessionExpiredNotice explicit={query.error === "expired"} />
            {query.error === "invalid" && (
              <div className="error" role="alert">
                Those details don’t match. Check your password and authenticator
                code.
              </div>
            )}
            {query.error === "limited" && (
              <div className="error" role="alert">
                Too many attempts. Please wait 15 minutes before trying again.
              </div>
            )}
            {query.error === "unauthorized" && (
              <div className="error" role="alert">
                This Google account has not been approved for this restaurant.
              </div>
            )}
            {query.error === "google" && (
              <div className="error" role="alert">
                Google sign-in did not complete. Please try again.
              </div>
            )}
            <GoogleSignIn />
          </div>
          <p className="privacy-note">
            Private and secure · Only owners can sign in
          </p>
        </div>
      </section>
    </main>
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="logo">GB</div>
      <div>
        Ganesh Bhavan<small>A FEAST OF TRADITION · ESTD. 1997</small>
      </div>
    </div>
  );
}
