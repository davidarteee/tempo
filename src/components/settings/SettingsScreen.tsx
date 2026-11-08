"use client";
import { useEffect, useState } from "react";
import { Bell, CalendarDays, Download, LogOut, RefreshCw, Smartphone } from "lucide-react";
import { useAuth } from "../shell/AuthGate";
import { setPrefs, useUI, type ThemePref } from "@/lib/ui/state";
import { Button, Group, Kbd, NativeSelect, Row, Segmented, Switch } from "../ui/primitives";
import { CategoryManager } from "./CategoryManager";
import { useSyncStatus } from "../shell/SyncIndicator";
import { discardFailed, retryFailed, syncNow } from "@/lib/sync/engine";
import { authHeader } from "@/lib/supabase/client";
import { refreshGoogleStatus, runGoogleSync } from "../shell/GoogleAutoSync";
import { confirmDialog, toast } from "../ui/feedback";
import { currentPushSubscription, pushSupport, showLocalNotification, subscribePush, unsubscribePush, vapidPublicKey } from "@/lib/notifications/push";
import { reminderLabel } from "../editors/pickers";
import { durationLabel } from "@/lib/time/dates";
import { useMounted } from "@/lib/ui/hooks";
import { promptInstall, useInstallState } from "@/lib/ui/install";

export function SettingsScreen() {
  const mounted = useMounted();
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-grouped dark:bg-bg">
      <div className="pt-safe mx-auto max-w-2xl space-y-7 px-4 pb-32 md:px-8 md:pb-12">
        <h1 className="pt-4 text-[30px] font-bold tracking-tight md:pt-8 md:text-[32px]">Ajustos</h1>
        <Account />
        <Appearance />
        <CalendarPrefs />
        <CategoryManager />
        {mounted && <Notifications />}
        <GoogleCalendar />
        <SyncSection />
        {mounted && <Install />}
        <Shortcuts />
      </div>
    </div>
  );
}

