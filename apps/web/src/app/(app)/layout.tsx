import { Announcement, AnnouncerProvider } from "@/components/announcer";
import { AppHeader } from "@/components/app-header";
import { TimeZoneSync } from "@/components/time-zone-sync";

// The app shell: a centred column with side padding that stays readable on a desktop
// instead of stretching edge to edge. No bottom tabs in M3 (decision 0005).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-4 sm:px-6">
      <TimeZoneSync />
      {/* The provider keeps "Changes saved." / "Workout deleted." alive across the page change that follows. */}
      <AnnouncerProvider>
        <AppHeader />
        <Announcement />
        <main className="flex flex-1 flex-col gap-4">{children}</main>
      </AnnouncerProvider>
    </div>
  );
}
