import { ArrowUpRight, GithubLogo } from "@phosphor-icons/react/dist/ssr";

const LINKS = {
  site: "https://muhammadmurtuza.com",
  challenge: "https://dev.to/challenges/hacktoberfest-week1-2026-10-05",
  repo: "https://github.com/MuhammadMurtuzaHussain/return-route",
};

export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`mt-14 border-t-2 border-dashed border-line pt-6 text-[14px] leading-relaxed text-muted ${className}`}>
      <p>
        Made by{" "}
        <a href={LINKS.site} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-mark decoration-2 underline-offset-4 hover:decoration-ink">
          Muhammad Murtuza Hussain
        </a>
        .
      </p>
      <p className="mt-1">
        Made for the{" "}
        <a href={LINKS.challenge} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-line underline-offset-4 hover:decoration-mark">
          Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass
        </a>
        .
      </p>
      <nav aria-label="Project links" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[12px] uppercase">
        <a href={LINKS.site} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 hover:text-ink">
          muhammadmurtuza.com
          <ArrowUpRight size={13} />
        </a>
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 hover:text-ink">
          <GithubLogo size={14} />
          Source, MIT
        </a>
      </nav>
    </footer>
  );
}
