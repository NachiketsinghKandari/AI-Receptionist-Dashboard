import { Navbar } from '@/components/layout/navbar';
import { QueryProvider } from '@/components/providers/query-provider';
import { EnvironmentProvider } from '@/components/providers/environment-provider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <EnvironmentProvider>
        <div className="h-screen flex flex-col bg-background">
          <Navbar />
          <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        </div>
      </EnvironmentProvider>
    </QueryProvider>
  );
}
