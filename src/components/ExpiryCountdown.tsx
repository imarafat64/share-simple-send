import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface ExpiryCountdownProps {
  expiresAt: string;
  className?: string;
}

export const ExpiryCountdown = ({ expiresAt, className = '' }: ExpiryCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const difference = expiry - now;

      if (difference <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      // Mark as expiring soon if less than 24 hours
      setIsExpiringSoon(difference < 24 * 60 * 60 * 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Clock className={`h-4 w-4 ${isExpiringSoon ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
      <span className={`text-sm font-medium ${isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'}`}>
        {timeLeft === 'Expired' ? 'Expired' : `Expires in ${timeLeft}`}
      </span>
    </div>
  );
};
