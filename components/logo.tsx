export function BrandedLogo({
  logoUrl,
  displayName,
  className,
}: {
  logoUrl?: string | null;
  displayName?: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={displayName || 'Logo'} className={className} />
    );
  }
  return <span className={className}>{displayName || 'AI Receptionist'}</span>;
}
