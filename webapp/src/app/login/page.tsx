import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <a className="brand" href="/"><span className="brand-mark">T</span><span>trakk</span></a>
        <div className="auth-copy"><p className="eyebrow">Private dashboard</p><h1>Welcome back.</h1><p>Sign in with the owner account to see your email activity.</p></div>
        <LoginForm />
      </div>
      <aside className="auth-aside"><p>“A little more certainty after every send.”</p><span>TRAKK · EMAIL INTELLIGENCE</span></aside>
    </main>
  );
}
