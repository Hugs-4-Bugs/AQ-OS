import { Rocket } from 'lucide-react';

export default function Loading() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <div className="relative h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Rocket className="h-8 w-8 text-primary animate-pulse" />
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">Loading AcquisitionOS...</p>
    </div>
  );
}
