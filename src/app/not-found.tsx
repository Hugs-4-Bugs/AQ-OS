import { Search, Rocket } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-30" />
        <div className="relative h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Search className="h-10 w-10 text-primary/60" />
        </div>
      </div>
      <h2 className="text-2xl font-bold mb-2 gradient-text">404</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        Page not found. The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <a
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
      >
        <Rocket className="h-4 w-4" />
        Back to Dashboard
      </a>
    </div>
  );
}
