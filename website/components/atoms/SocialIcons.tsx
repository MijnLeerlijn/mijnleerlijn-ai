// Lucide bevat sinds enkele versies geen merk-/social-iconen meer.
// Eenvoudige, generieke lijniconen als functioneel equivalent voor het prototype.

export interface SocialIconProps {
  size?: number;
  className?: string;
}

export function InstagramIcon({ size = 16, className = "" }: SocialIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function LinkedinIcon({ size = 16, className = "" }: SocialIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="9" r="1" fill="currentColor" />
      <path d="M8 11.5V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M12 17v-3.2c0-1.3 1-2.3 2.2-2.3s2.1 1 2.1 2.3V17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FacebookIcon({ size = 16, className = "" }: SocialIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M13.5 21v-6.5H15.5l0.3-2.3H13.5V10.7c0-.7.2-1.2 1.2-1.2H16V7.4c-.3 0-1-.1-1.9-.1-1.9 0-3.1 1.1-3.1 3.2v1.7H9v2.3h2v6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
