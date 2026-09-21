import { Sidebar } from "@/components/Sidebar";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto max-sm:pb-16">{children}</main>
    </div>
  );
}
