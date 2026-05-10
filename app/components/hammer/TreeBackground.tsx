function Tree({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 166" fill="currentColor" className={className} aria-hidden="true">
      <polygon points="50,2 82,48 18,48" />
      <polygon points="50,28 90,86 10,86" />
      <polygon points="50,55 100,126 0,126" />
      <rect x="43" y="126" width="14" height="38" />
    </svg>
  );
}

export function TreeBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden text-green-600">
      {/* left edge */}
      <Tree className="absolute -bottom-4 -left-14 h-[540px] opacity-35" />
      <Tree className="absolute bottom-0 left-4 h-[290px] opacity-20" />
      <Tree className="absolute bottom-0 left-[8%] h-[170px] opacity-10" />
      {/* left mid */}
      <Tree className="absolute -bottom-1 left-[15%] h-[380px] opacity-15" />
      <Tree className="absolute bottom-0 left-[22%] h-[200px] opacity-10" />
      <Tree className="absolute bottom-0 left-[30%] h-[250px] opacity-10" />
      <Tree className="absolute bottom-0 left-[38%] h-[150px] opacity-5" />
      {/* centre */}
      <Tree className="absolute bottom-0 left-[46%] h-[210px] opacity-10" />
      <Tree className="absolute bottom-0 right-[44%] h-[160px] opacity-5" />
      {/* right mid */}
      <Tree className="absolute bottom-0 right-[30%] h-[240px] opacity-10" />
      <Tree className="absolute bottom-0 right-[22%] h-[185px] opacity-10" />
      <Tree className="absolute -bottom-1 right-[15%] h-[360px] opacity-15" />
      <Tree className="absolute bottom-0 right-[8%] h-[190px] opacity-10" />
      {/* right edge */}
      <Tree className="absolute bottom-0 right-4 h-[300px] opacity-20" />
      <Tree className="absolute -bottom-4 -right-14 h-[560px] opacity-35" />
    </div>
  );
}