function Account() {
  const { user, local, signOut } = useAuth();
  if (local) {
    return (
      <Group title="Compte" footer="Supabase no està configurat. Les dades es desen només en aquest navegador. Configura les variables d'entorn per sincronitzar entre dispositius (vegeu el README).">
        <Row label="Mode local" icon={<Smartphone className="size-[18px]" />} />
      </Group>
    );
  }
  const meta = user?.user_metadata ?? {};
  return (
    <Group title="Compte">
      <div className="flex items-center gap-3 px-4 py-3">
        {meta.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meta.avatar_url} alt="" className="size-11 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex size-11 items-center justify-center rounded-full bg-fill text-[18px] font-semibold">{(user?.email ?? "?").charAt(0).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[16px] font-medium">{meta.full_name ?? meta.name ?? user?.email}</div>
          <div className="truncate text-[13px] text-text-2">{user?.email}</div>
        </div>
      </div>
      <Row
        label="Tanca la sessió"
        icon={<LogOut className="size-[18px]" />}
        className="text-danger"
        onClick={async () => {
          if (await confirmDialog("Vols tancar la sessió?", { message: "Les dades d'aquest dispositiu s'esborraran; continuaran guardades al teu compte.", confirmLabel: "Tanca la sessió", destructive: true })) await signOut();
        }}
      />
    </Group>
  );
}

function Appearance() {
  const theme = useUI((s) => s.prefs.theme);
  return (
    <Group title="Aparença">
      <div className="px-4 py-3">
        <Segmented
          className="w-full"
          value={theme}
          onChange={(t: ThemePref) => setPrefs({ theme: t })}
          options={[
            { value: "system", label: "Automàtic" },
            { value: "light", label: "Clar" },
            { value: "dark", label: "Fosc" },
          ]}
        />
      </div>
    </Group>
  );
}

function CalendarPrefs() {
  const prefs = useUI((s) => s.prefs);
  return (
    <Group title="Calendari">
      <Row label="La setmana comença">
        <NativeSelect label="Inici de la setmana" value={String(prefs.weekStart)} onChange={(v) => setPrefs({ weekStart: Number(v) })}>
          <option value="1">Dilluns</option>
          <option value="0">Diumenge</option>
          <option value="6">Dissabte</option>
        </NativeSelect>
      </Row>
      <Row label="Mostra les tasques fetes">
        <Switch checked={prefs.showCompleted} onChange={(v) => setPrefs({ showCompleted: v })} label="Mostra les tasques fetes al calendari" />
      </Row>
      <Row label="Durada per defecte">
        <NativeSelect label="Durada per defecte dels esdeveniments" value={String(prefs.defaultDuration)} onChange={(v) => setPrefs({ defaultDuration: Number(v) })}>
          {[15, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row label="Avís per defecte">
        <NativeSelect label="Recordatori per defecte per a esdeveniments nous" value={String(prefs.defaultReminders[0] ?? "")} onChange={(v) => setPrefs({ defaultReminders: v === "" ? [] : [Number(v)] })}>
          <option value="">Cap</option>
          {[0, 5, 10, 15, 30, 60, 1440].map((m) => (
            <option key={m} value={m}>
              {reminderLabel(m, false)}
            </option>
          ))}
        </NativeSelect>
      </Row>
    </Group>
  );
}

function Notifications() {
  const { local } = useAuth();
  const support = pushSupport();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void currentPushSubscription().then((s) => setSubscribed(!!s));
  }, []);

  let footer = "Els recordatoris es configuren a cada esdeveniment o tasca. Amb l'app oberta, els avisos funcionen també sense connexió.";
  if (support === "needs-install") footer = "A l'iPhone i l'iPad, les notificacions només funcionen si instal·les Tempo a la pantalla d'inici (Comparteix → Afegeix a la pantalla d'inici) i l'obres des d'allà (iOS 16.4 o posterior).";
  else if (support === "unsupported") footer = "Aquest navegador no admet notificacions push. Els avisos només apareixeran amb l'app oberta.";
  else if (local) footer = "En mode local, els avisos només apareixen amb l'app oberta. Inicia sessió per rebre'ls també amb l'app tancada.";
  else if (!vapidPublicKey) footer = "El servidor no té configurades les claus VAPID: els avisos només apareixeran amb l'app oberta.";

  const enable = async () => {
    setBusy(true);
    try {
      if (!local && vapidPublicKey && support === "supported") {
        const r = await subscribePush();
        if (!r.ok) toast(r.reason ?? "No s'han pogut activar");
        else setSubscribed(true);
      } else {
        await Notification.requestPermission();
      }
      setPerm(Notification.permission);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group title="Notificacions" footer={footer}>
      <Row label="Avisos" icon={<Bell className="size-[18px]" />}>
        {perm === "granted" && (subscribed || local || !vapidPublicKey) ? (
          <span className="text-[14px] text-success">Activats</span>
        ) : perm === "denied" ? (
          <span className="text-[13px] text-text-3">Bloquejats al navegador</span>
        ) : support === "needs-install" || perm === "unsupported" ? (
          <span className="text-[13px] text-text-3">No disponibles</span>
        ) : (
          <Button size="sm" variant="tinted" onClick={enable} disabled={busy}>
            Activa
          </Button>
        )}
      </Row>
      {perm === "granted" && (
        <Row label="Prova" onClick={() => void showLocalNotification("Tempo", "Les notificacions funcionen correctament.", "test", "/today")}>
          <span className="text-[13px]">Envia una notificació</span>
        </Row>
      )}
      {perm === "granted" && subscribed && (
        <Row
          label="Desactiva a aquest dispositiu"
          className="text-danger"
          onClick={async () => {
            await unsubscribePush();
            setSubscribed(false);
          }}
        />
      )}
    </Group>
  );
}

function GoogleCalendar() {
  const { local } = useAuth();
  const [status, setStatus] = useState<{ connected: boolean; email: string | null; lastSyncedAt: string | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (local) return;
    void refreshGoogleStatus().then(setStatus);
    const p = new URLSearchParams(window.location.search);
    if (p.get("google") === "connected") toast("Google Calendar connectat");
    if (p.get("google") === "error") toast(`No s'ha pogut connectar: ${p.get("reason") ?? "error"}`);
    if (p.has("google")) window.history.replaceState(null, "", "/settings");
  }, [local]);

  if (local) {
    return (
      <Group title="Google Calendar" footer="Inicia sessió per connectar Google Calendar.">
        <Row label="Google Calendar" icon={<CalendarDays className="size-[18px]" />}>
          <span className="text-[13px] text-text-3">No disponible</span>
        </Row>
      </Group>
    );
  }

  const connect = async () => {
    setBusy(true);
    const res = await fetch("/api/google/connect", { method: "POST", headers: await authHeader() });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (json.url) window.location.assign(json.url);
    else {
      toast(json.error ?? "No s'ha pogut iniciar la connexió");
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!(await confirmDialog("Desconnectar Google Calendar?", { message: "Els esdeveniments ja importats es conservaran a Tempo, però deixaran de sincronitzar-se.", confirmLabel: "Desconnecta", destructive: true }))) return;
    setBusy(true);
    await fetch("/api/google/connect", { method: "DELETE", headers: await authHeader() });
    setStatus(await refreshGoogleStatus());
    setBusy(false);
  };
  const syncGoogle = async () => {
    setBusy(true);
    await syncNow();
    const r = await runGoogleSync();
    if (!r.ok && r.error) toast(r.error);
    setStatus(await refreshGoogleStatus());
    setBusy(false);
  };

  return (
    <Group title="Google Calendar" footer="Sincronització bidireccional dels esdeveniments amb el calendari principal de Google. Les tasques es queden a Tempo.">
      <Row label="Google Calendar" icon={<CalendarDays className="size-[18px]" />}>
        {status?.connected ? (
          <span className="truncate text-[13px] text-success">{status.email ?? "Connectat"}</span>
        ) : (
          <Button size="sm" variant="tinted" onClick={connect} disabled={busy || !status}>
            Connecta
          </Button>
        )}
      </Row>
      {status?.connected && (
        <>
          <Row label="Sincronitza ara" icon={<RefreshCw className={busy ? "size-[18px] animate-spin" : "size-[18px]"} />} onClick={syncGoogle}>
            <span className="text-[13px]">{status.lastSyncedAt ? `Darrera: ${new Date(status.lastSyncedAt).toLocaleString("ca", { dateStyle: "short", timeStyle: "short" })}` : "Mai"}</span>
          </Row>
          {status.error && <p className="px-4 py-2 text-[12px] text-danger">{status.error}</p>}
          <Row label="Desconnecta" className="text-danger" onClick={disconnect} />
        </>
      )}
    </Group>
  );
}

function SyncSection() {
  const s = useSyncStatus();
  const { local } = useAuth();
  if (local) return null;
  const state = { idle: "Sincronitzat", syncing: "Sincronitzant…", offline: "Sense connexió", error: "Error", local: "Local" }[s.state];
  return (
    <Group title="Sincronització" footer="Els canvis es desen primer al dispositiu i es pugen automàticament quan hi ha connexió.">
      <Row label="Estat">
        <span className="text-[14px]">{state}</span>
      </Row>
      <Row label="Canvis pendents">
        <span className="tabular text-[14px]">{s.pending}</span>
      </Row>
      {s.lastSyncedAt && (
        <Row label="Darrera sincronització">
          <span className="text-[14px]">{new Date(s.lastSyncedAt).toLocaleTimeString("ca", { hour: "2-digit", minute: "2-digit" })}</span>
        </Row>
      )}
      {s.failed > 0 && (
        <>
          <p className="px-4 py-2 text-[13px] text-danger">{s.failed} canvis no s&apos;han pogut desar al servidor. {s.error}</p>
          <Row label="Torna-ho a provar" className="text-accent" onClick={() => void retryFailed()} />
          <Row
            label="Descarta'ls"
            className="text-danger"
            onClick={async () => {
              if (await confirmDialog("Descartar els canvis no desats?", { message: "Es recuperarà la versió del servidor.", confirmLabel: "Descarta", destructive: true })) await discardFailed();
            }}
          />
        </>
      )}
      <Row label="Sincronitza ara" icon={<RefreshCw className="size-[18px]" />} onClick={() => void syncNow()} />
    </Group>
  );
}

function Install() {
  const state = useInstallState();
  if (state === "installed") {
    return (
      <Group title="Aplicació">
        <Row label="Tempo està instal·lada" icon={<Download className="size-[18px]" />}>
          <span className="text-[13px] text-success">Activa</span>
        </Row>
      </Group>
    );
  }
  const footer =
    state === "ios"
      ? "Al Safari: toca el botó Comparteix (el quadrat amb la fletxa) i després «Afegeix a la pantalla d'inici». Obre Tempo sempre des d'aquesta icona."
      : state === "prompt"
        ? "S'afegirà a la pantalla d'inici (mòbil) o a l'escriptori i al menú d'inici (ordinador) i s'obrirà en una finestra pròpia."
        : "Al Chrome o l'Edge: menú ⋮ → «Instal·la Tempo» (o «Aplicacions → Instal·la aquest lloc com una aplicació»). Al Safari del Mac: Arxiu → «Afegeix al Dock».";
  return (
    <Group title="Instal·la l'aplicació" footer={footer}>
      <Row label="Tempo com a aplicació" icon={<Download className="size-[18px]" />}>
        {state === "prompt" && (
          <Button
            size="sm"
            variant="tinted"
            onClick={async () => {
              if (await promptInstall()) toast("Tempo s'ha instal·lat");
            }}
          >
            Instal·la
          </Button>
        )}
      </Row>
    </Group>
  );
}

function Shortcuts() {
  const list: [string, string][] = [
    ["N", "Nou esdeveniment"],
    ["T", "Nova tasca (fora del calendari)"],
    ["D · S · M · A · L", "Vista dia, setmana, mes, any, llista"],
    ["← →", "Anterior / següent"],
    [".", "Anar a avui"],
    ["Esc", "Tancar"],
  ];
  return (
    <div className="hidden md:block">
      <Group title="Dreceres de teclat">
        {list.map(([k, l]) => (
          <Row key={k} label={l}>
            <span className="flex gap-1">
              {k.split(" ").filter((x) => x !== "·").map((x) => (
                <Kbd key={x}>{x}</Kbd>
              ))}
            </span>
          </Row>
        ))}
      </Group>
    </div>
  );
}
