import { AppHeader } from "@/components/app-header";

// The app shell: a centred column with side padding that stays readable on a desktop
// instead of stretching edge to edge. No bottom tabs in M3 (decision 0005).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 sm:px-6">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-4">{children}</main>
    </div>
  );
}
