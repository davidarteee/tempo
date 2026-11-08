"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/** Retorn d'OAuth (PKCE): el client de Supabase intercanvia el codi per una sessió */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sb = supabase();
    if (!sb) return router.replace("/today");
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error_description") ?? params.get("error");
    if (err) {
      void Promise.resolve().then(() => setError(err));
      return;
    }
    const code = params.get("code");
    const finish = () => router.replace("/today");
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (session) finish();
    });
    void (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) return finish();
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          // detectSessionInUrl pot haver-ho fet ja
          const again = await sb.auth.getSession();
          if (again.data.session) return finish();
          setError(error.message);
        } else finish();
      }
    })();
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-center">
      {error ? (
        <div>
          <p className="text-[15px] text-danger">No s&apos;ha pogut iniciar la sessió: {error}</p>
          <button onClick={() => router.replace("/login")} className="mt-4 text-[15px] font-semibold text-accent">
            Torna-ho a provar
          </button>
        </div>
      ) : (
        <div className="size-6 animate-spin rounded-full border-2 border-fill-strong border-t-accent" aria-label="Iniciant sessió" />
      )}
    </main>
  );
}
