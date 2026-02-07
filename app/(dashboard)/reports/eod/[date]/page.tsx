'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useEnvironment } from '@/components/providers/environment-provider';
import { useReportByDate } from '@/hooks/use-eod-reports';
import { ReportDetailView } from '@/components/reports/report-detail-view';
import { Loader2, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function EODReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { environment, setEnvironment } = useEnvironment();

  const dateParam = params.date as string;
  const urlEnv = searchParams.get('e');

  // Sync environment from URL on mount
  useEffect(() => {
    if (urlEnv && (urlEnv === 'production' || urlEnv === 'staging') && urlEnv !== environment) {
      setEnvironment(urlEnv);
    }
  }, []); // Only run on mount

  const { data, isLoading, error } = useReportByDate(dateParam, 'eod', urlEnv || environment);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.report) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Report Not Found</h2>
          <p className="text-muted-foreground mb-4">
            {error?.message || `No EOD report found for ${dateParam}`}
          </p>
          <Button asChild>
            <Link href="/reports">
              <FileText className="h-4 w-4 mr-2" />
              View All Reports
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ReportDetailView
      report={data.report}
      reportType="eod"
      onBack={() => router.push('/reports')}
    />
  );
}
