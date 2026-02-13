import { Navbar } from '@/components/layout/navbar';
import { QueryProvider } from '@/components/providers/query-provider';
import { EnvironmentProvider } from '@/components/providers/environment-provider';
import { ClientConfigProvider } from '@/components/providers/client-config-provider';
import { DateFilterProvider } from '@/components/providers/date-filter-provider';
import { AuthListenerProvider } from '@/components/providers/auth-listener-provider';
import { ChatPanel } from '@/components/chat/chat-panel';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <AuthListenerProvider>
        <EnvironmentProvider>
          <ClientConfigProvider>
            <DateFilterProvider>
              <div className="h-screen flex flex-col bg-background">
                <Navbar />
                <main className="flex-1 min-h-0 overflow-auto">{children}</main>
              </div>
              <ChatPanel />
            </DateFilterProvider>
          </ClientConfigProvider>
        </EnvironmentProvider>
      </AuthListenerProvider>
    </QueryProvider>
  );
}
