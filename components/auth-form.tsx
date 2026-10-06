"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, LockKey, UserCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMarketplace } from "@/app/providers";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { register, login } = useMarketplace();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = mode === "signup"
        ? await register(name, email, password)
        : await login(email, password);
      if (result.error) throw new Error(translateAuthError(result.error));
      if ("confirmationRequired" in result && result.confirmationRequired) {
        setSuccess("Un lien de confirmation vient d’être envoyé. Ouvrez le message pour activer votre compte.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next?.startsWith("/") ? next : "/studio");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <div className="form-shell auth-shell">
      <span className="auth-icon">{isSignup ? <UserCircle size={24} /> : <LockKey size={23} />}</span>
      <p className="page-eyebrow">{isSignup ? "Votre prochaine idée commence ici" : "Content de vous revoir"}</p>
      <h1>{isSignup ? "Créer votre compte" : "Se connecter"}</h1>
      <p>{isSignup ? "Créez votre boutique et partagez ce que vous faites." : "Retrouvez vos produits et votre espace créateur."}</p>
      {!supabaseConfigured && <div className="demo-auth-note"><span /> Compte local de démonstration. Vos données restent dans ce navigateur.</div>}
      <form className="form-stack" onSubmit={submit}>
        {isSignup && <div className="field-group"><label htmlFor="name">Nom affiché</label><input className="field-input" id="name" autoComplete="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom" /></div>}
        <div className="field-group"><label htmlFor="email">Adresse e mail</label><input className="field-input" id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" /></div>
        <div className="field-group"><label htmlFor="password">Mot de passe</label><input className="field-input" id="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" /><span className="field-help">Au moins 8 caractères</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className="form-success" role="status">{success}</p>}
        {!success && <button className="button button-dark" type="submit" disabled={busy}>{busy ? "Un instant…" : isSignup ? "Créer mon compte" : "Continuer"}<ArrowRight size={17} /></button>}
      </form>
      <div className="form-bottom">{isSignup ? <>Vous avez déjà un compte ? <Link href="/connexion">Se connecter</Link></> : <>Nouveau sur Sellow ? <Link href="/inscription">Créer un compte</Link></>}</div>
    </div>
  );
}

function translateAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Adresse e mail ou mot de passe incorrect.";
  if (lower.includes("already registered")) return "Cette adresse e mail est déjà associée à un compte.";
  if (lower.includes("password should be at least")) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (lower.includes("email not confirmed")) return "Confirmez votre adresse e mail avant de vous connecter.";
  return message;
}
