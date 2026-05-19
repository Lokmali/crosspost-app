import { ArrowRight, Calendar, Shield, Zap } from "lucide-react";
import { ConnectToNearButton } from "@/components/connect-to-near";
import { Button } from "@/components/ui/button";

function MarqueeXIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-primary"
      aria-hidden
    >
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="currentColor"
      />
    </svg>
  );
}

const marqueeChip =
  "mx-5 inline-flex items-center gap-1.5 text-sm font-bold text-foreground sm:mx-8 sm:gap-2 sm:text-lg";

function MarqueeSegment({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" {...(ariaHidden ? { "aria-hidden": true as const } : {})}>
      <span className={marqueeChip}>
        <MarqueeXIcon />
        MULTI-PLATFORM POSTING
      </span>
      <span className={marqueeChip}>
        <Calendar size={20} className="shrink-0 text-primary/90" aria-hidden />
        SCHEDULE POSTS
      </span>
      <span className={marqueeChip}>
        <Zap size={20} className="shrink-0 text-muted-foreground" aria-hidden />
        LIGHTNING FAST
      </span>
      <span className={marqueeChip}>
        <Shield size={20} className="shrink-0 text-primary/70" aria-hidden />
        SECURE & PRIVATE
      </span>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-[80vh] -mx-2 -mt-2 sm:-mx-4 sm:-mt-4 md:-mx-8 md:-mt-8">
      <div className="flex flex-col items-center justify-center px-4 py-10 sm:py-16 md:py-20">
        <div className="mx-auto max-w-4xl space-y-6 text-center">
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight">
              Share Your Content
              <br />
              Everywhere at Once
        </h1>

          <p className="mx-auto max-w-2xl px-2 text-sm text-muted-foreground sm:px-0 sm:text-lg">
            Post to Twitter, Farcaster, and more social platforms simultaneously. Save time, reach more people, and
            manage everything from one place.
          </p>
          <div className="mx-auto flex w-full max-w-md flex-col items-stretch justify-center gap-3 pt-4 sm:max-w-none sm:flex-row sm:items-center sm:gap-4 sm:pt-6">
            <ConnectToNearButton />
            <Button asChild className="w-full sm:w-auto">
              <a href="https://github.com/open-crosspost" target="_blank" rel="noopener noreferrer">
                View on GitHub
                <ArrowRight size={16} />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 md:px-10">
        <div className="border-y-2 border-primary bg-muted/30 py-4 overflow-hidden">
          <div className="flex w-max items-center animate-marquee whitespace-nowrap">
            <MarqueeSegment />
            <MarqueeSegment ariaHidden />
            <MarqueeSegment ariaHidden />
            <MarqueeSegment ariaHidden />
          </div>
        </div>
      </div>

      {/* Supported Platforms */}
      <div className="px-4 py-10 sm:py-12 max-w-4xl mx-auto text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6">Supported Platforms</h2>
          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-8">
            <div className="flex items-center gap-2 text-sm sm:text-base font-medium">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                  fill="currentColor"
                />
              </svg>
              <span>Twitter</span>
            </div>
            <div className="flex items-center gap-2 text-sm sm:text-base font-medium">
              <img
                src="/platforms/farcaster.svg"
                alt="Farcaster"
                className="w-5 h-5"
              />
              <span>Farcaster</span>
            </div>
            <div className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
              + More coming soon
            </div>
          </div>
        </div>
      </div>
  );
}
