interface Props {
  size?: number
  radius?: number
}

export default function Logo({ size = 34, radius = 9 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect width="36" height="36" rx={radius} fill="#5b5bd6" />

      {/*
        Git branch diagram:
        - Main commit at top
        - Fork point mid-left
        - Feature branch goes right
        - Merges back at bottom

        Reads immediately as a git graph to any developer.
        Asymmetric fork = intentional, human, not a generic diamond.
      */}

      {/* Branch lines */}
      <line x1="15" y1="7"  x2="15" y2="29" stroke="white" strokeWidth="2"   strokeLinecap="round" opacity="0.9"/>
      <line x1="15" y1="15" x2="25" y2="21" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.9"/>
      <line x1="25" y1="21" x2="15" y2="27" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.9"/>

      {/* Commit nodes — the "commits" on each branch */}
      <circle cx="15" cy="7"  r="2.8" fill="white" />  {/* head commit */}
      <circle cx="15" cy="15" r="2.2" fill="white" />  {/* fork point */}
      <circle cx="25" cy="21" r="2.8" fill="white" />  {/* feature commit */}
      <circle cx="15" cy="27" r="2.8" fill="white" />  {/* merge commit */}
    </svg>
  )
}
