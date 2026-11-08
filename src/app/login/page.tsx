"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/shell/AppShell";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/today");
    });
  }, [router]);

  const signIn = async () => {
    const sb = supabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-grouped px-6 dark:bg-bg">
      <div className="anim-pop flex w-full max-w-[360px] flex-col items-center text-center">
        <Logo size={72} />
        <h1 className="mt-6 text-[30px] font-bold tracking-tight">Tempo</h1>
        <p className="mt-2 text-[15px] leading-snug text-text-2">El teu calendari i les teves tasques, junts i sincronitzats a tots els dispositius.</p>
        {isSupabaseConfigured ? (
          <button
            onClick={signIn}
            disabled={busy}
            className="mt-10 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-text text-[16px] font-semibold text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <GoogleMark />
            {busy ? "Obrint Google…" : "Continua amb Google"}
          </button>
        ) : (
          <button onClick={() => router.replace("/today")} className="mt-10 h-12 w-full rounded-xl bg-accent text-[16px] font-semibold text-white">
            Obre Tempo (mode local)
          </button>
        )}
        {error && <p className="mt-4 text-[13px] text-danger">{error}</p>}
        <p className="mt-6 text-[12px] leading-snug text-text-3">
          {isSupabaseConfigured ? "Només fem servir el teu compte per identificar-te. Les teves dades són privades." : "Supabase no està configurat: les dades es desaran només en aquest dispositiu."}
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
